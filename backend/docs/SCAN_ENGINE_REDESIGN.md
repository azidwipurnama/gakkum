# Redesign Mesin Pemindaian — Gakkum Network Monitor

Status: rancangan, belum diimplementasikan
Tanggal: 2026-10-22
Lingkup: `backend/` (Python/FastAPI/Scapy) + penyesuaian kecil di `app/page.tsx`

---

## 1. Ringkasan

Sistem sekarang menemukan perangkat lewat satu sapuan ARP `/24` yang memblokir 3 detik,
lalu menyerahkan *semua* pekerjaan lanjutan (hostname, ping, probe port) ke antrean
worker berukuran 1024 dengan 8 thread. Antrean itu meluap: **23,7% tugas dibuang diam-diam**
(`dropped=15.550` dari `submitted=65.625`). Akibatnya latency hanya terisi untuk 3 dari 66
perangkat, dan perangkat baru bisa butuh berjam-jam untuk muncul.

Rancangan ini memisahkan tiga hal yang sekarang tercampur:

1. **Penemuan** (discovery) — harus instan, nol antrean, dan menyeluruh.
2. **Pengukuran** (latency/liveness) — diambil dari sapuan yang sama, bukan subprocess `ping`.
3. **Pengayaan** (hostname, probe port, kategori) — boleh lambat, harus terkoordinasi.

Setelah pemisahan itu, sapuan `/24` yang diukur **0,72–0,86 detik** (11 host, RTT 120–313 ms)
bisa menggantikan seluruh mekanisme sekarang: satu sapuan menghasilkan IP + MAC + RTT sekaligus.

---

## 2. Bukti pengukuran (kondisi nyata saat ini)

| Fakta | Nilai | Sumber |
|---|---|---|
| Antarmuka aktif | Wi-Fi — Intel AX203, `10.10.10.67/22` | `Get-NetIPAddress` |
| Subnet yang dipindai | `10.10.9.0/24` (256 alamat) | `server.log:6` |
| Subnet sebenarnya | `10.10.8.0/22` (1024 alamat) | prefix length 22 |
| Sapuan ARP per siklus | `srp` 3 s + sleep 4 s ≈ **7 s** | `sniffer.py:259,279` |
| Sapuan paralel /24 (uji) | **0,72 s** → 11 host; **0,86 s** dengan RTT | uji langsung |
| Antrean worker | `submitted=65625 completed=49220 dropped=15550 queued=847/1024` | heartbeat log |
| Tugas dibuang per jenis | ping 7950, hostname 7347, probe 3992, ssid 125, bssid 18 | `server.log` |
| Latency terisi | **3 dari 66** perangkat (5, 102, 183 ms) | payload WS langsung |
| Status | 32 UP / 34 DOWN | payload WS langsung |
| Probe port per perangkat | 13 port × 0,3 s **berurutan** = 3,9 s | `timestamp_engine.py:95-106` |
| Perangkat yang pernah dihapus | **0** (tidak ada kode penghapusan) | grep seluruh backend |

Dua temuan yang menjelaskan keluhan "67 perangkat butuh berjam-jam":

**(a) Cakupan hanya 25%.** `get_local_subnet()` (`sniffer.py:61-67`) memotong tiga okted pertama
dari `local_ip` dan menempelkan `/24`, tanpa membaca netmask. Host berada di `10.10.8.0/22`,
jadi `10.10.8.x`, `10.10.10.x`, dan `10.10.11.x` **tidak pernah disapu aktif**. Ini cocok dengan
sebaran okted ketiga di `arp -a`: 9→25 entri, 0→6, 255→3, 8→1, 10→1, 11→1, 56→1.

**(b) `local_ip` dibekukan saat start.** `self.local_ip` dihitung sekali di `__init__`
(`sniffer.py:27`) dan tidak pernah diperbarui. Log menunjukkan sapuan berjalan di `10.10.9.0/24`
sementara alamat Wi-Fi sekarang `10.10.10.67`. Setelah DHCP renew atau roaming, pemindai
menunjuk `/24` yang salah sampai proses di-restart.

Karena itu perangkat di luar `/24` hanya bisa masuk lewat `arp -a` (cache OS, bisa berjam-jam
basi) dan lalu lintas pasif. Bukan karena jaringan lambat — sapuan penuh 256 alamat selesai
di bawah satu detik.

---

## 3. Arsitektur sekarang (dan titik macetnya)

