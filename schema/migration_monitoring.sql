-- Migrasi: mendukung fitur Pemantauan (monitoring)
-- Jalankan manual di SQL Editor Supabase (berurutan), tidak otomatis oleh backend.
--
-- Isi:
--   1. Tabel riwayat: apa yang dicatat backend tiap 15 menit
--   2. Fungsi baseline (dipakai view & aturan perbandingan)
--   3. View agregator untuk UI / aturan
--
-- Retention: baris yang lebih tua dari 7 hari dihapus otomatis oleh
-- backend (monitoring.cleanup_old_rows), jadi tidak perlu pg_cron.

-- ============================================================
-- 1. TABEL RIWAYAT
-- ============================================================

-- 1a. Snapshot daftar perangkat (diff antar snapshot = perangkat baru/hilang)
CREATE TABLE IF NOT EXISTS device_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ts TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ssid TEXT,
    bssid TEXT,
    total_up INTEGER NOT NULL DEFAULT 0,
    total_down INTEGER NOT NULL DEFAULT 0,
    devices JSONB NOT NULL DEFAULT '[]'   -- ringkasan tiap perangkat
);
CREATE INDEX IF NOT EXISTS idx_device_snapshots_ts ON device_snapshots(ts);

-- 1b. Profil aktivitas per MAC (protokol, port, endpoint remote)
CREATE TABLE IF NOT EXISTS device_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mac TEXT NOT NULL,
    ts TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ssid TEXT,
    protocol_counts JSONB,                -- {"TCP":123,"UDP":45}
    top_remote_ports JSONB,               -- [80,443,53] (top 10 frekuensi)
    top_remote_hosts JSONB,               -- [ip] (top 10 frekuensi)
    connection_count INTEGER NOT NULL DEFAULT 0,
    total_packets INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_device_activity_mac_ts ON device_activity(mac, ts);

-- 1c. Riwayat SSID/BSSID aktif host (konteks + deteksi pergantian AP)
CREATE TABLE IF NOT EXISTS ssid_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ts TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ssid TEXT,
    bssid TEXT
);
CREATE INDEX IF NOT EXISTS idx_ssid_events_ts ON ssid_events(ts);

-- 1d. Log temuan/insiden dari aturan perbandingan
CREATE TABLE IF NOT EXISTS monitoring_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ts TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    rule_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    device_mac TEXT,
    message TEXT
);
CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_ts ON monitoring_alerts(ts);

-- ============================================================
-- 2. FUNGSI BASELINE (30 hari)
-- ============================================================

-- 2a. Baseline perangkat: latency rata2/p95, status, jumlah hari terlihat
CREATE OR REPLACE FUNCTION device_baseline_30d()
RETURNS TABLE (
    mac TEXT,
    last_seen TIMESTAMP WITH TIME ZONE,
    latency_avg NUMERIC,
    latency_p95 NUMERIC,
    status_counts JSONB,
    count_days INTEGER
)
STABLE
AS $$
    SELECT
        lower(elem->>'mac') AS mac,
        max(ds.ts) AS last_seen,
        round(avg(((elem->>'latency')::numeric)), 2) AS latency_avg,
        percentile_cont(0.95)
            WITHIN GROUP (ORDER BY (elem->>'latency')::numeric) AS latency_p95,
        jsonb_build_object(
            'up',   count(*) FILTER (WHERE elem->>'status' = 'UP'),
            'down', count(*) FILTER (WHERE elem->>'status' = 'DOWN')
        ) AS status_counts,
        count(DISTINCT date_trunc('day', ds.ts))::int AS count_days
    FROM device_snapshots ds,
         LATERAL jsonb_array_elements(ds.devices) AS elem
    WHERE ds.ts >= NOW() - INTERVAL '30 days'
      AND elem->>'mac' IS NOT NULL
      AND elem->>'mac' <> ''
    GROUP BY 1
$$ LANGUAGE sql;

