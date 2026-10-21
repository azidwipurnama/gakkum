from scapy.all import sniff, ARP, Ether, IP, IPv6, TCP, UDP, ICMP, srp, conf, get_working_if, get_if_hwaddr
import threading
import time
import subprocess
import re
import socket
import asyncio
from config import (
    ARP_SCAN_INTERVAL_SECONDS,
    ARP_TIMEOUT_SECONDS,
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

    def packet_callback(self, pkt):
        try:
            self.record_network_activity(pkt)
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

        # Start passive sniffing in the current thread (blocking)
        self.start_passive_sniffing()
