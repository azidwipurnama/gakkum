import uvicorn
import asyncio
import json
import time
import random
from datetime import datetime, timezone
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, Request, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client
from models import AgentReport
from utils import verify_api_key
from anomaly import AnomalyDetector
from sniffer import NetworkSniffer
from timestamp_engine import TimestampEngine, mac_lookup
from config import (
    API_KEY,
    BROADCAST_INTERVAL_SECONDS,
    SUPABASE_URL,
    SUPABASE_KEY,
    SSID_CACHE_SECONDS,
    BSSID_CACHE_SECONDS,
    AGENT_REPORT_RATE_LIMIT_SECONDS,
    WATCHDOG_CHECK_INTERVAL_SECONDS,
    WATCHDOG_STALL_FACTOR,
    HEARTBEAT_LOG_INTERVAL_SECONDS,
    SNIFFER_RESTART_DELAY_SECONDS,
    NETSH_TIMEOUT_SECONDS,
    BROADCAST_SEND_TIMEOUT_SECONDS,
    MONITORING_INTERVAL_SECONDS
)
from workers import BackgroundWorkers, persist_rows, resolve_hostname, ping_latency
from supabase_payload import build_device_upsert_payload
from monitoring import run_monitoring_pass
import threading

app = FastAPI()

# Dashboard Next.js berjalan di origin berbeda (mis. localhost:3000), sehingga
# endpoint REST detail perangkat perlu mengizinkan permintaan lintas origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Supabase Client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Initialize anomaly detector
anomaly_detector = AnomalyDetector(
    supabase,
    lambda msg: manager.broadcast_json(msg),
    lambda: _is_persist_allowed(),
)

# Simple in-memory rate limiter: {agent_id: last_request_time}
agent_request_times = {}

from get_ssid import get_active_ssid, is_target_ssid
from wifi_bssid import get_host_bssid

# Initialize Engine and Sniffer
engine = TimestampEngine()
workers = BackgroundWorkers(supabase)
shutdown_event = threading.Event()
sniffer = NetworkSniffer(engine, workers, shutdown_event)

# Connection Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast_json(self, message: dict):
        # Iterate over a copy to avoid modification during iteration.
        # Each send is bounded by a timeout so one stalled/dead client
        # (send buffer penuh, tidak membaca) tidak membekukan seluruh
        # broadcast loop — koneksi yang timeout ditutup dan dibuang.
        for connection in list(self.active_connections):
            try:
                await asyncio.wait_for(connection.send_json(message), timeout=BROADCAST_SEND_TIMEOUT_SECONDS)
            except Exception:
                # Remove dead/stalled connections
                self.disconnect(connection)
                try:
                    await asyncio.wait_for(connection.close(), timeout=2)
                except Exception:
                    pass

manager = ConnectionManager()

# --- CACHE REFRESHERS ---
_ssid_cache = {"value": None, "timestamp": 0.0, "allowed": False}
_bssid_cache = {"value": None, "timestamp": 0.0}

def _is_persist_allowed() -> bool:
    """Check if Supabase persistence is allowed based on cached SSID."""
    return _ssid_cache["allowed"]

def refresh_ssid_cache():
    """Background task to refresh SSID cache."""
    global _ssid_cache
    ssid = get_active_ssid(timeout=NETSH_TIMEOUT_SECONDS)
    _ssid_cache["value"] = ssid
    _ssid_cache["allowed"] = is_target_ssid(ssid)
    _ssid_cache["timestamp"] = time.time()
    if not _ssid_cache["allowed"]:
        print(f"[INFO] Supabase device sync skipped (SSID is not GAKKUM WING-C): {ssid}")

def refresh_bssid_cache():
    """Background task to refresh BSSID cache."""
    global _bssid_cache
    bssid = get_host_bssid()
    _bssid_cache["value"] = bssid
    _bssid_cache["timestamp"] = time.time()

def get_cached_host_bssid():
    """Get cached host BSSID."""
    return _bssid_cache["value"]

