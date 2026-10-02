from scapy.all import sniff, ARP, Ether, srp, conf, get_working_if
import threading
import time
import subprocess
import re
import socket
import asyncio
from config import PING_INTERVAL_SECONDS

class NetworkSniffer:
    def __init__(self, engine):
        self.engine = engine
        self.target_iface = self.detect_interface()
        self.local_ip = self.get_local_ip()

    def get_local_ip(self):
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            # Does not need to actually connect
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
        # Abaikan MAC Broadcast/Multicast
        if not self.is_valid_mac(mac): return False

        # Loopback
        if ip == '127.0.0.1': return False

        # Subnet Broadcast
        if ip.endswith('.255'): return False

        # Multicast
        if ip.startswith(("224.", "235.", "239.")):
            return False

        return True

    def detect_interface(self):
        iface = get_working_if()
        print(f"Detected working interface: {iface}")
        return iface

    def get_local_subnet(self):
        # Dynamic subnet derivation: infer network prefix from local IP
        # e.g. 192.168.100.23 -> 192.168.100.0/24
        # e.g. 10.10.8.15    -> 10.10.8.0/24
        if not self.local_ip or self.local_ip == "127.0.0.1":
            return "192.168.100.0/24"

        parts = self.local_ip.split(".")
        if len(parts) != 4:
            return "192.168.100.0/24"

        network = ".".join(parts[:3]) + ".0/24"
        return network

    def packet_callback(self, pkt):
        if pkt.haslayer("DHCP"):
            mac = pkt[Ether].src
            # We don't have IP from DHCP packet easily in src, but let's check ARP table
            if self.is_valid_mac(mac):
                needs_probe, ip = self.engine.update_device(mac)
                if needs_probe:
                    asyncio.run(self.engine.probe_device_ports(ip, mac))

    def scan_arp_table(self):
        print("Reading Windows ARP table...")
        try:
            result = subprocess.check_output("arp -a", shell=True).decode()
            lines = result.splitlines()
            for line in lines:
                match = re.search(r'(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F-]{17})\s+(\w+)', line)
                if match:
                    ip, mac, _ = match.groups()
                    mac = mac.replace('-', ':').lower()
                    if self.is_valid_client_ip(ip, mac):
                        needs_probe, _ = self.engine.update_device(mac, ip=ip)
                        if needs_probe:
                            asyncio.run(self.engine.probe_device_ports(ip, mac))
        except Exception as e:
            print(f"Error reading ARP table: {e}")

    def active_arp_scan(self, aggressive=False):
        print(f"Starting ARP scan on {self.target_iface}...")
        print(f"Local subnet: {self.get_local_subnet()}")

        # Periodic Active Scan Loop (every 8 seconds for responsive real-time data)
        def periodic_scan():
            while True:
                subnet = self.get_local_subnet()
                print(f"[SCAN] Starting ARP scan on subnet {subnet}")
                arp_request = ARP(pdst=subnet)
                broadcast = Ether(dst="ff:ff:ff:ff:ff:ff")
                arp_request_broadcast = broadcast/arp_request

                try:
                    answered_list = srp(arp_request_broadcast, timeout=3, verbose=False, iface=self.target_iface)[0]
                    discovered = 0
                    for element in answered_list:
                        mac = element[1].hwsrc.lower()
                        ip = element[1].psrc
                        if self.is_valid_client_ip(ip, mac):
                            needs_probe, _ = self.engine.update_device(mac, ip=ip)
                            if needs_probe:
                                asyncio.run(self.engine.probe_device_ports(ip, mac))
                            discovered += 1
                    print(f"[SCAN] Found {discovered} active devices on {subnet}")
                except Exception as e:
                    print(f"Scapy ARP scan warning: {e}")

                time.sleep(8)

        # Start periodic scan thread
        threading.Thread(target=periodic_scan, daemon=True).start()

        # Existing ARP table scan logic as immediate loop
        while True:
            self.scan_arp_table()
            time.sleep(PING_INTERVAL_SECONDS)

    def start_passive_sniffing(self):
        sniff(iface=self.target_iface, prn=self.packet_callback, store=0)

    def launch(self):
        threading.Thread(target=self.active_arp_scan, args=(True,), daemon=True).start()
        self.start_passive_sniffing()