```
[Thread: active_arp_scan]                 [Thread: scan_arp_table]
 srp(10.10.9.0/24, timeout=3)   ← BLOK 3 s   arp -a (subprocess, tanpa timeout)
        │                                          │
        ├─ submit("hostname") ─┐                   └─ update_device(latency=None)
        ├─ submit("ping")  ────┤                          ↑
        ├─ update_device()     │                          │  membaca cache basi
        └─ submit("probe") ────┤                          │  → status dipaksa "UP"
                               ▼                          │
                    ┌─────────────────────┐               │
                    │ queue.Queue(1024)   │  ← PENUH 83%  │
                    │ 8 worker thread     │               │
                    │ probe: 3,9 s/tugas  │  ← BOTTLENECK │
                    └─────────────────────┘               │
                               │                          │
                               ▼                          ▼
                      update_device(latency=…, hostname=…, ip="")
                               │
                               ▼
                    get_full_payload() → WS DEVICE_UPDATE (tiap 2 s)
```

Tiga cacat struktural:

1. **`submit` dipanggil sebelum `update_device`** (`sniffer.py:266-269`). Worker bisa
   membuat entri perangkat dengan `ip=""` karena `update_device` membuat entri baru untuk
   MAC tak dikenal (`timestamp_engine.py:199-240`).
2. **Semua pekerjaan berbagi satu antrean FIFO tanpa prioritas.** Probe 3,9 detik menahan
   8 thread; ping dan hostname ikut menunggu, lalu dibuang saat antrean penuh.
3. **Tidak ada siklus hidup perangkat.** `check_status()` hanya mengubah UP→DOWN
   (`timestamp_engine.py:394-405`); tidak ada `del`, `pop`, atau `clear` di seluruh backend.
   Perangkat hantu menumpuk selamanya.

---

## 4. Arsitektur target

```
                    ┌──────────────────────────────────────────┐
                    │  passive sniffer (1 thread, nol antrean) │
                    │  setiap paket → observe(mac, ip)         │
                    └───────────────┬──────────────────────────┘
                                    │  instan, < 1 ms
                                    ▼
┌───────────────────────────┐   ┌──────────────────────────────┐
│  sweep shard (1 thread)   │   │   TimestampEngine.devices    │
│  256 alamat / 1 s         │──▶│   observe() / map_only()     │
│  ARP + ICMP → IP+MAC+RTT  │   │   last_seen, status, rtt     │
└───────────────────────────┘   └──────────────┬───────────────┘
                                               │
                    ┌──────────────────────────┴───────────────┐
                    ▼                                          ▼
        ┌───────────────────────┐                  ┌───────────────────────┐
        │ worker: high          │                  │ broadcast_loop (2 s)  │
        │  probe port (0,3 s)   │                  │  payload lengkap      │
        │ worker: low           │                  │  metrics konsisten    │
        │  hostname, ssid, dll  │                  └───────────────────────┘
        └───────────────────────┘
```

Prinsip:

- **Discovery tidak pernah menunggu pengayaan.** Perangkat muncul di dasbor segera setelah
  satu paket terlihat atau satu balasan sapuan diterima.
- **Latency adalah hasil sampingan sapuan.** Tidak ada subprocess `ping` lagi.
- **Setiap tugas punya kunci dedupe dan prioritas.** Antrean tidak bisa meluap karena
  produsennya dibatasi, bukan karena konsumennya dipercepat.
- **Status hanya naik dari bukti segar.** Entri `arp -a` tidak lagi bisa menghidupkan
  perangkat hantu.

---

## 5. Perubahan per modul

### 5.1 `scanner.py` (baru) — sapuan paralel ber-shard

Menggantikan `active_arp_scan()` sepenuhnya.