# --- RETRY LOGIC ---
async def supabase_retry_execute(operation, max_attempts=5):
    """
    Executes a Supabase operation with exponential backoff and jitter.
    Respects Retry-After header if present.
    """
    attempt = 0
    while attempt < max_attempts:
        try:
            return operation().execute()
        except Exception as e:
            error_msg = str(e).lower()
            if "429" in error_msg or "too many requests" in error_msg:
                attempt += 1
                if attempt >= max_attempts:
                    print(f"[CRITICAL] Supabase 429: Max attempts reached. Giving up.")
                    raise e

                # Extract Retry-After if possible (simplistic check)
                retry_after = 0
                if "retry-after" in error_msg:
                    import re
                    match = re.search(r'retry-after:?\s*(\d+)', error_msg)
                    if match:
                        retry_after = int(match.group(1))

                # Exponential backoff: 1, 2, 4, 8, 16... with jitter
                sleep_time = retry_after if retry_after > 0 else (2 ** (attempt - 1)) + random.uniform(0, 1)

                # Log 429 warning only once per minute (approximate)
                now = time.time()
                if not hasattr(supabase_retry_execute, "_last_429_log") or (now - supabase_retry_execute._last_429_log) > 60:
                    print(f"[WARNING] Supabase 429 detected. Retrying in {sleep_time:.2f}s (Attempt {attempt}/{max_attempts})")
                    supabase_retry_execute._last_429_log = now

                await asyncio.sleep(sleep_time)
            else:
                # Not a rate limit error, raise immediately
                raise e

@app.on_event("startup")
async def startup_event():
    print("[STARTUP] Initializing backend components...")

    # 1. OUI Database / mac_lookup
    try:
        if mac_lookup:
            async def update_mac_db():
                try:
                    loop = asyncio.get_running_loop()
                    await loop.run_in_executor(None, mac_lookup.update_vendors)
                    print("[SUCCESS] OUI Database updated successfully.")
                except Exception as e:
                    print(f"[WARNING] Gagal update OUI via internet: {e}")

            asyncio.create_task(update_mac_db())
    except Exception as e:
        print(f"[WARNING] Component mac_lookup failed: {e}")

    # 2. Workers
    try:
        workers.start()
    except Exception as e:
        print(f"[WARNING] Component workers failed: {e}")

    # 3. Sniffer
    try:
        threading.Thread(target=sniffer.launch, daemon=True).start()
    except Exception as e:
        print(f"[WARNING] Component sniffer failed: {e}")

    # 4. Cache Refreshers
    try:
        asyncio.create_task(ssid_refresher())
        asyncio.create_task(bssid_refresher())
    except Exception as e:
        print(f"[WARNING] Component cache_refreshers failed: {e}")

    # 5. Loop Tasks
    try:
        asyncio.create_task(status_check_loop())
        asyncio.create_task(broadcast_loop())
        asyncio.create_task(watchdog_loop())
        asyncio.create_task(heartbeat_log_loop())
        asyncio.create_task(monitoring_loop())
    except Exception as e:
        print(f"[WARNING] Component loops failed: {e}")

    print("[STARTUP] Application startup complete.")

async def ssid_refresher():
    while not shutdown_event.is_set():
        workers.submit("ssid_refresh", refresh_ssid_cache)
        await asyncio.sleep(SSID_CACHE_SECONDS)

async def bssid_refresher():
    while not shutdown_event.is_set():
        workers.submit("bssid_refresh", refresh_bssid_cache)
        await asyncio.sleep(BSSID_CACHE_SECONDS)

async def status_check_loop():
    while not shutdown_event.is_set():
        try:
            engine.mark_heartbeat("status_check_loop")
            engine.check_status()
        except Exception as e:
            print(f"[ERROR] Status check loop failed: {e}")
        await asyncio.sleep(10)

