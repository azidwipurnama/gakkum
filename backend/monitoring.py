"""Collector snapshot monitoring + aturan perbandingan (diff vs baseline).

Modul ini sengaja tidak mengimpor Scapy / FastAPI / Supabase supaya bisa
diuji tanpa lingkungan lengkap. Semua fungsi menerima `supabase` (client
Supabase) dan data engine (list of devices, active SSID/BSSID) sebagai argumen.

Responsibilitas:
  1. build_device_snapshot       — merangkum daftar perangkat + konteks
  2. build_activity_rows         — merangkum NetworkActivityCollector per MAC
  3. detect_new_devices          — MAC baru vs baseline 30 hari (view new_devices_30d)
  4. detect_disappeared_devices  — MAC hilang (view disappeared_devices)
  5. detect_latency_shift        — latensi sekarang vs baseline (device_baseline_30d)
  6. detect_bssid_change         — BSSID berubah, SSID sama
  7. run_monitoring_pass         — koordinasi: tulis snapshot + jalankan semua aturan
"""

from datetime import datetime, timezone


# ============================================================
# 1. Rangkuman data engine -> payload Supabase
# ============================================================

def build_device_snapshot(devices, ssid=None, bssid=None, total_up=0, total_down=0):
    """Bungkus ringkasan daftar perangkat untuk tabel device_snapshots.

    `devices` adalah list of dict yang sama dengan payload DEVICE_UPDATE
    (timestamp_engine.get_full_payload). Field penting:
      mac, ip, hostname, category, vendor, status, latency, last_seen
    """
    slim = []
    for d in devices:
        slim.append({
            "mac": d.get("mac", ""),
            "ip": d.get("ip", ""),
            "hostname": d.get("hostname", "") or "",
            "category": d.get("category", "") or "",
            "vendor": d.get("vendor", "") or "",
            "status": d.get("status", "UNKNOWN"),
            "latency": d.get("latency"),
            "last_seen": d.get("last_seen", ""),
        })
    return {
        "ts": datetime.now(timezone.utc).isoformat(),
        "ssid": ssid or "",
        "bssid": bssid or "",
        "total_up": int(total_up),
        "total_down": int(total_down),
        "devices": slim,
    }


def build_activity_rows(activity_snapshots, ssid=None):
    """Bungkus ringkasan NetworkActivityCollector -> tabel device_activity.

    `activity_snapshots` adalah list of dict dari
    NetworkActivityCollector.snapshot() (struktur DeviceNetworkDetails):
      mac, protocol_counts dari protocols[], top port/remote dari
      connections[]
    """
    rows = []
    now_iso = datetime.now(timezone.utc).isoformat()

    for snap in activity_snapshots:
        mac = snap.get("mac", "")
        if not mac:
            continue

        protocols = snap.get("protocols", [])
        conn = snap.get("connections", [])

        protocol_counts = {}
        total_packets = 0
        port_freq = {}
        remote_freq = {}

        for p in protocols:
            name = p.get("name", "")
            packets = int(p.get("packets", 0))
            protocol_counts[name] = protocol_counts.get(name, 0) + packets
            total_packets += packets

        for c in conn:
            port = c.get("remote_port")
            remote = c.get("remote_address")
            if port is not None:
                port_freq[int(port)] = port_freq.get(int(port), 0) + 1
            if remote:
                remote_freq[remote] = remote_freq.get(remote, 0) + 1

        # Lewati perangkat tanpa aktivitas sama sekali: menulis baris nol akan
        # menurunkan rata-rata baseline sehingga lonjakan jadi mudah terpicu.
        if total_packets == 0 and not conn:
            continue

        rows.append({
            "mac": mac.lower(),
            "ts": now_iso,
            "ssid": ssid or "",
            "protocol_counts": protocol_counts,
            "top_remote_ports": _top_n(port_freq, 10),
            "top_remote_hosts": _top_n(remote_freq, 10),
            "connection_count": len(conn),
            "total_packets": total_packets,
        })
    return rows


def _top_n(freq: dict, n: int = 10):
    """Return list N key tertinggi berdasarkan frekuensi, urut turun."""
    items = sorted(freq.items(), key=lambda kv: kv[1], reverse=True)
    return [k for k, _ in items[:n]]