```python
# backend/scanner.py
import ipaddress
import time

from scapy.all import ARP, Ether, IP, ICMP, AsyncSniffer, sendp

from config import (
    SWEEP_SHARD_SIZE, SWEEP_INTERVAL_SECONDS, SWEEP_WINDOW_SECONDS,
    SWEEP_QUIET_SECONDS, SWEEP_MIN_WINDOW_SECONDS,
)


class SubnetScanner:
    """Sapuan ARP + ICMP paralel. Satu shard per siklus, berputar."""

    def __init__(self, sniffer):
        self.sniffer = sniffer
        self.engine = sniffer.engine
        self.shutdown_event = sniffer.shutdown_event
        self._hosts = []          # semua alamat di subnet nyata
        self._cursor = 0

    # --- cakupan ---------------------------------------------------------

    def refresh_targets(self):
        """Hitung ulang daftar alamat dari antarmuka + netmask.

        Dipanggil setiap siklus, bukan sekali saat start: alamat DHCP bisa
        berubah dan netmask menentukan cakupan sebenarnya.
        """
        info = self.sniffer.refresh_interface_info()   # lihat 5.2
        if not info:
            return
        iface, ip, prefixlen = info
        net = ipaddress.ip_network(f"{ip}/{prefixlen}", strict=False)
        self._hosts = [str(h) for h in net.hosts()]
        self._cursor %= max(1, len(self._hosts))

    def next_shard(self):
        if not self._hosts:
            return []
        n = len(self._hosts)
        size = min(SWEEP_SHARD_SIZE, n)
        start = self._cursor % n
        shard = [self._hosts[(start + i) % n] for i in range(size)]
        self._cursor = (start + size) % n
        return shard

    # --- sapuan ----------------------------------------------------------

    def sweep(self, targets):
        """Kirim ARP + ICMP ke semua target sekaligus, kumpulkan balasan."""
        iface = self.sniffer.target_iface
        our_mac = self.sniffer.local_mac
        local_ip = self.sniffer.local_ip

        arp_pkts = [
            Ether(dst="ff:ff:ff:ff:ff:ff") / ARP(op=1, pdst=ip, psrc=local_ip)
            for ip in targets
        ]
        icmp_pkts = [
            Ether(dst="ff:ff:ff:ff:ff:ff")
            / IP(src=local_ip, dst=ip)
            / ICMP(type=8, id=0x474b, seq=i & 0xFFFF)
            for i, ip in enumerate(targets)
        ]

        sent = {}          # ip -> paket (scapy mengisi .sent_time)
        for p in arp_pkts:
            sent[p[ARP].pdst] = p
        for p in icmp_pkts:
            sent.setdefault(p[IP].dst, p)

        result = {}        # ip -> {"mac":…, "rtt":…}

        def collect(pkt):
            if not pkt.haslayer(Ether):
                return
            if pkt.haslayer(ARP) and pkt[ARP].op == 2:
                ip = pkt[ARP].psrc
                src = sent.get(ip)
                rtt = None if src is None else (pkt.time - src.sent_time) * 1000
                entry = result.setdefault(ip, {"mac": pkt[Ether].src.lower()})
                if rtt is not None:
                    entry.setdefault("arp_rtt", rtt)
            elif pkt.haslayer(ICMP) and pkt[ICMP].type == 0:
                ip = pkt[IP].src
                if pkt[IP].dst != local_ip:
                    return
                src = sent.get(ip)
                rtt = None if src is None else (pkt.time - src.sent_time) * 1000
                entry = result.setdefault(ip, {"mac": pkt[Ether].src.lower()})
                if rtt is not None:
                    entry["rtt"] = rtt          # ICMP RTT = latency sebenarnya

        cap = AsyncSniffer(iface=iface, prn=collect, store=0)
        cap.start()
        try:
            sendp(arp_pkts, iface=iface, inter=0, verbose=False)
            sendp(icmp_pkts, iface=iface, inter=0, verbose=False)

            # Berhenti lebih awal setelah jeda sunyi, bukan menunggu timeout penuh.
            deadline = time.monotonic() + SWEEP_WINDOW_SECONDS
            floor = time.monotonic() + SWEEP_MIN_WINDOW_SECONDS
            last_count = 0
            quiet_since = time.monotonic()
            while time.monotonic() < deadline:
                time.sleep(0.05)
                if len(result) != last_count:
                    last_count = len(result)
                    quiet_since = time.monotonic()
                elif time.monotonic() > floor and \
                        time.monotonic() - quiet_since > SWEEP_QUIET_SECONDS:
                    break
        finally:
            cap.stop()

        return result

    def run(self):
        while not self.shutdown_event.is_set():
            started = time.monotonic()
            try:
                self.refresh_targets()
                targets = self.next_shard()
                found = self.sweep(targets)
                self.engine.apply_sweep(found, time.monotonic() - started)
                print(
                    f"[SWEEP] {time.monotonic() - started:.2f}s "
                    f"{len(targets)} alamat → {len(found)} balasan"
                )
            except Exception as exc:
                print(f"[ERROR] Sapuan gagal: {exc}")
            self.shutdown_event.wait(SWEEP_INTERVAL_SECONDS)
```

Catatan desain:

- **`inter=0`** mengirim seluruh shard sebagai satu burst. Untuk 256 alamat ini ~256 frame
  ARP + 256 frame ICMP ≈ 0,05 MB — setara satu `nmap -sn`, aman untuk LAN.
