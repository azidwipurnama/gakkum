
-- 1. Tabel agen untuk otentikasi
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT UNIQUE NOT NULL,
    key_hash TEXT NOT NULL,
    device_id TEXT NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabel sampel trafik (Time-series data)
CREATE TABLE IF NOT EXISTS agent_samples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT REFERENCES agents(agent_id),
    device_id TEXT NOT NULL,
    ts TIMESTAMP WITH TIME ZONE NOT NULL,
    interface_name TEXT NOT NULL,
    bytes_sent BIGINT NOT NULL CHECK (bytes_sent >= 0),
    bytes_recv BIGINT NOT NULL CHECK (bytes_recv >= 0),
    packets_sent BIGINT NOT NULL CHECK (packets_sent >= 0),
    packets_recv BIGINT NOT NULL CHECK (packets_recv >= 0)
);

-- Indeks untuk efisiensi query deteksi anomali
CREATE INDEX IF NOT EXISTS idx_agent_samples_ts ON agent_samples(ts);
CREATE INDEX IF NOT EXISTS idx_agent_samples_agent_id ON agent_samples(agent_id);

-- 3. Tabel alert untuk dashboard
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL,
    rule_type TEXT NOT NULL,
    severity TEXT NOT NULL, -- info, warning, critical
    risk_score INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
    reason TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

/*
Mekanisme Retention:
Untuk menghapus data agent_samples > 7 hari:
- Jika environment adalah Supabase: Gunakan ekstensi 'pg_cron'.
- Jika tidak: Gunakan fungsi FastAPI background task yang berjalan tiap 24 jam:
  db.execute("DELETE FROM agent_samples WHERE ts < NOW() - INTERVAL '7 days'")
*/
