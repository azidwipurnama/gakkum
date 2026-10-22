import time
import asyncio
import threading
from datetime import datetime, timedelta
import socket
from config import (
    TIMEOUT_MINUTES,
    ALERT_DOWN_MINUTES,
    BSSID_MAPPING,
    LATENCY_STALE_SECONDS,
    CATEGORY_RECHECK_SECONDS,
)
from rooms import room_for_bssid, room_id_for_bssid, room_label
from ping_parser import LATENCY_FAILED, LATENCY_BELOW_1MS
from network_activity import NetworkActivityCollector

try:
    from mac_vendor_lookup import MacLookup
    mac_lookup = MacLookup()
except ImportError:
    mac_lookup = None

# Normalisasi kunci mapping BSSID ke huruf kecil agar cocok dengan hasil wifi_bssid.py
BSSID_MAPPING_NORMALIZED = {k.lower(): v for k, v in BSSID_MAPPING.items()}

PREFIX_MAP = {
    "9C:CE:88": "ASUSTeK Computer",
    "1E:E3:C1": "Randomized MAC (Privacy)",
    "00:16:78": "ARRIS Group",
    "50:57:9C": "Apple, Inc.",
    "0C:73:EB": "Apple, Inc.",
}

# Daftar vendor untuk klasifikasi cadangan ketika hostname & port tidak menentukan.
CCTV_VENDORS = ['Hikvision', 'Dahua', 'Axis', 'Uniview', 'Foscam', 'Tapo', 'Imou', 'Hanwha', 'Amcrest', 'Reolink']
TV_VENDORS = ['LG Electronics', 'Sony', 'TCL', 'Hisense', 'Roku', 'Changhong', 'Skyworth', 'Vizio']
ROUTER_VENDORS = ['Cisco', 'MikroTik', 'Ubiquiti', 'TP-Link', 'Ruijie']
PRINTER_VENDORS = ['Epson', 'Canon', 'Brother', 'Xerox', 'Kyocera']
SMARTPHONE_VENDORS = ['Apple', 'Samsung', 'Xiaomi', 'Oppo', 'Vivo', 'Realme', 'Huawei']
LAPTOP_VENDORS = ['Intel', 'Dell', 'Lenovo', 'HP', 'Asus', 'Acer']

# Keyword hostname yang menandakan jenis perangkat secara eksplisit.
CCTV_HOSTNAME_KEYWORDS = ['cctv', 'cam', 'ipc', 'dvr', 'nvr', 'ipcam', 'camera', 'rtsp']
TV_HOSTNAME_KEYWORDS = ['tv', 'smarttv', 'bravia', 'webos', 'tizen', 'chromecast', 'mibox', 'appletv']


def vendor_matches(vendor, names):
    """Cocokkan vendor hasil lookup MAC dengan daftar nama (case-insensitive)."""
    vendor_lower = (vendor or '').lower()
    return any(name.lower() in vendor_lower for name in names)


def normalize_ipv6(address):
    """Kembalikan alamat IPv6 unicast dalam bentuk huruf kecil, atau None.

    Zone id (mis. ``fe80::1%12``) dibuang karena hanya berlaku di host yang
    melihatnya. Multicast (ff00::/8), unspecified (::), dan loopback (::1)
    bukan alamat milik perangkat, jadi tidak disimpan.
    """
    if not address:
        return None
    value = address.split('%', 1)[0].strip().lower()
    if ':' not in value or value in ('::', '::1') or value.startswith('ff'):
        return None
    return value