# ============================================================
# 2. Aturan perbandingan (diff vs baseline)
# ============================================================

def _fetch_view(supabase, view_name, **filters):
    q = supabase.table(view_name).select("*")
    for k, v in filters.items():
        q = q.eq(k, v)
    try:
        res = q.execute()
        return res.data or []
    except Exception as e:
        print(f"[MONITOR] gagal query {view_name}: {e}")
        return []


def _call_rpc(supabase, fn_name, params=None):
    """Panggil fungsi SQL (PostgREST mengekspos fungsi lewat RPC, bukan tabel)."""
    try:
        res = supabase.rpc(fn_name, params or {}).execute()
        return res.data or []
    except Exception as e:
        print(f"[MONITOR] gagal panggil {fn_name}(): {e}")
        return []


def check_schema(supabase):
    """Cek apakah objek dari schema/migration_monitoring.sql sudah ada.

    Migrasi itu dijalankan manual di SQL Editor Supabase, jadi sangat mungkin
    backend hidup sebelum tabelnya ada. Tanpa cek ini semua insert gagal
    diam-diam dan UI tidak punya cara menjelaskan sebabnya.

    Return (ready: bool, pesan: str | None).
    """
    if not supabase:
        return False, "Supabase client tidak tersedia"

    missing = []
    for name in ("device_snapshots", "device_activity", "ssid_events", "monitoring_alerts"):
        try:
            supabase.table(name).select("ts").limit(1).execute()
        except Exception as e:
            msg = str(e)
            if "PGRST205" in msg or "schema cache" in msg:
                missing.append(name)
            else:
                return False, f"gagal cek {name}: {msg[:160]}"

    if missing:
        return False, "Tabel belum ada: " + ", ".join(missing)
    return True, None


def _baseline_ready(supabase, min_age_hours: int = 24) -> bool:
    """Baseline dianggap siap bila device_snapshots sudah punya baris
    tertua lebih lama dari min_age_hours.

    Tanpa penjaga ini, saat hari pertama semua MAC ikut dianggap
    "perangkat baru" (view new_devices_30d) dan "hilang" tidak akurat.
    """
    try:
        res = (
            supabase.table("device_snapshots")
            .select("ts")
            .order("ts", desc=False)
            .limit(1)
            .execute()
        )
        if not res.data:
            return False
        oldest = datetime.fromisoformat(
            str(res.data[0]["ts"]).replace("Z", "+00:00")
        )
        age = datetime.now(timezone.utc) - oldest
        return age.total_seconds() >= min_age_hours * 3600
    except Exception as e:
        print(f"[MONITOR] gagal cek kesiapan baseline: {e}")
        return False


def detect_new_devices(supabase):
    """MAC yang baru pertama kali muncul di snapshot 30 hari terakhir.

    View `new_devices_30d` harus sudah dibuat (schema/migration_monitoring.sql).
    Return list of {mac, ip, first_seen, ssid_seen, seen_in_snapshots}.
    """
    return _fetch_view(supabase, "new_devices_30d")


def detect_disappeared_devices(supabase):
    """MAC di baseline 30 hari tapi tidak muncul di snapshot 24 jam terakhir.

    View `disappeared_devices` sudah memakai ambang 24 jam, jadi tinggal
    ambil apa adanya. Return list of {mac, last_seen, latency_avg, ...}.
    """
    return _fetch_view(supabase, "disappeared_devices")


def detect_latency_shift(supabase, current_devices, threshold_factor: float = 3.0):
    """Perangkat yang latensi saat ini >= threshold_factor × baseline p95."""
    baseline_rows = _call_rpc(supabase, "device_baseline_30d")
    by_mac = {b["mac"]: b for b in baseline_rows}

    alerts = []
    for d in current_devices:
        mac = d.get("mac", "").lower()
        lat_now = d.get("latency")
        if not mac or not isinstance(lat_now, (int, float)) or lat_now <= 0:
            continue

        base = by_mac.get(mac)
        if not base:
            continue
        p95 = base.get("latency_p95")
        if p95 is None or p95 <= 0:
            continue
        try:
            p95_f = float(p95)
        except (TypeError, ValueError):
            continue

        if lat_now >= p95_f * threshold_factor:
            alerts.append({
                "rule_type": "latency_shift",
                "severity": "warning",
                "device_mac": mac,
                "message": (
                    f"Latensi {mac} = {lat_now} ms "
                    f"(baseline p95 = {p95_f:.1f} ms, factor {threshold_factor})"
                ),
            })
    return alerts