- **RTT akurat per host** karena `sendp` mengisi `pkt.sent_time` per paket dan `pkt.time`
  berasal dari timestamp Npcap (keduanya wall clock).
- **ICMP RTT adalah latency yang dilaporkan.** ARP RTT (≈0,2 ms) hanya dipakai sebagai
  cadangan diagnostik, tidak pernah ditampilkan sebagai latency jaringan.
- **Shard berputar** menjaga burst tetap kecil: dengan `/22` (1024 alamat), shard 256
  berarti cakupan penuh setiap 4 siklus.

### 5.2 `sniffer.py` — discovery pasif + antarmuka yang tidak basi

**a. Info antarmuka diperbarui setiap siklus** (memperbaiki `sniffer.py:27,61-67`):

```python
def refresh_interface_info(self):
    """Ambil (iface, ipv4, prefixlen) terkini dari psutil.

    local_ip tidak boleh dibekukan: DHCP renew dan roaming Wi-Fi membuat
    alamat berubah, dan subnet yang dipakai untuk menyapu harus ikut berubah.
    """
    import psutil

    target = self.target_iface
    for name, addrs in psutil.net_if_addrs().items():
        if not self._iface_matches(name, target):
            continue
        for a in addrs:
            if a.family == socket.AF_INET and not a.address.startswith("169.254."):
                self.local_ip = a.address
                self.local_prefixlen = a.netmask and \
                    ipaddress.ip_network(f"0.0.0.0/{a.netmask}").prefixlen or 24
                return target, self.local_ip, self.local_prefixlen
    return None
```

`get_local_subnet()` dan `get_local_ip()` dihapus. `get_local_ipv6()` tetap, tetapi memakai
`self.local_ip` yang sudah diperbarui.

**b. Discovery pasif — setiap paket memberi pasangan (MAC, IP)**, seperti Wireshark:

```python
def packet_callback(self, pkt):
    try:
        self.record_network_activity(pkt)
        self.record_ipv6_addresses(pkt)
        self.observe_passive(pkt)          # BARU — nol antrean
    except Exception as e:
        print(f"[SNIFF] Gagal mencatat aktivitas jaringan: {e}")


def observe_passive(self, pkt):
    """Catat perangkat dari paket apa pun yang membawa alamat IPv4.

    Ini jalur yang membuat Wireshark "langsung tahu" tanpa memindai:
    setiap frame yang lewat sudah memberi pasangan MAC ↔ IP. Hanya alamat
    di subnet lokal yang diterima, sehingga IP publik yang lewat gateway
    tidak pernah tercatat sebagai milik perangkat lokal.
    """
    if not pkt.haslayer(Ether) or not pkt.haslayer(IP):
        return

    src_mac = pkt[Ether].src.lower()
    src_ip = pkt[IP].src

    if not self.is_valid_mac(src_mac) or src_mac == self.local_mac:
        return
    if not self.is_local_ip(src_ip):
        return

    self.engine.observe(src_mac, src_ip, source="passive")
```

Cabang DHCP lama (`sniffer.py:114-120`) dihapus — sudah tercakup.

**c. Probe hanya dipicu untuk perangkat baru**, bukan dari dalam loop sapuan:

```python
# di dalam engine.apply_sweep(), bukan di sniffer
if is_new:
    workers.submit("probe", ..., priority="high", dedupe_key=("probe", mac))
```

**d. IPv6 digabung ke sapuan**, bukan handle capture kedua. `active_ipv6_scan()`
(`sniffer.py:281-346`) membuka `AsyncSniffer` kedua di antarmuka yang sama selama 3 detik
setiap 30 detik — CPU dua kali lipat untuk hasil yang bisa ditangkap sniffer pasif.
Probe IPv6 (`_build_ipv6_probes`, `sniffer.py:348-370`) dikirim dari `SubnetScanner.run()`
sekali setiap `IPV6_SCAN_INTERVAL_SECONDS`; balasannya ditangkap `record_ipv6_addresses()`
yang sudah ada. Thread `active_ipv6_scan` dihapus.

`scan_ipv6_neighbors()` tetap, tetapi `subprocess.check_output` diberi
`timeout=NETSH_TIMEOUT_SECONDS` (konstanta sudah ada di `config.py:47`, belum dipakai).

**e. Thread yang berjalan setelah redesign:** 1 passive sniff + 1 sweep + 1 arp-table +
1 ipv6-neighbors = **4** (sekarang 5, dengan dua di antaranya memblokir).

### 5.3 `timestamp_engine.py` — siklus hidup, status, latency