async def broadcast_loop():
    while not shutdown_event.is_set():
        try:
            # Tanpa heartbeat ini watchdog_loop melihat age = inf dan menulis
            # "broadcast_loop stalled" tiap 5 detik meski loop sehat.
            engine.mark_heartbeat("broadcast_loop")

            # Apply host BSSID (cached, refreshed by bssid_refresher)
            engine.apply_host_bssid(get_cached_host_bssid())

            # ARP replies message
            arp_replies = engine.get_recent_replies()
            if arp_replies:
                await manager.broadcast_json({
                    "type": "arp_replies",
                    "data": arp_replies
                })

            # Build payload
            payload = engine.get_full_payload()

            # Deteksi dini payload yang tidak bisa diserialisasi JSON agar
            # kegagalan besar tidak diam-diam menjatuhkan koneksi klien.
            try:
                json.dumps(payload)
            except TypeError as e:
                print(f"[ERROR] Payload DEVICE_UPDATE tidak serialisabel: {e}")
                # Fallback: kirim payload kosong yang pasti valid supaya
                # koneksi tidak tergantung pada bug ini, dan log jelas.
                payload = {"type": "DEVICE_UPDATE", "devices": [], "metrics": {"total_up": 0, "total_down": 0}}

            # Add server IP to metrics
            payload["metrics"]["server_ip"] = sniffer.local_ip
            # Add SSID to payload using cached value to avoid blocking the broadcast loop
            payload["ssid"] = _ssid_cache["value"] or "Unknown Network"

            # --- SUPABASE SYNC DISABLED ---
            # Sync to Supabase is disabled to allow updates regardless of SSID
            # To enable again, replace the following line with: if _is_persist_allowed():
            if False:
                dirty_devices = engine.get_dirty_devices()
                if dirty_devices:
                    prepared_dirty = build_device_upsert_payload(dirty_devices)
                    if prepared_dirty:
                        workers.submit(
                            "devices_upsert",
                            persist_rows,
                            supabase,
                            "devices",
                            prepared_dirty,
                            "upsert"
                        )
                        engine.clear_dirty()

                now = datetime.now()
                if not hasattr(broadcast_loop, "_last_full_sync") or (now.timestamp() - broadcast_loop._last_full_sync) > 30:
                    engine.mark_all_dirty()
                    broadcast_loop._last_full_sync = now.timestamp()

            # Broadcast to clients
            print(f"[DEBUG WS] Broadcasting to {len(manager.active_connections)} client(s): {payload['type']}, devices={len(payload.get('devices', []))}, up={payload['metrics'].get('total_up', 0)}, down={payload['metrics'].get('total_down', 0)}")
            await manager.broadcast_json(payload)

        except Exception as e:
            print(f"[ERROR] Broadcast loop failed: {e}")

        await asyncio.sleep(BROADCAST_INTERVAL_SECONDS)

@app.get("/api/debug/devices")
async def debug_devices():
    return {
        "count": len(engine.devices),
        "devices": [mac for mac in engine.devices.keys()],
        "dirty_count": len(engine.dirty_devices)
    }

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.get("/api/device/{mac}/network")
async def device_network_details(
    mac: str,
    api_key: str = Query(...)
):
    if api_key != API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key"
        )

    details = engine.get_network_details(mac)
    if details is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found or unknown MAC"
        )
    return details


# ============================================================
# ENDPOINT PEMANTAUAN
# ============================================================

def _require_api_key(api_key: str):
    if api_key != API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key"
        )


_schema_cache = {"checked_at": 0.0, "ready": False, "error": None}


async def _schema_state(force: bool = False):
    """Status kesiapan tabel monitoring, di-cache 60 detik.

    Cek ini menyentuh Supabase, jadi jangan dijalankan tiap request UI tanpa
    cache — panel bisa di-reload berkali-kali dalam semenit.
    """
    from monitoring import check_schema

    now = time.time()
    if not force and now - _schema_cache["checked_at"] < 60:
        return _schema_cache["ready"], _schema_cache["error"]

    loop = asyncio.get_running_loop()
    ready, err = await loop.run_in_executor(None, check_schema, supabase)
    _schema_cache.update({"checked_at": now, "ready": ready, "error": err})
    return ready, err


@app.get("/api/monitoring/status")
async def monitoring_status(api_key: str = Query(...)):
    """Status siklus pemantauan terakhir + konfigurasi yang dipakai."""
    from config import (
        MONITORING_INTERVAL_SECONDS as interval,
        MONITORING_BASELINE_DAYS as baseline_days,
        MONITORING_RETENTION_DAYS as retention_days,
        MONITORING_LATENCY_SHIFT_FACTOR as latency_factor,
    )
    _require_api_key(api_key)
    schema_ready, schema_error = await _schema_state()
    return {
        **_monitoring_state,
        "schema_ready": schema_ready,
        "schema_error": schema_error,
        "interval_seconds": interval,
        "baseline_days": baseline_days,
        "retention_days": retention_days,
        "latency_shift_factor": latency_factor,
        "current_ssid": _ssid_cache["value"],
        "current_bssid": get_cached_host_bssid(),
        "devices_tracked": len(engine.devices),
    }


@app.get("/api/monitoring/alerts")
async def monitoring_alerts(
    api_key: str = Query(...),
    limit: int = Query(50, ge=1, le=500),
    rule_type: str | None = Query(None),
):
    """Temuan aturan perbandingan, terbaru lebih dulu."""
    _require_api_key(api_key)
    try:
        q = supabase.table("monitoring_alerts").select("*").order("ts", desc=True).limit(limit)
        if rule_type:
            q = q.eq("rule_type", rule_type)
        res = q.execute()
        return {"count": len(res.data or []), "alerts": res.data or [], "migration_required": False}
    except Exception as e:
        msg = str(e)
        # Tabel belum dibuat -> bukan kegagalan server, cukup beri tahu UI.
        if "PGRST205" in msg or "schema cache" in msg:
            return {"count": 0, "alerts": [], "migration_required": True, "error": msg[:200]}
        raise HTTPException(status_code=502, detail=f"Gagal query monitoring_alerts: {e}")


