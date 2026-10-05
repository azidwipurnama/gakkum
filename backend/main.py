from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, Request, Header, HTTPException, status
from supabase import create_client
from models import AgentReport
from utils import verify_api_key
from anomaly import AnomalyDetector
import uvicorn
import asyncio
import time
from sniffer import NetworkSniffer
from timestamp_engine import TimestampEngine, mac_lookup
from config import API_KEY, BROADCAST_INTERVAL_SECONDS, SUPABASE_URL, SUPABASE_KEY

app = FastAPI()

# Supabase Client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Initialize anomaly detector
anomaly_detector = AnomalyDetector(supabase, lambda msg: manager.broadcast_json(msg))

# Simple in-memory rate limiter: {agent_id: last_request_time}
agent_request_times = {}

from get_ssid import get_active_ssid

# Initialize Engine and Sniffer
engine = TimestampEngine()
sniffer = NetworkSniffer(engine)

# Connection Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast_json(self, message: dict):
        for connection in self.active_connections:
            await connection.send_json(message)

manager = ConnectionManager()

@app.on_event("startup")
async def startup_event():
    # Update OUI Database asynchronously
    if mac_lookup:
        async def update_mac_db():
            try:
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, mac_lookup.update_vendors)
                print("[SUCCESS] OUI Database updated successfully.")
            except Exception as e:
                print(f"Gagal update OUI via internet: {e}")

        asyncio.create_task(update_mac_db())

    # Start sniffer in a background thread
    import threading
    threading.Thread(target=sniffer.launch, daemon=True).start()

    # Start status check loop
    asyncio.create_task(status_check_loop())

    # Start broadcast loop
    asyncio.create_task(broadcast_loop())

async def status_check_loop():
    while True:
        engine.check_status()
        await asyncio.sleep(10)

async def broadcast_loop():
    while True:
        payload = engine.get_full_payload()

        # Add server IP to metrics
        payload["metrics"]["server_ip"] = sniffer.local_ip
        # Add SSID to payload
        payload["ssid"] = get_active_ssid()

        print(f"[DEBUG WS] Broadcasting to {len(manager.active_connections)} client(s): {payload['type']}, devices={len(payload.get('devices', []))}, up={payload['metrics'].get('total_up', 0)}, down={payload['metrics'].get('total_down', 0)}")
        await manager.broadcast_json(payload)
        await asyncio.sleep(BROADCAST_INTERVAL_SECONDS)

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.websocket("/ws/network-monitor")
async def websocket_endpoint(
    websocket: WebSocket,
    api_key: str = Query(...)
):
    if api_key != API_KEY:
        await websocket.close(code=1008)
        return

    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.post("/api/agent/report", status_code=status.HTTP_201_CREATED)
async def agent_report(
    report: AgentReport,
    request: Request,
    x_api_key: str = Header(...)
):
    # 0. Rate limit check (e.g., 1 request per 4 seconds)
    now = time.time()
    last_time = agent_request_times.get(report.agent_id)
    if last_time and (now - last_time) < 4:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded"
        )
    agent_request_times[report.agent_id] = now

    # 1. Fetch agent record
    response = supabase.table("agents").select("*").eq("agent_id", report.agent_id).single().execute()
    agent = response.data

    if not agent:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid agent")

    # 2. Check active status
    if not agent.get("active"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Agent inactive")

    # 3. Verify key
    if not verify_api_key(x_api_key, agent["key_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")

    # 4. IP Check (Origin)
    client_ip = request.client.host
    device_response = supabase.table("devices").select("ip").eq("id", agent["device_id"]).single().execute()
    device = device_response.data

    # Flag for mismatch
    ip_mismatch = device and device.get("ip") != client_ip

    # 5. Insert samples
    samples = []
    for iface in report.interfaces:
        samples.append({
            "agent_id": report.agent_id,
            "device_id": agent["device_id"],
            "ts": datetime.fromtimestamp(report.timestamp).isoformat(), # Convert epoch to ISO string
            "interface_name": iface.name,
            "bytes_sent": iface.bytes_sent,
            "bytes_recv": iface.bytes_recv,
            "packets_sent": iface.packets_sent,
            "packets_recv": iface.packets_recv
        })

    print(f"[DEBUG] Inserting samples: {samples}") # Debugging
    try:
        supabase.table("agent_samples").insert(samples).execute()
        print("[DEBUG] Insert successful")
    except Exception as e:
        print(f"[DEBUG] Insert failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    # Run anomaly detection
    await anomaly_detector.process_report(report.agent_id, agent["device_id"], [i.dict() for i in report.interfaces], report.timestamp)

    # 6. Update agent last_seen
    supabase.table("agents").update({"last_seen": "now()"}).eq("agent_id", report.agent_id).execute()

    return {"status": "ok", "ip_mismatch": ip_mismatch}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