**a. Tiga jalur masuk yang eksplisit.** Menggantikan `update_device()` yang serba bisa:

```python
def observe(self, mac, ip="", source="passive", rtt=None):
    """Bukti segar: perangkat benar-benar mengirim/menjawab paket.
    Inilah satu-satunya jalur yang boleh menyetel last_seen dan status UP."""

def map_only(self, mac, ip):
    """Hanya memetakan MAC↔IP dari cache OS (`arp -a`).
    Cache bisa berjam-jam basi, jadi TIDAK menyentuh last_seen/status."""

def apply_sweep(self, found, duration):
    """Terapkan hasil satu sapuan: hidup → observe(), sisanya → hitung miss."""
```

`update_device()` dipertahankan sebagai pembungkus tipis untuk kompatibilitas
pemanggil lain, tetapi `status = "UP"` tanpa syarat di `timestamp_engine.py:246` dihapus.

**b. Status dan pruning.**

```python
# setelah apply_sweep
for mac, data in self.devices.items():
    if mac in answered:
        data["missed_sweeps"] = 0
    else:
        data["missed_sweeps"] = data.get("missed_sweeps", 0) + 1
```

`check_status()` menjadi:

```python
def check_status(self):
    now = datetime.now()
    with self._lock:
        for mac, data in list(self.devices.items()):
            age_min = (now - data["last_seen"]).total_seconds() / 60
            if age_min > TIMEOUT_MINUTES and data["status"] == "UP":
                data["status"] = "DOWN"
                data["down_since"] = now
        self._prune(now)
```

```python
def _prune(self, now):
    """Buang perangkat yang tidak akan pernah kembali.

    Perangkat DOWN TETAP ditampilkan (pemantauan harus bisa melihat yang
    mati) sampai DEVICE_RETAIN_DOWN_HOURS. Yang dibuang hanya:
      - entri tanpa IP yang tidak pernah menjawab (sisa probe/hostname liar)
      - perangkat DOWN yang sudah lewat masa retensi
    """
    for mac, data in list(self.devices.items()):
        if not data.get("ip") and data.get("missed_sweeps", 0) > 4:
            del self.devices[mac]
            self.dirty_devices.discard(mac)
            continue
        down_since = data.get("down_since")
        if data["status"] == "DOWN" and down_since and \
                (now - down_since).total_seconds() > DEVICE_RETAIN_DOWN_HOURS * 3600:
            del self.devices[mac]
            self.dirty_devices.discard(mac)
```

`dirty_devices` ikut dibersihkan (sekarang tumbuh selamanya karena `clear_dirty()` hanya
dipanggil di blok `if False:` pada `main.py:288`).

**c. Latency yang jujur.**

| Kondisi | Sekarang | Target |
|---|---|---|
| Perangkat baru, belum diukur | `latency: 0` → tampil `0ms` | field dihilangkan → tampil `-` |
| Balasan ICMP | `ping` subprocess | RTT sapuan |
| Tidak menjawab ICMP | `LATENCY_FAILED` | field dihilangkan |
| `<1 ms` | `LATENCY_BELOW_1MS`, **tidak pernah kedaluwarsa** | disimpan sebagai `0.5`, ikut kedaluwarsa |
| Perangkat DOWN | latency lama masih tampil | dihilangkan |

```python
stored_latency = latency          # None, bukan 0
...
def get_full_payload(self):
    ...
    include_latency = (
        isinstance(measured_latency, (int, float))
        and data["status"] == "UP"
        and latency_since is not None
        and (datetime.now() - latency_since).total_seconds() <= LATENCY_STALE_SECONDS
    )
```

`LATENCY_STALE_SECONDS` naik dari 60 → **90** (6 siklus sapuan), supaya satu siklus
yang meleset tidak mengosongkan kolom.

**d. `is_self` masuk ke payload.** Kontrak TypeScript mewajibkannya
(`types/network.ts:17`) tetapi `get_full_payload()` tidak pernah mengirimnya
(`timestamp_engine.py:459-474`), sehingga badge "Perangkat ini" tidak pernah muncul.

**e. `metrics` konsisten dengan `devices`.** Saat ini `total_up`/`total_down` dihitung dari
snapshot yang sama, jadi tetap benar — pastikan `_prune` dipanggil sebelum snapshot diambil,
bukan di tengah iterasi.

### 5.4 `workers.py` — prioritas, dedupe, dan executor DNS

**a. Dua antrean + dedupe.**

