from scapy.all import (
    sniff, ARP, Ether, IP, IPv6, TCP, UDP, ICMP, srp, conf,
    get_working_if, get_if_hwaddr, in6_getifaddr, ICMPv6EchoRequest,
    AsyncSniffer, sendp, ICMPv6MLQuery, DNS, DNSQR
)
import threading
import time
import subprocess
import re
import socket
import asyncio
from config import (
    ARP_SCAN_INTERVAL_SECONDS,
    ARP_TIMEOUT_SECONDS,
    IPV6_SCAN_INTERVAL_SECONDS,
    SNIFFER_RESTART_DELAY_SECONDS
)
from ping_parser import parse_ping_latency, LATENCY_FAILED
from workers import resolve_hostname, ping_latency

class NetworkSniffer:
    def __init__(self, engine, workers, shutdown_event):
        self.engine = engine
        self.workers = workers
        self.shutdown_event = shutdown_event
        self.target_iface = self.detect_interface()
        self.local_ip = self.get_local_ip()

    def get_local_ip(self):
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
        except Exception:
            return "127.0.0.1"
        finally:
            s.close()

    def is_valid_mac(self, mac):
        if mac.lower() == 'ff:ff:ff:ff:ff:ff': return False
        if mac.lower().startswith('01:00:5e'): return False
        return True

    def is_valid_client_ip(self, ip, mac):
        if not self.is_valid_mac(mac): return False
        if ip == '127.0.0.1': return False
        if ip.endswith('.255'): return False
        if ip.startswith(("224.", "235.", "239.")):
            return False
        return True

    def detect_interface(self):
        try:
            iface = get_working_if()
            print(f"Detected working interface: {iface}")
            return iface
        except Exception as e:
            print(f"[ERROR] Failed to detect interface: {e}")
            return "Ethernet"

    def get_local_subnet(self):
        if not self.local_ip or self.local_ip == "127.0.0.1":
            return "192.168.100.0/24"
        parts = self.local_ip.split(".")
        if len(parts) != 4:
            return "192.168.100.0/24"
        return ".".join(parts[:3]) + ".0/24"

    def get_local_ipv6(self):
        """Ambil alamat IPv6 link-local antarmuka yang dipakai Scapy.

        in6_getifaddr() mengembalikan alamat dari SEMUA adapter (termasuk
        VirtualBox/Bluetooth). Memakai alamat dari adapter lain membuat balasan
        IPv6 dikirim ke antarmuka yang salah, sehingga seolah-olah tidak ada
        perangkat yang menjawab. Karena itu alamat dicocokkan lewat IPv4 host
        (psutil) lebih dulu, baru jatuh ke pencarian bebas.
        """
        if self.local_ip and self.local_ip != "127.0.0.1":
            try:
                import psutil

                for addrs in psutil.net_if_addrs().values():
                    owns_ipv4 = any(
                        a.family == socket.AF_INET and a.address == self.local_ip
                        for a in addrs
                    )
                    if not owns_ipv4:
                        continue
                    for a in addrs:
                        if a.family != socket.AF_INET6:
                            continue
                        value = (a.address or "").split('%', 1)[0].lower()
                        if value.startswith('fe80'):
                            return value
            except Exception:
                pass

        try:
            for addr, _scope, _iface in in6_getifaddr():
                value = addr.split('%', 1)[0].lower()
                if value.startswith('fe80'):
                    return value
        except Exception:
            pass
        return None

    def packet_callback(self, pkt):
        try:
            self.record_network_activity(pkt)
            self.record_ipv6_addresses(pkt)
        except Exception as e:
            print(f"[SNIFF] Gagal mencatat aktivitas jaringan: {e}")

        if pkt.haslayer("DHCP"):
            mac = pkt[Ether].src
            if self.is_valid_mac(mac):
                needs_probe, ip = self.engine.update_device(mac, latency=None)
                if needs_probe and ip:
                    # Offload port probing to workers
                    self.workers.submit("probe", lambda ip=ip, mac=mac: asyncio.run(self.engine.probe_device_ports(ip, mac)))

    def is_multicast_mac(self, mac):
        try:
            return bool(int(mac.split(":")[0], 16) & 1)
        except (ValueError, IndexError):
            return True

    def record_network_activity(self, pkt):
        collector = getattr(self.engine, "network_activity", None)
        if collector is None or not pkt.haslayer(Ether):
            return

        src_mac = pkt[Ether].src.lower()
        dst_mac = pkt[Ether].dst.lower()
        src_ip = dst_ip = None
        src_port = dst_port = None
        proto = None

        if pkt.haslayer(IP):
            src_ip, dst_ip = pkt[IP].src, pkt[IP].dst
            if pkt.haslayer(TCP):
                proto = "TCP"
                src_port, dst_port = pkt[TCP].sport, pkt[TCP].dport
            elif pkt.haslayer(UDP):
                proto = "UDP"
                src_port, dst_port = pkt[UDP].sport, pkt[UDP].dport
            elif pkt.haslayer(ICMP):
                proto = "ICMP"
            else:
                proto = "IP"
        elif pkt.haslayer(IPv6):
            src_ip, dst_ip = pkt[IPv6].src, pkt[IPv6].dst
            if pkt.haslayer(TCP):
                proto = "TCP"
                src_port, dst_port = pkt[TCP].sport, pkt[TCP].dport
            elif pkt.haslayer(UDP):
                proto = "UDP"
                src_port, dst_port = pkt[UDP].sport, pkt[UDP].dport
            elif pkt.haslayer("ICMPv6"):
                proto = "ICMPv6"
            else:
                proto = "IPv6"
        else:
            return

        known_devices = self.engine.devices
        if src_mac in known_devices:
            collector.record_packet(src_mac, True, proto, src_ip, dst_ip, src_port, dst_port)
        if dst_mac in known_devices and not self.is_multicast_mac(dst_mac):
            collector.record_packet(dst_mac, False, proto, src_ip, dst_ip, src_port, dst_port)

    def record_ipv6_addresses(self, pkt):
        """Simpan alamat IPv6 dari paket yang lewat untuk perangkat yang dikenal.

        Ini jalur pasif — sama seperti yang terlihat di Wireshark: alamat muncul
        tanpa pemindaian aktif. Penyimpanannya lewat
        engine.record_ipv6_address() yang tidak menyentuh last_seen.
        """
        if not pkt.haslayer(Ether) or not pkt.haslayer(IPv6):
            return

        src_mac = pkt[Ether].src.lower()
        dst_mac = pkt[Ether].dst.lower()
        src_ip = pkt[IPv6].src

        # Paket yang kita kirim sendiri tidak boleh dicatat: Windows/Npcap bisa
        # menampilkannya dengan MAC sumber hasil tulis ulang driver yang tidak
        # sama dengan MAC adapter, sehingga muncul perangkat hantu.
        if src_ip == self.get_local_ipv6_cached():
            return

        self.engine.record_ipv6_address(src_mac, src_ip)
        if not self.is_multicast_mac(dst_mac):
            self.engine.record_ipv6_address(dst_mac, pkt[IPv6].dst)

        # NDP: alamat target sering tidak muncul sebagai alamat sumber.
        # - DAD (Neighbor Solicitation dengan source ::) dikirim oleh pemilik
        #   alamat target, jadi target milik MAC pengirim.
        # - Neighbor Advertisement dikirim oleh pemilik alamat target.
        if pkt.haslayer("ICMPv6ND_NS"):
            target = pkt["ICMPv6ND_NS"].tgt
            if src_ip in ("::", ""):
                self.engine.record_ipv6_address(src_mac, target)
            elif not self.is_multicast_mac(dst_mac):
                self.engine.record_ipv6_address(dst_mac, target)
        elif pkt.haslayer("ICMPv6ND_NA"):
            self.engine.record_ipv6_address(src_mac, pkt["ICMPv6ND_NA"].tgt)

    def get_local_ipv6_cached(self):
        """Link-local host, di-cache karena dipanggil untuk setiap paket IPv6."""
        cached = getattr(self, "_local_ipv6_cache", None)
        if cached is None:
            cached = self.get_local_ipv6() or ""
            self._local_ipv6_cache = cached
        return cached

    def scan_arp_table(self):
        while not self.shutdown_event.is_set():
            try:
                self.engine.mark_heartbeat("arp_table_scan")
                if self.local_ip and self.local_ip != "127.0.0.1":
                    local_mac = get_if_hwaddr(self.target_iface).replace('-', ':').lower()
                    if local_mac and self.is_valid_client_ip(self.local_ip, local_mac):
                        needs_probe, _ = self.engine.update_device(
                            local_mac,
                            ip=self.local_ip,
                            hostname=socket.gethostname(),
                            latency=None,
                            is_self=True
                        )
                        if needs_probe:
                            self.workers.submit("probe", lambda ip=self.local_ip, mac=local_mac: asyncio.run(self.engine.probe_device_ports(ip, mac)))

                result = subprocess.check_output("arp -a", shell=True).decode()
                lines = result.splitlines()
                for line in lines:
                    match = re.search(r'(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F-]{17})\s+(\w+)', line)
                    if match:
                        ip, mac, _ = match.groups()
                        mac = mac.replace('-', ':').lower()
                        if self.is_valid_client_ip(ip, mac):
                            needs_probe, _ = self.engine.update_device(mac, ip=ip, latency=None)
                            if needs_probe:
                                self.workers.submit("probe", lambda ip=ip, mac=mac: asyncio.run(self.engine.probe_device_ports(ip, mac)))
            except Exception as e:
                print(f"[ERROR] Error reading ARP table: {e}")

            time.sleep(10)

    def active_arp_scan(self):
        while not self.shutdown_event.is_set():
            try:
                subnet = self.get_local_subnet()
                print(f"[SCAN] Starting ARP scan on subnet {subnet}")
                arp_request = ARP(pdst=subnet)
                broadcast = Ether(dst="ff:ff:ff:ff:ff:ff")
                arp_request_broadcast = broadcast/arp_request

                answered_list = srp(arp_request_broadcast, timeout=ARP_TIMEOUT_SECONDS, verbose=False, iface=self.target_iface)[0]
                discovered = 0
                for element in answered_list:
                    mac = element[1].hwsrc.lower()
                    ip = element[1].psrc
                    if self.is_valid_client_ip(ip, mac):
                        # Offload hostname, ping, and probe to workers
                        self.workers.submit("hostname", lambda ip=ip, mac=mac: self._update_hostname(ip, mac))
                        self.workers.submit("ping", lambda ip=ip, mac=mac: self._update_latency(ip, mac))

                        needs_probe, _ = self.engine.update_device(mac, ip=ip, latency=None)
                        if needs_probe:
                            self.workers.submit("probe", lambda ip=ip, mac=mac: asyncio.run(self.engine.probe_device_ports(ip, mac)))
                        discovered += 1

                print(f"[SCAN] Found {discovered} active devices on {subnet}")
                self.engine.mark_heartbeat("arp_scan")
            except Exception as e:
                print(f"[ERROR] Scapy ARP scan error: {e}")

            time.sleep(ARP_SCAN_INTERVAL_SECONDS)

    def active_ipv6_scan(self):
        """Mancing alamat IPv6 perangkat lewat beberapa probe multicast.

        Tiga probe dikirim bersamaan karena tiap perangkat menanggapi jenis yang
        berbeda:
        - ICMPv6 Echo ke ff02::1 (all-nodes): semua host IPv6 seharusnya menjawab.
        - MLD General Query: host IPv6 wajib melapor keanggotaan multicast-nya,
          dan laporan itu memuat alamat sumber perangkat.
        - mDNS query ke ff02::fb: perangkat Apple/printer/smart TV/IoT menjawab.

        Balasan dikumpulkan dengan AsyncSniffer, bukan srp(), karena srp()
        mencocokkan balasan berdasarkan pasangan src/dst paket yang dikirim —
        balasan multicast ke alamat unicast host tidak pernah dianggap cocok,
        sehingga daftar balasan selalu kosong.

        Tidak mengubah last_seen perangkat.
        """
        warned_no_ipv6 = False
        while not self.shutdown_event.is_set():
            try:
                self.engine.mark_heartbeat("ipv6_scan")

                local_ipv6 = self.get_local_ipv6()
                if not local_ipv6:
                    if not warned_no_ipv6:
                        print("[SCAN] IPv6 tidak aktif di antarmuka ini; scan IPv6 dilewati.")
                        warned_no_ipv6 = True
                    time.sleep(IPV6_SCAN_INTERVAL_SECONDS)
                    continue
                warned_no_ipv6 = False
                self._local_ipv6_cache = local_ipv6

                replies = {}

                def collect(pkt, replies=replies, local_ipv6=local_ipv6):
                    if not pkt.haslayer(Ether) or not pkt.haslayer(IPv6):
                        return
                    address = pkt[IPv6].src
                    if address == local_ipv6:
                        return
                    replies[pkt[Ether].src.lower()] = address

                sniffer = AsyncSniffer(
                    iface=self.target_iface, prn=collect, store=0
                )
                sniffer.start()
                try:
                    for probe in self._build_ipv6_probes(local_ipv6):
                        sendp(probe, iface=self.target_iface, verbose=False)
                    time.sleep(ARP_TIMEOUT_SECONDS)
                finally:
                    sniffer.stop()

                learned = 0
                for mac, address in replies.items():
                    if self.engine.record_ipv6_address(mac, address):
                        learned += 1
                if replies:
                    print(
                        f"[SCAN] IPv6: {len(replies)} balasan, "
                        f"{learned} alamat baru"
                    )
            except Exception as e:
                print(f"[ERROR] Scapy IPv6 scan error: {e}")

            time.sleep(IPV6_SCAN_INTERVAL_SECONDS)

    def _build_ipv6_probes(self, local_ipv6):
        """Susun paket probe multicast IPv6 (lihat active_ipv6_scan)."""
        all_nodes = "33:33:00:00:00:01"
        return [
            Ether(dst=all_nodes)
            / IPv6(src=local_ipv6, dst="ff02::1")
            / ICMPv6EchoRequest(),
            Ether(dst=all_nodes)
            / IPv6(src=local_ipv6, dst="ff02::1")
            / ICMPv6MLQuery(mladdr="::", mrd=1000),
            Ether(dst="33:33:00:00:00:fb")
            / IPv6(src=local_ipv6, dst="ff02::fb")
            / UDP(sport=5353, dport=5353)
            / DNS(
                id=0,
                qr=0,
                opcode=0,
                qd=DNSQR(
                    qname="_services._dns-sd._udp.local",
                    qtype="PTR",
                ),
            ),
        ]

    def scan_ipv6_neighbors(self):
        """Baca cache tetangga IPv6 Windows (padanan `arp -a` untuk IPv6).

        Setiap perangkat yang pernah bertukar lalu lintas IPv6 dengan host ini
        meninggalkan pasangan alamat IPv6 + MAC di sini, termasuk alamat global.
        Sumber data ini tidak bergantung pada paket yang kebetulan lewat saat
        sniffer aktif.
        """
        while not self.shutdown_event.is_set():
            try:
                self.engine.mark_heartbeat("ipv6_neighbor_scan")
                output = subprocess.check_output(
                    "netsh interface ipv6 show neighbors",
                    shell=True,
                ).decode(errors="ignore")

                learned = 0
                for mac, address in self._parse_ipv6_neighbors(output):
                    if self.engine.record_ipv6_address(mac, address):
                        learned += 1
                if learned:
                    print(f"[SCAN] IPv6 neighbor cache: {learned} alamat baru")
            except Exception as e:
                print(f"[ERROR] Gagal membaca cache tetangga IPv6: {e}")

            time.sleep(IPV6_SCAN_INTERVAL_SECONDS)

    def _parse_ipv6_neighbors(self, output):
        """Ambil pasangan (mac, alamat IPv6) dari keluaran netsh.

        Hanya baris berisi MAC unicast yang dipakai; entri multicast (ff02::)
        dan MAC nol dilewati karena bukan alamat milik perangkat.
        """
        pairs = []
        for line in output.splitlines():
            match = re.match(
                r'\s*([0-9a-fA-F:]+)\s+([0-9a-fA-F-]{17})\s+\S',
                line,
            )
            if not match:
                continue
            address, mac = match.groups()
            mac = mac.replace('-', ':').lower()
            if mac == "00:00:00:00:00:00":
                continue
            pairs.append((mac, address))
        return pairs

    def _update_hostname(self, ip, mac):
        hostname = resolve_hostname(ip)
        self.engine.update_device(mac, hostname=hostname)

    def _update_latency(self, ip, mac):
        latency = ping_latency(ip)
        self.engine.update_device(mac, latency=latency)

    def start_passive_sniffing(self):
        while not self.shutdown_event.is_set():
            try:
                print("[SNIFF] Starting passive sniffer...")
                sniff(iface=self.target_iface, prn=self.packet_callback, store=0, stop_filter=lambda x: self.shutdown_event.is_set())
                self.engine.mark_heartbeat("passive_sniff")
            except Exception as e:
                print(f"[ERROR] Passive sniffer crashed: {e}. Restarting in {SNIFFER_RESTART_DELAY_SECONDS}s...")
                time.sleep(SNIFFER_RESTART_DELAY_SECONDS)

    def launch(self):
        # Start active scans in separate threads
        threading.Thread(target=self.active_arp_scan, daemon=True).start()
        threading.Thread(target=self.scan_arp_table, daemon=True).start()
        threading.Thread(target=self.active_ipv6_scan, daemon=True).start()
        threading.Thread(target=self.scan_ipv6_neighbors, daemon=True).start()

        # Start passive sniffing in the current thread (blocking)
        self.start_passive_sniffing()