def detect_bssid_change(supabase, current_ssid, current_bssid, lookback_days: int = 7):
    """SSID sama tapi BSSID berbeda dari yang terakhir tercatat.

    Query terakhir beberapa baris ssid_events; jika ada 2+ BSSID berbeda
    pada SSID yang sama dalam N hari -> flag (bisa AP diganti/dipindah,
    atau indikasi evil twin).
    """
    if not current_ssid or not current_bssid:
        return None

    q = (
        supabase.table("ssid_events")
        .select("ssid, bssid, ts")
        .eq("ssid", current_ssid)
        .order("ts", desc=True)
        .limit(50)
    )
    try:
        res = q.execute()
        rows = res.data or []
    except Exception as e:
        print(f"[MONITOR] gagal query ssid_events: {e}")
        return None

    distinct_bssids = {r.get("bssid") for r in rows if r.get("bssid")}
    distinct_bssids.discard(None)
    if len(distinct_bssids) > 1:
        return {
            "rule_type": "bssid_change",
            "severity": "warning",
            "device_mac": None,
            "message": (
                f"SSID '{current_ssid}' tercatat dengan {len(distinct_bssids)} BSSID "
                f"dalam {lookback_days} hari terakhir: {sorted(distinct_bssids)}"
            ),
        }
    return None


def collect_new_ssid_event(supabase, ssid, bssid):
    """Ambil baris ssid_events terakhir; bandingkan dengan saat ini.

    Jika ada perubahan (SSID atau BSSID), kembalikan payload insert.
    Jika tidak ada perubahan, None (tidak perlu tulis).
    """
    try:
        res = supabase.table("ssid_events").select("ssid, bssid, ts").order("ts", desc=True).limit(1).execute()
        last = res.data[0] if res.data else None
    except Exception as e:
        print(f"[MONITOR] gagal query ssid_events: {e}")
        return None

    if last and last.get("ssid") == ssid and last.get("bssid") == bssid:
        return None
    return {"ssid": ssid or "", "bssid": bssid or ""}


def detect_traffic_spike(supabase):
    """Perangkat yang paket hari ini >= 3x rata-rata 7 hari (view siap-buatan)."""
    alerts = []
    for r in _fetch_view(supabase, "traffic_spike_devices"):
        if not r.get("is_spike"):
            continue
        alerts.append({
            "rule_type": "traffic_spike",
            "severity": "warning",
            "device_mac": r.get("mac"),
            "message": (
                f"Trafik {r.get('mac')}: {r.get('today_packets')} paket hari ini "
                f"(rata-rata 7 hari {r.get('avg_7d_packets')}, rasio {r.get('ratio')}x)"
            ),
        })
    return alerts


def cleanup_old_rows(supabase, retention_days: int = 7):
    """Hapus baris riwayat yang lebih tua dari retention_days (retention 7 hari)."""
    from datetime import timedelta

    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    cutoff_iso = cutoff.isoformat()
    for table in ("device_snapshots", "device_activity", "ssid_events", "monitoring_alerts"):
        try:
            supabase.table(table).delete().lt("ts", cutoff_iso).execute()
        except Exception as e:
            print(f"[MONITOR] cleanup {table} gagal: {e}")


def _dedupe_alerts(supabase, alerts, window_hours: int = 6):
    """Buang temuan yang sama persis dengan yang sudah tercatat baru-baru ini.

    Tanpa ini, aturan seperti bssid_change akan menulis baris identik setiap
    siklus (tiap 15 menit) selama kondisinya belum pulih.
    """
    if not alerts:
        return []

    from datetime import timedelta

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=window_hours)).isoformat()
    try:
        res = (
            supabase.table("monitoring_alerts")
            .select("rule_type, device_mac, message")
            .gte("ts", cutoff)
            .execute()
        )
        recent = res.data or []
    except Exception as e:
        print(f"[MONITOR] gagal cek duplikat alert: {e}")
        return alerts

    seen = {(r.get("rule_type"), r.get("device_mac"), r.get("message")) for r in recent}
    fresh = []
    for a in alerts:
        key = (a.get("rule_type"), a.get("device_mac"), a.get("message"))
        if key in seen:
            continue
        seen.add(key)
        fresh.append(a)
    return fresh