```python
class BackgroundWorkers:
    def __init__(self, supabase_client=None):
        ...
        self.queues = {
            "high":   queue.Queue(maxsize=256),    # probe port
            "normal": queue.Queue(maxsize=512),    # hostname
            "low":    queue.Queue(maxsize=512),    # ssid/bssid/supabase
        }
        self._inflight = set()                     # kunci dedupe
        self._inflight_lock = threading.Lock()

    def submit(self, name, fn, *args, priority="normal", dedupe_key=None):
        key = dedupe_key or (name, args)
        with self._inflight_lock:
            if key in self._inflight:
                self._bump("coalesced")
                return False
            self._inflight.add(key)

        try:
            self.queues[priority].put_nowait((key, name, fn, args))
        except queue.Full:
            with self._inflight_lock:
                self._inflight.discard(key)
            self._bump("dropped")
            print(f"[WARN] antrean {priority} penuh, tugas dibuang: {name}")
            return False
        self._bump("submitted")
        return True
```

`_worker_loop` mengambil dari `high` dulu, lalu `normal`, lalu `low` (dengan `get_nowait`
untuk dua yang pertama), dan selalu `self._inflight.discard(key)` di `finally`.

Dedupe adalah kuncinya: sapuan 15 detik tidak akan pernah menumpuk probe untuk perangkat
yang sama, karena yang kedua ditolak selama yang pertama masih berjalan.

**b. Executor DNS bersama.** `resolve_hostname` sekarang membuat `ThreadPoolExecutor`
baru per panggilan dan keluar dengan `shutdown(wait=True)`
(`workers.py:93-98`), sehingga lookup yang menggantung menahan thread worker **melebihi**
batas 2 detik:

```python
_DNS_POOL = ThreadPoolExecutor(max_workers=4, thread_name_prefix="dns")

def resolve_hostname(ip):
    future = _DNS_POOL.submit(socket.gethostbyaddr, ip)
    try:
        return future.result(timeout=HOSTNAME_TIMEOUT_SECONDS)[0]
    except (FutureTimeoutError, Exception):
        future.cancel()
        return "Unknown"
```

Lookup yang macet sekarang hanya menghabiskan 1 dari 4 thread DNS, bukan satu dari 8 worker.

**c. `ping_latency` dihapus dari jalur produksi.** Fungsi dan `ping_parser` tetap ada
(dipakai test), tetapi tidak ada lagi `submit("ping", ...)`. Ini menghapus 7.950 tugas
yang dibuang — kategori terbesar.

### 5.5 `timestamp_engine.py` — probe port paralel

13 port berurutan × 0,3 s = 3,9 s per perangkat (`timestamp_engine.py:95-106`).

```python
async def check_open_ports(self, ip):
    async def probe(port):
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(ip, port), timeout=PORT_PROBE_TIMEOUT
            )
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass
            return port
        except Exception:
            return None

    results = await asyncio.gather(*(probe(p) for p in PROBE_PORTS))
    return {p for p in results if p}
```

Waktu terburuk turun dari 3,9 s → **0,3 s**, sehingga throughput probe naik 13×.

### 5.6 `network_activity.py` — polusi IP publik pada gateway

`record_packet` menerima `outbound=False` untuk setiap paket yang `Ether.dst`-nya adalah MAC
gateway. Untuk lalu lintas keluar host ini, gateway jadi pemilik `local_ip = dst_ip` —
yaitu alamat publik tujuan. Hasilnya MAC `0c:73:eb:92:09:b6` mengklaim **45 alamat IPv4 publik**.

Perbaikan di sisi pemanggil (`sniffer.py:166-170`), bukan di collector:

```python
known_devices = self.engine.devices
if src_mac in known_devices:
    collector.record_packet(src_mac, True, proto, src_ip, dst_ip, src_port, dst_port)

# Paket masuk hanya dicatat bila tujuan IPv4-nya benar-benar milik perangkat
# lokal. Tanpa syarat ini, setiap paket keluar membuat gateway "memiliki"
# alamat publik tujuan.
if (dst_mac in known_devices and not self.is_multicast_mac(dst_mac)
        and self.is_local_ip(dst_ip)):
    collector.record_packet(dst_mac, False, proto, src_ip, dst_ip, src_port, dst_port)
```

`is_local_ip()` memakai subnet yang sudah dihitung di 5.2, sehingga definisinya ikut
berubah saat netmask berubah.

### 5.7 `config.py` — konstanta baru