@app.get("/api/monitoring/summary")
async def monitoring_summary(api_key: str = Query(...)):
    """Ringkasan hasil aturan: perangkat baru, hilang, dan lonjakan trafik."""
    from monitoring import (
        detect_new_devices,
        detect_disappeared_devices,
        detect_traffic_spike,
        _baseline_ready,
    )
    _require_api_key(api_key)

    schema_ready, schema_error = await _schema_state()
    if not schema_ready:
        return {
            "schema_ready": False,
            "schema_error": schema_error,
            "baseline_ready": False,
            "new_devices": [],
            "disappeared_devices": [],
            "traffic_spikes": [],
        }

    loop = asyncio.get_running_loop()
    new_devs = await loop.run_in_executor(None, detect_new_devices, supabase)
    gone_devs = await loop.run_in_executor(None, detect_disappeared_devices, supabase)
    spikes = await loop.run_in_executor(None, detect_traffic_spike, supabase)
    ready = await loop.run_in_executor(None, _baseline_ready, supabase)

    return {
        "schema_ready": True,
        "schema_error": None,
        "baseline_ready": ready,
        "new_devices": new_devs,
        "disappeared_devices": gone_devs,
        "traffic_spikes": spikes,
    }


@app.get("/api/monitoring/device/{mac}/history")
async def monitoring_device_history(
    mac: str,
    api_key: str = Query(...),
    days: int = Query(7, ge=1, le=30),
):
    """Riwayat aktivitas satu MAC (untuk grafik/inspeksi)."""
    from datetime import timedelta

    _require_api_key(api_key)
    mac_l = mac.lower()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    try:
        res = (
            supabase.table("device_activity")
            .select("*")
            .eq("mac", mac_l)
            .gte("ts", cutoff)
            .order("ts", desc=True)
            .limit(200)
            .execute()
        )
        rows = res.data or []
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gagal query device_activity: {e}")

    try:
        daily = supabase.rpc(
            "device_traffic_daily", {"p_mac": mac_l, "days": days}
        ).execute().data or []
    except Exception as e:
        print(f"[MONITOR] RPC device_traffic_daily gagal: {e}")
        daily = []

    return {
        "mac": mac_l,
        "days": days,
        "samples": rows,
        "daily_packets": daily,
    }


