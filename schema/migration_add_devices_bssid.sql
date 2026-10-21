-- Migrasi: tambah kolom bssid ke tabel devices
-- Jalankan manual di SQL Editor Supabase. Tidak dijalankan otomatis oleh backend.
--
-- Kolom ini menyimpan BSSID access point yang sedang dipakai host pemindai
-- (lihat backend/wifi_bssid.py). Dipakai untuk memetakan perangkat ke lokasi
-- melalui BSSID_MAPPING di backend/config.py.
--
-- STATUS: TIDAK DIPERLUKAN LAGI. File ini disimpan hanya sebagai dokumentasi.
-- Keputusan terbaru: BSSID tidak disimpan ke Supabase, sehingga kolom ini tidak
-- dipakai. BSSID hanya dipakai internal oleh engine untuk pemetaan lokasi
-- (apply_host_bssid + BSSID_MAPPING_NORMALIZED di backend/timestamp_engine.py).
-- Jangan jalankan migrasi ini. Payload upsert tabel devices sekarang hanya
-- berisi: id, ip, hostname, category, vendor, location
-- (lihat DEVICE_UPSERT_FIELDS di backend/supabase_payload.py).
-- Jika kolom bssid sudah telanjur dibuat, biarkan dan tidak perlu digunakan.

ALTER TABLE devices
    ADD COLUMN IF NOT EXISTS bssid TEXT;

-- Percepat pencarian perangkat per access point
CREATE INDEX IF NOT EXISTS idx_devices_bssid ON devices(bssid);