```python
# --- Sapuan ---
SWEEP_INTERVAL_SECONDS = 15        # jeda antar-shard
SWEEP_SHARD_SIZE = 256             # alamat per siklus (1 burst)
SWEEP_WINDOW_SECONDS = 1.2         # batas atas jendela tangkap
SWEEP_MIN_WINDOW_SECONDS = 0.4     # jangan berhenti terlalu cepat
SWEEP_QUIET_SECONDS = 0.25         # berhenti setelah sunyi selama ini

# --- Siklus hidup perangkat ---
DEVICE_RETAIN_DOWN_HOURS = 24      # perangkat DOWN tetap tampil selama ini
DEVICE_MAX_MISSED_SWEEPS = 4       # tanpa IP + 4 miss → buang

# --- Probe ---
PORT_PROBE_TIMEOUT = 0.3
PROBE_PORTS = (80, 443, 554, 631, 1900, 8000, 8008, 8009,
               8291, 9100, 8080, 8443, 37777)

LATENCY_STALE_SECONDS = 90         # dari 60
```

Konstanta yang tidak dipakai lagi: `ARP_SCAN_INTERVAL_SECONDS`, `ARP_TIMEOUT_SECONDS`
(masih dipakai sebagai jendela IPv6 — ganti dengan konstanta sendiri), `PING_INTERVAL_SECONDS`.

### 5.8 `main.py` — health yang bisa dipercaya

`/health` sekarang hanya `{"status":"ok"}`. Tambahkan:

```python
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "devices": len(engine.devices),
        "workers": workers.get_stats(),
        "scan": engine.scan_stats(),      # durasi terakhir, balasan, shard
        "uptime_seconds": int(time.time() - STARTED_AT),
    }
```

`broadcast_loop` tidak berubah strukturnya: tetap mengirim snapshot lengkap setiap 2 detik.
Yang berubah hanya isi snapshot.

### 5.9 Frontend — dua penjaga kecil

Kontrak `useWebSocket.ts:80` mengganti state secara keseluruhan (`setDevices(data.devices)`),
jadi payload **wajib** berupa snapshot lengkap. Redesign ini tidak mengubah itu.

1. `app/page.tsx:1069` — `dev.latency !== undefined` tidak menangkap `null`:
   ```tsx
   {typeof dev.latency === "number" ? `${dev.latency}ms` : "-"}
   ```
2. `app/page.tsx:282-293` — pengurutan memperlakukan `undefined` sebagai `0` (tetap di
   tempatnya), sehingga kolom latency terlihat tidak terurut. Ubah agar nilai kosong
   selalu di akhir:
   ```ts
   if (typeof aVal !== typeof bVal) return typeof aVal === "number" ? -1 : 1;
   ```

Tidak ada perubahan lain di frontend. `ipv6` pada payload tetap tidak dipakai UI aktif;
popup detail memakai REST `/api/device/{mac}/network`.

---

## 6. Sebelum vs sesudah

| Metrik | Sekarang | Target | Cara ukur |
|---|---|---|---|
| Cakupan subnet | 10.10.9.0/24 (256) | 10.10.8.0/22 (1024) | log `[SWEEP]`, `ipaddress` |
| Durasi satu sapuan | 3 s blokir + 4 s sleep | 0,6–1,0 s | `[SWEEP] 0.72s` |
| Perangkat baru terlihat | ≤7 s (dalam /24), tak terbatas (luar) | <2 s pasif, <20 s sapuan | uji colok perangkat |
| Tugas per siklus | 3 × jumlah host | 0 (sapuan) + 1 per perangkat baru | `get_stats()` |
| Tugas dibuang | 15.550 (23,7%) | **0** | `dropped` |
| Antrean | 847 / 1024 (83%) | <20 | `queued` |
| Latency tersedia | 3 / 66 | semua host yang menjawab ICMP (~11–14) | payload WS |
| Probe port | 3,9 s | 0,3 s | log worker |
| Perangkat hantu | tak pernah dibuang | diarsip setelah 24 jam DOWN | `len(devices)` |
| IP publik di perangkat lokal | 45 (gateway) | 0 | `/api/device/{mac}/network` |
| Thread | 5 (2 memblokir) | 4 | `threading.enumerate()` |

---

## 7. Urutan implementasi

Setiap fase berdiri sendiri dan bisa diverifikasi tanpa fase berikutnya.

**Fase 0 — wajib lebih dulu.** Backend berjalan tanpa `--reload`
(`bin/gakkum.js`), jadi semua perubahan kode IPv6 yang sudah ada **belum pernah dieksekusi**.
Restart dari terminal elevated:

```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
node bin/gakkum.js
```