@app.post("/api/monitoring/run")
async def monitoring_run_now(api_key: str = Query(...)):
    """Jalankan satu siklus pemantauan sekarang (tanpa menunggu interval)."""
    _require_api_key(api_key)
    loop = asyncio.get_running_loop()
    started = time.time()
    try:
        result = await loop.run_in_executor(None, _run_monitoring_cycle)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Siklus gagal: {e}")

    _monitoring_state["last_run_at"] = datetime.now().isoformat()
    _monitoring_state["last_duration_seconds"] = round(time.time() - started, 2)
    _monitoring_state["last_alert_count"] = len(result["alerts"])
    _monitoring_state["last_snapshot_devices"] = result["devices"]
    _monitoring_state["last_activity_devices"] = result["activity"]
    _monitoring_state["last_error"] = None
    _monitoring_state["runs"] += 1

    return {
        "ok": True,
        "duration_seconds": _monitoring_state["last_duration_seconds"],
        "devices": result["devices"],
        "activity": result["activity"],
        "alerts": result["alerts"],
    }

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
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.post("/api/agent/report", status_code=status.HTTP_201_CREATED)
async def agent_report(
    report: AgentReport,
    request: Request,
    x_api_key: str = Header(...)
):
    # Rate limit check
    now = time.time()
    last_time = agent_request_times.get(report.agent_id)
    if last_time and (now - last_time) < AGENT_REPORT_RATE_LIMIT_SECONDS:
        retry_after = int(AGENT_REPORT_RATE_LIMIT_SECONDS - (now - last_time))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Please retry after {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)}
        )
    agent_request_times[report.agent_id] = now

    # Fetch agent record
    try:
        response = await supabase_retry_execute(
            lambda: supabase.table("agents").select("*").eq("agent_id", report.agent_id).single()
        )
        agent = response.data
    except Exception as e:
        print(f"[DEBUG] Failed to fetch agent: {e}")
        raise HTTPException(status_code=500, detail="Database error")

    if not agent:
        print(f"[DEBUG] 401 Unauthorized: Invalid agent ID: {report.agent_id}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid agent")

    # Check active status
    if not agent.get("active"):
        print(f"[DEBUG] 401 Unauthorized: Agent inactive: {report.agent_id}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Agent inactive")

    # Verify key
    if not verify_api_key(x_api_key, agent.get("key_hash", "")):
        print(f"[DEBUG] 401 Unauthorized: API Key mismatch for agent ID: {report.agent_id}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")

    # IP Check (Origin)
    client_ip = request.client.host
    try:
        device_response = await supabase_retry_execute(
            lambda: supabase.table("devices").select("ip").eq("id", agent["device_id"]).single()
        )
        device = device_response.data
    except Exception as e:
        print(f"[DEBUG] Failed to fetch device IP: {e}")
        device = None

    ip_mismatch = device and device.get("ip") != client_ip

    # Insert samples (offload to workers if Supabase allowed)
    samples = []
    for iface in report.interfaces:
        samples.append({
            "agent_id": report.agent_id,
            "device_id": agent["device_id"],
            "ts": datetime.fromtimestamp(report.timestamp).isoformat(),
            "interface_name": iface.name,
            "bytes_sent": iface.bytes_sent,
            "bytes_recv": iface.bytes_recv,
            "packets_sent": iface.packets_sent,
            "packets_recv": iface.packets_recv
        })

    if _is_persist_allowed() and samples:
        workers.submit(
            "agent_samples_insert",
            persist_rows,
            supabase,
            "agent_samples",
            samples,
            "insert"
        )
    else:
        if samples:
            print("[INFO] Supabase agent_samples insert skipped (SSID is not GAKKUM WING-C)")

    # Run anomaly detection (keep awaited as it's lightweight)
    try:
        await anomaly_detector.process_report(
            report.agent_id,
            agent["device_id"],
            [i.dict() for i in report.interfaces],
            report.timestamp
        )
    except Exception as e:
        print(f"[ERROR] Anomaly detection failed: {e}")

    # Update agent last_seen (offload to workers if Supabase allowed)
    if _is_persist_allowed():
        # Update harus punya filter .eq(); persist_rows(mode="update") tidak
        # menambahkan WHERE sehingga PostgREST menolak dengan kode 21000.
        workers.submit(
            "agent_last_seen_update",
            lambda: supabase.table("agents").update({"last_seen": "now()"}).eq("agent_id", report.agent_id).execute()
        )
    else:
        if agent:
            print("[INFO] Supabase agent last_seen update skipped (SSID is not GAKKUM WING-C)")

    return {"status": "ok", "ip_mismatch": ip_mismatch}

@app.on_event("shutdown")
def shutdown_event_handler():
    print("[SHUTDOWN] Initiating shutdown...")
    shutdown_event.set()
    workers.stop()

async def watchdog_loop():
    while not shutdown_event.is_set():
        try:
            engine.mark_heartbeat("watchdog_loop")

            # Check if sniffer threads are alive (basic check)
            # In a more sophisticated version, we'd check specific component heartbeats
            # For now, we rely on the heartbeat logs from components

            # Check if broadcast loop is responsive
            broadcast_age = engine.heartbeat_age("broadcast_loop")
            status_age = engine.heartbeat_age("status_check_loop")

            if broadcast_age > (WATCHDOG_CHECK_INTERVAL_SECONDS * WATCHDOG_STALL_FACTOR):
                # Loop ini tidak punya mekanisme restart; log saja supaya
                # penyebab dasbor berhenti update terlihat di server.log.
                print(f"[WATCHDOG] broadcast_loop tidak heartbeat selama {broadcast_age:.0f}s")

            if status_age > (WATCHDOG_CHECK_INTERVAL_SECONDS * WATCHDOG_STALL_FACTOR):
                print(f"[WATCHDOG] status_check_loop tidak heartbeat selama {status_age:.0f}s")

        except Exception as e:
            print(f"[ERROR] Watchdog loop failed: {e}")

        await asyncio.sleep(WATCHDOG_CHECK_INTERVAL_SECONDS)