# ============================================================
# 3. Koordinator: tulis snapshot + jalankan semua aturan
# ============================================================

def run_monitoring_pass(
    supabase,
    devices,
    ssid,
    bssid,
    total_up=0,
    total_down=0,
    activity_snapshots=None,
    persist_allowed=True,
):
    """Jalankan satu siklus monitoring penuh.

    Args:
      supabase: client supabase (atau None untuk mode test)
      devices: list dari engine (payload DEVICE_UPDATE)
      ssid, bssid, total_up, total_down: konteks saat ini
      activity_snapshots: list of NetworkActivityCollector.snapshot()
      persist_allowed: False jika SSID tidak target -> simpan log lokal saja

    Return list of monitoring_alerts baru (belum di-insert).
    """
    alerts = []

    # (a) Snapshot daftar perangkat
    snap = build_device_snapshot(devices, ssid, bssid, total_up, total_down)
    new_events = []
    if persist_allowed:
        new_events = _persist_if_needed(
            supabase,
            "device_snapshots",
            [snap],
            persist_allowed,
        )

    # (b) Riwayat aktivitas
    act_rows = build_activity_rows(activity_snapshots or [], ssid)
    if act_rows and persist_allowed:
        _persist_if_needed(supabase, "device_activity", act_rows, persist_allowed)

    # (c) SSID event hanya bila berubah
    ssid_event = collect_new_ssid_event(supabase, ssid, bssid)
    if ssid_event:
        _persist_if_needed(supabase, "ssid_events", [ssid_event], persist_allowed)

    # (d) Aturan perbandingan — hanya dijalankan bila baseline sudah cukup tua,
    #     kecuali latency_shift & bssid_change yang langsung memakai data live.
    baseline_ok = _baseline_ready(supabase)
    if persist_allowed and baseline_ok:
        new_devs = detect_new_devices(supabase)
        if new_devs:
            alerts.extend([
                {
                    "rule_type": "new_device",
                    "severity": "info",
                    "device_mac": d.get("mac"),
                    "message": (
                        f"Perangkat baru {d.get('mac')} ({d.get('ip') or 'unknown'}) "
                        f"terlihat pertama kali pada {d.get('first_seen')}"
                    ),
                }
                for d in new_devs
            ])

        gone_devs = detect_disappeared_devices(supabase)
        alerts.extend([
            {
                "rule_type": "device_disappeared",
                "severity": "info",
                "device_mac": d.get("mac"),
                "message": f"Perangkat {d.get('mac')} tidak terlihat sejak {d.get('last_seen')}",
            }
            for d in gone_devs
        ])

        alerts.extend(detect_traffic_spike(supabase))

    # Aturan yang tidak butuh baseline lama (menilai data live / event terkini)
    if persist_allowed:
        alerts.extend(detect_latency_shift(supabase, devices))

        bssid_alert = detect_bssid_change(supabase, ssid, bssid)
        if bssid_alert:
            alerts.append(bssid_alert)

    # (e) Persist temuan (opsional) — dedupe supaya temuan yang sama tidak
    #     ditulis ulang setiap siklus selama kondisinya belum berubah.
    if alerts and persist_allowed:
        fresh_alerts = _dedupe_alerts(supabase, alerts)
        if fresh_alerts:
            _persist_if_needed(supabase, "monitoring_alerts", fresh_alerts, persist_allowed)

    for a in alerts:
        print(f"[MONITOR] {a['rule_type']}: {a['message']}")

    return alerts


def _persist_if_needed(supabase, table, rows, persist_allowed):
    if not supabase or not rows or not persist_allowed:
        return []
    try:
        res = supabase.table(table).insert(rows).execute()
        return res.data or []
    except Exception as e:
        print(f"[MONITOR] gagal insert {table}: {e}")
        return []