Tanpa ini, tidak ada satu pun perubahan di bawah yang bisa diuji.

**Fase 1 — cakupan & kecepatan (dampak terbesar).**
`scanner.py` + `refresh_interface_info()` + hapus `active_arp_scan()`.
Verifikasi: log `[SWEEP]` menyebut `10.10.8.0/22` dan durasi <1,2 s; jumlah host yang
ditemukan naik dari 11–14 menjadi seluruh host hidup di /22.

**Fase 2 — discovery pasif.** `observe_passive()` + `engine.observe()`.
Verifikasi: colok satu perangkat baru, harus muncul <2 detik tanpa menunggu sapuan.

**Fase 3 — antrean.** Prioritas + dedupe + hapus tugas `ping` + probe paralel + executor DNS.
Verifikasi: `dropped` berhenti naik selama 10 menit; `queued` <20.

**Fase 4 — siklus hidup.** `map_only()` untuk `arp -a`, `_prune()`, latency jujur, `is_self`.
Verifikasi: `len(devices)` stabil, tidak lagi naik monoton; latency muncul untuk semua
host yang menjawab ICMP dan hilang saat perangkat DOWN.

**Fase 5 — kebersihan.** Perbaikan `network_activity`, BPF filter opsional untuk sniffer
pasif, `/health` baru, penjaga frontend.

**Fase 6 — test.** `test_ping_latency.py` punya dua assertion yang membaca isi `sniffer.py`
(`:237`, `:252`) dan akan gagal karena `ping` tidak lagi dipanggil dari sana. Perbarui
menjadi assertion terhadap `scanner.py`. Tambahkan test untuk `SubnetScanner.next_shard()`
(rotasi & cakupan penuh) dan untuk dedupe worker.

### Risiko

| Risiko | Mitigasi |
|---|---|
| Burst 512 frame memicu port-security/IDS | `SWEEP_SHARD_SIZE` bisa diturunkan ke 128; `inter` dinaikkan ke 0,001 |
| Npcap menolak BPF filter tertentu | filter opsional, uji di Fase 5, bukan Fase 1 |
| `pkt.sent_time` tidak terisi pada scapy versi ini | fallback: timestamp manual per batch 16 paket |
| Perangkat yang memblokir ICMP tetap `-` | perilaku benar; opsional: TCP RTT ke port 80/443 sebagai cadangan |
| Pruning menghapus perangkat yang sebenarnya hidup | retensi 24 jam + `missed_sweeps` dari dua sumber (sapuan & pasif) |

---

## 8. Kriteria terima

Rancangan dianggap berhasil bila, setelah 10 menit berjalan:

1. `[SWEEP]` mencatat cakupan `10.10.8.0/22` dengan durasi <1,2 s per shard.
2. `workers.get_stats()["dropped"] == 0`.
3. `queued` <20 dan `alive_workers == 8`.
4. Payload WS memuat latency untuk setiap perangkat UP yang menjawab ICMP.
5. Perangkat baru muncul di dasbor <2 detik setelah paket pertamanya terlihat.
6. `len(engine.devices)` tidak naik monoton — stabil di sekitar jumlah perangkat nyata.
7. Tidak ada alamat IP publik di `ipv4` milik perangkat gateway
   (`/api/device/0c:73:eb:92:09:b6/network`).
8. `[SCAN] IPv6: N balasan, M alamat baru` muncul di log.
9. `npm run build` lolos.

---

## 9. Yang sengaja TIDAK diubah

- **Kontrak WebSocket.** `type: "DEVICE_UPDATE"`, `devices` sebagai snapshot lengkap,
  `metrics.total_up`/`total_down` konsisten dengan isi array.
- **Invarian IPv6.** `record_ipv6_address()` tetap tidak menyentuh `last_seen`, `status`,
  `ip`, maupun `latency`. IPv6 hanya memperkaya daftar alamat.
- **Pemantauan perangkat DOWN.** Sesuai arahan: perangkat mati tetap dipantau dan tetap
  tampil. Sapuan menguji *semua* alamat setiap siklus — perangkat DOWN justru mendapat
  bukti ketidakhadiran yang lebih kuat daripada sebelumnya (12 sapuan berturut-turut
  tanpa balasan dalam 3 menit), bukan dikeluarkan dari pemantauan.
- **REST `/api/device/{mac}/network`** tetap mengembalikan `ipv4`, `ipv6`, `protocols`,
  `connections` sebagai array.
- **Supabase sync** tetap nonaktif (`main.py:288`). Redesign ini tidak mengaktifkannya.