# --- MONITORING (snapshot + diff vs baseline) ---
# Status siklus terakhir disimpan di memori supaya UI bisa menampilkan
# "kapan terakhir jalan / berapa temuan" tanpa query tambahan.
_monitoring_state = {
    "last_run_at": None,
    "last_duration_seconds": None,
    "last_alert_count": 0,
    "last_snapshot_devices": 0,
    "last_activity_devices": 0,
    "last_error": None,
    "runs": 0,
}


def _collect_activity_snapshots():
    """Snapshot NetworkActivityCollector untuk semua MAC yang dikenal engine.

    Collector hanya punya API per-MAC, jadi kita iterasi daftar perangkat.
    Blocking -> dipanggil dari thread executor, bukan dari event loop.
    """
    snapshots = []
    for mac in list(engine.devices.keys()):
        try:
            detail = engine.get_network_details(mac)
            if detail:
                snapshots.append(detail)
        except Exception as e:
            print(f"[MONITOR] gagal snapshot aktivitas {mac}: {e}")
    return snapshots


def _run_monitoring_cycle():
    """Satu siklus monitoring penuh (blocking: query + insert Supabase)."""
    payload = engine.get_full_payload()
    devices = payload.get("devices", [])
    metrics = payload.get("metrics", {})

    activity = _collect_activity_snapshots()

    alerts = run_monitoring_pass(
        supabase,
        devices,
        _ssid_cache["value"],
        get_cached_host_bssid(),
        metrics.get("total_up", 0),
        metrics.get("total_down", 0),
        activity_snapshots=activity,
        # Pemantauan tetap dicatat walau SSID bukan target, supaya operator
        # bisa memeriksa hasilnya. Kolom ssid/bssid disimpan per baris agar
        # data dari jaringan lain bisa difilter belakangan.
        persist_allowed=True,
    )
    return {"alerts": alerts or [], "devices": len(devices), "activity": len(activity)}


async def monitoring_loop():
    """Jalankan satu siklus pemantauan tiap MONITORING_INTERVAL_SECONDS."""
    # Beri kesempatan sniffer/scan ARP mengisi data sebelum snapshot pertama.
    await asyncio.sleep(30)

    last_cleanup = 0.0
    while not shutdown_event.is_set():
        started = time.time()
        try:
            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(None, _run_monitoring_cycle)
            alerts = result["alerts"]

            _monitoring_state["last_run_at"] = datetime.now().isoformat()
            _monitoring_state["last_duration_seconds"] = round(time.time() - started, 2)
            _monitoring_state["last_alert_count"] = len(alerts)
            _monitoring_state["last_snapshot_devices"] = result["devices"]
            _monitoring_state["last_activity_devices"] = result["activity"]
            _monitoring_state["last_error"] = None
            _monitoring_state["runs"] += 1

            print(f"[MONITOR] siklus #{_monitoring_state['runs']} selesai dalam "
                  f"{_monitoring_state['last_duration_seconds']}s, "
                  f"{len(alerts)} temuan")

            # Retention: bersihkan baris lama tiap 6 jam.
            if time.time() - last_cleanup > 6 * 3600:
                from monitoring import cleanup_old_rows
                from config import MONITORING_RETENTION_DAYS
                await loop.run_in_executor(
                    None, cleanup_old_rows, supabase, MONITORING_RETENTION_DAYS
                )
                last_cleanup = time.time()

        except Exception as e:
            _monitoring_state["last_error"] = str(e)
            print(f"[ERROR] Monitoring loop failed: {e}")

        await asyncio.sleep(MONITORING_INTERVAL_SECONDS)


async def heartbeat_log_loop():
    while not shutdown_event.is_set():
        try:
            # Log heartbeats
            devices_count = len(engine.devices)
            worker_stats = workers.get_stats()

            print(f"[HEARTBEAT] Devices: {devices_count}, "
                  f"Worker stats: submitted={worker_stats['submitted']}, "
                  f"completed={worker_stats['completed']}, "
                  f"failed={worker_stats['failed']}, "
                  f"dropped={worker_stats['dropped']}, "
                  f"queued={worker_stats['queued']}, "
                  f"alive_workers={worker_stats['alive_workers']}")

            # Log component heartbeats if they exist
            components = ["arp_scan", "arp_table_scan", "passive_sniff",
                         "status_check_loop", "broadcast_loop"]
            for comp in components:
                age = engine.heartbeat_age(comp)
                if age != float('inf'):
                    print(f"  {comp}: {age:.1f}s ago")

        except Exception as e:
            print(f"[ERROR] Heartbeat log loop failed: {e}")

        await asyncio.sleep(HEARTBEAT_LOG_INTERVAL_SECONDS)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)