-- 2b. Total paket per hari untuk satu MAC (dipakai UI grafik)
CREATE OR REPLACE FUNCTION device_traffic_daily(p_mac TEXT, days INTEGER DEFAULT 30)
RETURNS TABLE (
    day DATE,
    total_packets BIGINT
)
STABLE
AS $$
    SELECT
        date_trunc('day', ts)::date AS day,
        COALESCE(sum(total_packets), 0)::bigint AS total_packets
    FROM device_activity
    WHERE lower(mac) = lower(COALESCE(p_mac, ''))
      AND ts >= NOW() - (GREATEST(days, 1) || ' days')::interval
    GROUP BY 1
    ORDER BY 1
$$ LANGUAGE sql;

-- ============================================================
-- 3. VIEW UNTUK ATURAN/UI
-- ============================================================

-- 3a. Perangkat baru: MAC yang TIDAK PERNAH muncul sebelum 24 jam terakhir.
--     Catatan: saat baseline baru dibuat (< 2 hari data), semua MAC ikut
--     "baru" — jadi backend hanya menjalankan aturan ini bila snapshot
--     tertua sudah lebih dari 24 jam (lihat monitoring._baseline_ready).
CREATE OR REPLACE VIEW new_devices_30d AS
SELECT
    lower(elem->>'mac') AS mac,
    (array_agg(elem->>'ip' ORDER BY ds.ts))[1] AS ip,
    min(ds.ts) AS first_seen,
    (array_agg(ds.ssid ORDER BY ds.ts DESC))[1] AS ssid_seen,
    count(*)::int AS seen_in_snapshots
FROM device_snapshots ds,
     LATERAL jsonb_array_elements(ds.devices) AS elem
WHERE ds.ts >= NOW() - INTERVAL '30 days'
  AND elem->>'mac' IS NOT NULL
  AND elem->>'mac' <> ''
GROUP BY 1
HAVING min(ds.ts) >= NOW() - INTERVAL '1 day'
ORDER BY first_seen DESC;

-- 3b. Perangkat hilang: ada di baseline 30 hari, tidak ada di snapshot 24 jam
CREATE OR REPLACE VIEW disappeared_devices AS
SELECT
    b.mac,
    b.last_seen,
    b.latency_avg,
    b.status_counts,
    b.count_days,
    NOW() - b.last_seen AS age
FROM device_baseline_30d() b
WHERE NOT EXISTS (
    SELECT 1
    FROM device_snapshots ds,
         LATERAL jsonb_array_elements(ds.devices) AS elem
    WHERE ds.ts >= NOW() - INTERVAL '24 hours'
      AND lower(elem->>'mac') = b.mac
);

-- 3c. Lonjakan trafik: paket hari ini vs rata-rata paket harian 7 hari sebelumnya
CREATE OR REPLACE VIEW traffic_spike_devices AS
WITH today AS (
    SELECT
        lower(mac) AS mac,
        COALESCE(sum(total_packets), 0)::bigint AS packets
    FROM device_activity
    WHERE ts >= NOW() - INTERVAL '1 day'
    GROUP BY 1
),
prev_daily AS (
    SELECT
        lower(mac) AS mac,
        date_trunc('day', ts) AS day,
        sum(total_packets) AS packets
    FROM device_activity
    WHERE ts >= NOW() - INTERVAL '8 days'
      AND ts <  NOW() - INTERVAL '1 day'
    GROUP BY 1, 2
),
prev_avg AS (
    SELECT
        mac,
        COALESCE(avg(packets), 0)::bigint AS packets
    FROM prev_daily
    GROUP BY mac
)
SELECT
    t.mac,
    t.packets AS today_packets,
    p.packets AS avg_7d_packets,
    round(t.packets::numeric / NULLIF(p.packets, 0), 2) AS ratio,
    (t.packets >= 2 * p.packets) AS is_spike
FROM today t
JOIN prev_avg p ON p.mac = t.mac
WHERE p.packets > 0
  AND t.packets >= 2 * p.packets
ORDER BY ratio DESC;