class TimestampEngine:
    def __init__(self):
        self._lock = threading.RLock()
        self.devices = {} # {mac: {"ip": "", "last_seen": timestamp, "status": "UP", "vendor": "", "hostname": "", "bssid": "", "category": ""}}
        self.dirty_devices = set() # Track devices that need Supabase sync
        self.recent_replies = [] # Track devices responding to ARP per cycle
        self.network_activity = NetworkActivityCollector() # Detail jaringan pasif per perangkat

        # Alamat IPv6 untuk MAC yang belum dikenal (belum menjawab ARP).
        # Paket IPv6 sering terlihat lebih dulu daripada hasil ARP scan; tanpa
        # buffer ini alamatnya dibuang dan perangkat tampak "tidak punya IPv6".
        # Isinya dipindahkan ke perangkat saat update_device() membuat entri baru.
        self._pending_ipv6 = {}

        # Heartbeat tracking
        self._heartbeat_lock = threading.Lock()
        self.heartbeats = {}

    def mark_heartbeat(self, name):
        with self._heartbeat_lock:
            self.heartbeats[name] = time.time()

    def heartbeat_age(self, name):
        with self._heartbeat_lock:
            ts = self.heartbeats.get(name)
            return time.time() - ts if ts else float('inf')

    async def check_open_ports(self, ip, ports=[80, 443, 554, 631, 1900, 8000, 8008, 8009, 8291, 9100, 8080, 8443, 37777]):
        open_ports = []
        for port in ports:
            try:
                conn = asyncio.open_connection(ip, port)
                _, writer = await asyncio.wait_for(conn, timeout=0.3)
                writer.close()
                await writer.wait_closed()
                open_ports.append(port)
            except:
                continue
        return open_ports

    def detect_device_category(self, ip, mac, hostname, open_ports=None):
        vendor = self.lookup_vendor(mac)

        # Determine category based on vendor, hostname, and IP
        category = "General Device"

        hostname_lower = (hostname or '').lower()

        # HOSTNAME-BASED QUICK CHECK (prioritas tertinggi jika nama device eksplisit).
        # Dicek sebelum MAC acak: perangkat ber-MAC acak pun bisa bernama
        # "CCTV-Lobby-01" atau "LivingRoom-SmartTV".
        if any(kw in hostname_lower for kw in CCTV_HOSTNAME_KEYWORDS):
            return "CCTV / IP Camera", vendor
        if any(kw in hostname_lower for kw in TV_HOSTNAME_KEYWORDS):
            return "Smart TV", vendor

        # MAC acak / locally administered: bit kedua oktet pertama bernilai 1,
        # sehingga karakter hex keduanya 2, 6, A, atau E.
        first_octet = mac.replace('-', ':').split(':')[0]
        if len(first_octet) == 2 and first_octet[1].lower() in ('2', '6', 'a', 'e'):
            return "Private MAC (Smartphone)", "Private MAC (Smartphone)"

        # PORT-BASED CLASSIFICATION
        if open_ports:
            # CCTV / IP CAMERA:
            # - RTSP (554) atau Dahua (37777) selalu kuat sebagai CCTV.
            # - Port 8000 HANYA CCTV jika vendor adalah produsen kamera/NVR yang dikenal,
            #   atau jika hostname mengandung keyword kamera, BUKAN untuk vendor netral/unknown/laptop.
            is_cctv_vendor = vendor_matches(vendor, CCTV_VENDORS)

            if 554 in open_ports or 37777 in open_ports or (8000 in open_ports and is_cctv_vendor):
                category = "CCTV / IP Camera"
            # SMART TV / STREAMING: Google Cast (8008, 8009), Samsung TV (9197), DLNA/UPnP (1900)
            elif 8008 in open_ports or 8009 in open_ports or 9197 in open_ports:
                category = "Smart TV"
            # PRINTER: Port 9100 (JetDirect) or 631 (IPP)
            elif 9100 in open_ports or 631 in open_ports:
                category = "Printer"
            # ROUTER / AP: Port 8291 (MikroTik) OR (Port 80/443 AND IP suffix .1/.254)
            elif 8291 in open_ports or ((80 in open_ports or 443 in open_ports) and (ip.endswith('.1') or ip.endswith('.254'))):
                category = "Router / AP"
            # WEB SERVER: Port 80, 443, 8080, 8443, atau 8000. Port 8000 dipakai
            # banyak dev server/web server, jadi ia bukti "ada layanan HTTP",
            # bukan bukti CCTV (lihat aturan CCTV di atas).
            elif any(p in open_ports for p in [80, 443, 8000, 8080, 8443]):
                category = "Web Server"

        # FALLBACK VENDOR / HOSTNAME-BASED detection (only if still General Device).
        # Urutan penting: pakai elif supaya hasil pertama yang cocok tidak ditimpa
        # aturan berikutnya (dulu rangkaian if terpisah membuat aturan terakhir
        # selalu menang). Hostname eksplisit diperiksa lebih dulu karena OUI vendor
        # tidak bisa membedakan MacBook dari iPhone (dua-duanya Apple).
        if category == "General Device":
            if hostname_lower.startswith(('desktop-', 'laptop-', 'macbook')):
                category = "Laptop / PC"
            elif vendor_matches(vendor, CCTV_VENDORS):
                category = "CCTV / IP Camera"
            elif vendor_matches(vendor, TV_VENDORS):
                category = "Smart TV"
            elif vendor_matches(vendor, ROUTER_VENDORS) or ip.endswith('.1'):
                category = "Router / AP"
            elif vendor_matches(vendor, PRINTER_VENDORS):
                category = "Printer"
            elif vendor_matches(vendor, LAPTOP_VENDORS):
                category = "Laptop / PC"
            elif vendor_matches(vendor, SMARTPHONE_VENDORS):
                # Samsung/Xiaomi juga membuat TV, tetapi hostname TV sudah
                # ditangani oleh quick check di atas.
                category = "Smartphone"

        return category, vendor

    async def probe_device_ports(self, ip, mac):
        open_ports = await self.check_open_ports(ip)
        with self._lock:
            if mac not in self.devices:
                return False
            hostname = self.devices[mac].get('hostname', "")
            category, vendor = self.detect_device_category(ip, mac, hostname, open_ports=open_ports)
            self.devices[mac]['category'] = category
            self.devices[mac]['vendor'] = vendor
            # Tandai kapan kategori terakhir diverifikasi supaya update_device()
            # tahu kapan perlu probe ulang (lihat CATEGORY_RECHECK_SECONDS).
            self.devices[mac]['category_checked_at'] = datetime.now()
        return True

    def update_device(self, mac, ip="", hostname="", bssid="", latency=None, is_blacklisted=False, is_self=False):
        with self._lock:
            now = datetime.now()
            mac = mac.lower()

            if mac not in self.devices:
                print(f"New MAC detected: {mac}")
                vendor = self.lookup_vendor(mac)
                display_name = hostname
                if not display_name or display_name.lower() == "loading...":
                    display_name = f"{vendor} Device"

                stored_latency = 0 if latency is None else latency
                self.devices[mac] = {
                    "ip": ip,
                    "last_seen": now,
                    "status": "UP",
                    "vendor": vendor,
                    "hostname": display_name,
                    "bssid": bssid,
                    "category": "General Device",
                    "category_checked_at": None,
                    "latency": stored_latency,
                    "latency_since": now,
                    "is_blacklisted": is_blacklisted,
                    "is_self": is_self,
                    # Ruangan tempat perangkat ini terakhir terlihat (diisi oleh
                    # apply_host_bssid). "room_history" menyimpan semua ruangan
                    # agar riwayat perpindahan host tidak hilang.
                    "room_id": room_id_for_bssid(bssid),
                    "ap_id": (room_for_bssid(bssid) or {}).get("ap_id", ""),
                    "room_history": {},
                    # Alamat IPv6 yang pernah terlihat untuk perangkat ini
                    # (ip -> waktu terlihat). Diisi oleh record_ipv6_address()
                    # dan sengaja TIDAK memengaruhi last_seen. Alamat yang
                    # sempat terlihat sebelum perangkat terdaftar ikut dibawa.
                    "ipv6_addresses": dict(self._pending_ipv6.pop(mac, {})),
                }
                self.dirty_devices.add(mac)
                if ip:
                    self.recent_replies.append({
                        "ip": ip,
                        "mac": mac,
                        "ts": now.isoformat(),
                        "vendor": vendor
                    })
                return True, ip

            changed = False
            if self.devices[mac]["last_seen"] != now:
                self.devices[mac]["last_seen"] = now

            self.devices[mac]["status"] = "UP"

            if ip and self.devices[mac]["ip"] != ip:
                self.devices[mac]["ip"] = ip
                changed = True
            if bssid and self.devices[mac]["bssid"] != bssid:
                self.devices[mac]["bssid"] = bssid
                info = room_for_bssid(bssid)
                if info:
                    self.devices[mac]["room_id"] = info["room_id"]
                    self.devices[mac]["ap_id"] = info["ap_id"]
                changed = True
            if latency is not None:
                if self.devices[mac]["latency"] != latency:
                    self.devices[mac]["latency"] = latency
                    self.devices[mac]["latency_since"] = now
            self.devices[mac]["is_blacklisted"] = is_blacklisted
            self.devices[mac]["is_self"] = is_self

            if hostname and hostname.lower() != "loading...":
                if self.devices[mac]["hostname"] != hostname:
                    self.devices[mac]["hostname"] = hostname
                    # Hostname ikut menentukan kategori (mis. "LivingRoom-SmartTV"),
                    # jadi kategori perlu dihitung ulang begitu nama berubah.
                    self.devices[mac]["category_checked_at"] = None
                    changed = True
            elif self.devices[mac]["hostname"] == "Loading..." or self.devices[mac]["hostname"] == "Loading...":
                self.devices[mac]["hostname"] = f"{self.devices[mac]['vendor']} Device"
                changed = True

            if changed:
                self.dirty_devices.add(mac)

            current_ip = self.devices[mac].get("ip") or ip
            if current_ip:
                self.recent_replies.append({
                    "ip": current_ip,
                    "mac": mac,
                    "ts": now.isoformat(),
                    "vendor": self.devices[mac].get("vendor", "")
                })

            if self.needs_category_probe(mac, now):
                return True, current_ip
            return False, None

    def record_ipv6_address(self, mac, address):
        """Catat alamat IPv6 sebuah perangkat TANPA menyentuh last_seen.

        Alamat IPv6 disimpan di bucket terpisah (ipv6_addresses) dan tidak
        mengubah last_seen, status, ip, maupun latency. Dengan begitu fitur
        IPv6 tidak mengganggu arti "terakhir terkoneksi" yang sudah dipakai
        dasbor dan laporan.

        Return True bila alamat ini baru untuk perangkat tersebut.
        """
        if not mac:
            return False
        normalized = normalize_ipv6(address)
        if normalized is None:
            return False

        mac = mac.lower()
        now_iso = datetime.now().isoformat()
        with self._lock:
            data = self.devices.get(mac)
            if data is None:
                # Perangkat belum dikenal (ARP scan belum menemukannya). Jangan
                # buat entri perangkat dari paket IPv6 saja — perangkat tanpa
                # IPv4 tidak tampil di dasbor — tetapi simpan alamatnya supaya
                # tidak hilang saat perangkat akhirnya terdaftar.
                pending = self._pending_ipv6.get(mac)
                if pending is None:
                    if len(self._pending_ipv6) >= 512:
                        return False
                    pending = {}
                    self._pending_ipv6[mac] = pending
                is_new = normalized not in pending
                pending[normalized] = now_iso
                return is_new
            bucket = data.setdefault("ipv6_addresses", {})
            is_new = normalized not in bucket
            bucket[normalized] = now_iso
            if is_new:
                self.dirty_devices.add(mac)
            return is_new

    def needs_category_probe(self, mac, now=None):
        """True bila kategori perangkat belum pernah diprobe atau sudah kedaluwarsa.

        Sebelumnya probe hanya dipicu saat kategori masih "General Device", sehingga
        perangkat yang sekali salah kategori (mis. port 8000 milik laptop dianggap
        CCTV) akan salah selamanya. Dengan stempel waktu ini kategori diverifikasi
        ulang secara berkala, sekaligus membatasi laju probe agar antrean worker
        tidak penuh.
        """
        now = now or datetime.now()
        with self._lock:
            data = self.devices.get(mac)
            if data is None:
                return False
            checked_at = data.get("category_checked_at")
            if checked_at is None:
                return True
            return (now - checked_at).total_seconds() > CATEGORY_RECHECK_SECONDS

    def apply_host_bssid(self, bssid):
        """Tandai perangkat aktif sebagai terlihat dari AP host saat ini.

        BSSID yang dilaporkan adapter adalah AP tempat laptop monitoring
        terhubung, bukan AP milik tiap perangkat. Jadi yang dicatat adalah
        "perangkat ini terlihat saat host berada di ruangan X". Catatan itu
        dipakai denah untuk menyaring titik per ruangan.

        Perangkat yang sudah punya BSSID sendiri tidak ditimpa (BSSID itu
        berasal dari sumber yang lebih spesifik), tetapi riwayat ruangannya
        tetap diperbarui selama perangkat masih aktif.
        """
        if not bssid:
            return 0

        room = room_for_bssid(bssid)
        now = datetime.now()
        # Perangkat yang sudah lama tidak terlihat tidak ikut dicap: kalau
        # tidak, semua perangkat yang pernah muncul akan terus dianggap ada
        # di ruangan tempat host berada sekarang.
        active_since = now - timedelta(minutes=TIMEOUT_MINUTES)
        now_iso = now.isoformat()
        stamped = 0

        with self._lock:
            for data in self.devices.values():
                if not data.get("bssid"):
                    data["bssid"] = bssid

                if room is None:
                    continue
                last_seen = data.get("last_seen")
                if last_seen is not None and last_seen < active_since:
                    continue

                data.setdefault("room_history", {})[room["room_id"]] = now_iso
                data["room_id"] = room["room_id"]
                data["ap_id"] = room["ap_id"]
                stamped += 1

        return stamped

    def check_status(self):
        now = datetime.now()
        updates = []
        with self._lock:
            # Iterate over a copy to avoid RuntimeError
            for mac, data in list(self.devices.items()):
                delta = (now - data["last_seen"]).total_seconds() / 60
                if delta > TIMEOUT_MINUTES and data["status"] == "UP":
                    data["status"] = "DOWN"
                    print(f"Device {mac} is DOWN")
                    updates.append({"mac": mac, "status": "DOWN"})
        return updates

    def get_full_payload(self):
        devices_list = []
        total_up = 0
        total_down = 0

        with self._lock:
            # Snapshot devices to avoid RuntimeError
            snapshot = dict(self.devices)

        for mac, data in snapshot.items():
            if not data.get("ip"):
                continue

            if data["status"] == "UP": total_up += 1
            else: total_down += 1

            # Ruangan diambil dari BSSID perangkat bila dikenal; kalau tidak,
            # pakai ruangan tempat perangkat terakhir terlihat (diisi oleh
            # apply_host_bssid).
            device_room_id = room_id_for_bssid(data.get("bssid")) or data.get("room_id") or ""
            location = room_label(device_room_id)

            room_history = sorted((data.get("room_history") or {}).keys())
            if device_room_id and device_room_id not in room_history:
                room_history.append(device_room_id)

            measured_latency = data.get("latency", 0)
            latency_since = data.get("latency_since")

            include_latency = True
            if latency_since is not None:
                age = (datetime.now() - latency_since).total_seconds()
                if measured_latency is LATENCY_FAILED or (
                    isinstance(measured_latency, (int, float))
                    and age > LATENCY_STALE_SECONDS
                ):
                    include_latency = False

            # Penanda dari ping_parser (LATENCY_FAILED / LATENCY_BELOW_1MS)
            # bukan angka. Mereka tidak lolos json.dumps sehingga send_json
            # WebSocket melempar exception dan seluruh broadcast ke klien
            # tergantung padanya. LATENCY_BELOW_1MS dilaporkan sebagai
            # 0.5 ms; LATENCY_FAILED sudah dikecualikan di atas.
            if measured_latency is LATENCY_BELOW_1MS:
                measured_latency = 0.5

            ipv6_addresses = [
                {"address": address, "last_seen": seen_at}
                for address, seen_at in (data.get("ipv6_addresses") or {}).items()
            ]
            ipv6_addresses.sort(key=lambda item: item["last_seen"], reverse=True)

            device_entry = {
                "ip": data.get("ip", ""),
                "mac": mac,
                "hostname": data.get("hostname", ""),
                "vendor": data.get("vendor", ""),
                "category": data.get("category", "General Device"),
                "location": location,
                "room_id": device_room_id,
                "ap_id": data.get("ap_id", ""),
                "rooms": room_history,
                "bssid": data.get("bssid", ""),
                "status": data["status"],
                "last_seen": data["last_seen"].isoformat(),
                "ipv6": ipv6_addresses,
                "is_blacklisted": data.get("is_blacklisted", False)
            }
            if include_latency:
                # Selalu berupa angka di sini sehingga payload bisa
                # diserialisasi JSON dengan aman.
                device_entry["latency"] = measured_latency
            devices_list.append(device_entry)

        return {
            "type": "DEVICE_UPDATE",
            "devices": devices_list,
            "metrics": {
                "total_up": total_up,
                "total_down": total_down
            }
        }

    def get_dirty_devices(self):
        with self._lock:
            dirty = [self.devices[mac].copy() for mac in self.dirty_devices if mac in self.devices]
            return dirty

    def clear_dirty(self):
        with self._lock:
            self.dirty_devices.clear()

    def mark_all_dirty(self):
        with self._lock:
            self.dirty_devices.update(self.devices.keys())

    def get_recent_replies(self):
        with self._lock:
            replies = self.recent_replies[:200]
            self.recent_replies = []
            return replies

    def get_network_details(self, mac):
        mac = (mac or "").lower()
        with self._lock:
            device = self.devices.get(mac)
            if device is None:
                return None
            is_self = bool(device.get("is_self"))
            stored_ipv6 = dict(device.get("ipv6_addresses") or {})

        details = self.network_activity.snapshot(mac, include_host=is_self)

        # Alamat IPv6 yang tersimpan di record perangkat digabung dengan hasil
        # jendela pantau pasif. Tanpa ini alamat IPv6 hilang dari popup setelah
        # 300 detik tanpa paket, padahal perangkatnya masih terdaftar dan
        # alamatnya tetap valid.
        known = {item["address"].lower() for item in details["ipv6"]}
        for address, seen_at in stored_ipv6.items():
            if address.lower() not in known:
                details["ipv6"].append({"address": address, "last_seen": seen_at})
        details["ipv6"].sort(key=lambda item: item["last_seen"], reverse=True)
        return details

    def lookup_vendor(self, mac):
        if mac_lookup:
            try:
                vendor = mac_lookup.lookup(mac)
                return vendor
            except Exception:
                pass

        prefix = mac[:8].upper()
        return PREFIX_MAP.get(prefix, f"Unknown ({prefix})")
