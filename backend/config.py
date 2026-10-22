import os
from dotenv import load_dotenv

load_dotenv()

# Debug: verify loading
print(f"[DEBUG] SUPABASE_URL loaded: {bool(os.getenv('SUPABASE_URL'))}")
print(f"[DEBUG] SUPABASE_KEY loaded: {bool(os.getenv('SUPABASE_KEY'))}")

# API Key
API_KEY = "GAKKUM_SECRET_KEY"

# Supabase Configurations
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

# Networking Config
# Mapping BSSID -> nama ruangan. Sumber datanya ada di backend/rooms.py
# (beserta koordinat AP pada denah), supaya tidak ada dua daftar yang bisa
# berbeda. Isi BSSID asli di sana, bukan di sini.
from rooms import BSSID_TO_LOCATION as BSSID_MAPPING

# Network interface for Scapy (might depend on OS)
INTERFACE = "Ethernet" # Adjust to your local interface name

# Constants
TIMEOUT_MINUTES = 3
ALERT_DOWN_MINUTES = 10
PING_INTERVAL_SECONDS = 10
BROADCAST_INTERVAL_SECONDS = 2

# --- Langkah B New Configs ---
ARP_SCAN_INTERVAL_SECONDS = 4
ARP_TIMEOUT_SECONDS = 3
# Pencarian alamat IPv6 (ICMPv6 Echo ke ff02::1). Lebih jarang dari ARP karena
# alamat IPv6 tidak berubah-ubah dan pemindaian ini hanya pelengkap.
IPV6_SCAN_INTERVAL_SECONDS = 30
AGENT_REPORT_RATE_LIMIT_SECONDS = 2
WATCHDOG_CHECK_INTERVAL_SECONDS = 5
WORKER_THREAD_COUNT = 8
WORKER_QUEUE_MAXSIZE = 1024
SUPABASE_MAX_ATTEMPTS = 5
SSID_CACHE_SECONDS = 5
BSSID_CACHE_SECONDS = 30
HOSTNAME_TIMEOUT_SECONDS = 2
PING_TIMEOUT_SECONDS = 2
NETSH_TIMEOUT_SECONDS = 5
SNIFFER_RESTART_DELAY_SECONDS = 5
HEARTBEAT_LOG_INTERVAL_SECONDS = 30
WATCHDOG_STALL_FACTOR = 3
# Batas waktu per kirim WebSocket per klien. Koneksi yang lebih lama dari ini
# dianggap macet dan dibuang supaya broadcast loop tidak ikut terhambat.
BROADCAST_SEND_TIMEOUT_SECONDS = 5
# -----------------------------

# --- Fitur Monitoring (snapshot + diff vs baseline) ---
# Interval antara dua siklus run_monitoring_pass.
MONITORING_INTERVAL_SECONDS = 15 * 60          # 15 menit
# Berapa hari riwayat device_snapshots dianggap baseline yang valid.
MONITORING_BASELINE_DAYS = 30
# Retention: hapus baris yang lebih tua dari N hari.
MONITORING_RETENTION_DAYS = 7
# Ambang lonjakan trafik: hari ini vs rata-rata 7 hari (rasio minimum).
MONITORING_TRAFFIC_SPIKE_RATIO = 2.0
# Batas latensi "lonjakan": p95 baseline dikali faktor ini.
MONITORING_LATENCY_SHIFT_FACTOR = 3.0
# Batas perangkat "hilang": N jam tidak muncul di snapshot.
MONITORING_DISAPPEARED_HOURS = 24
# -----------------------------

# Hasil pengukuran latency dianggap kedaluwarsa setelah sekian detik supaya nilai
# lama tidak terus ditampilkan seolah pengukuran terkini (lihat timestamp_engine.py).
LATENCY_STALE_SECONDS = 60

# Kategori perangkat (CCTV, Smart TV, Printer, dst.) berasal dari probe port yang
# bisa berubah: port terbuka/tertutup, hostname baru diketahui belakangan. Setelah
# sekian detik kategori dianggap perlu diverifikasi ulang. Nilai ini juga menjadi
# pembatas laju probe sehingga antrean worker tidak dibanjiri tugas probe.
CATEGORY_RECHECK_SECONDS = 15 * 60
