from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
import uvicorn
import asyncio
from sniffer import NetworkSniffer
from timestamp_engine import TimestampEngine, mac_lookup
from config import API_KEY, BROADCAST_INTERVAL_SECONDS

app = FastAPI()

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

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
