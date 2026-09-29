from scapy.all import sniff, ARP, Ether, srp, conf, get_working_if
import threading
import time
import subprocess
import re
from config import PING_INTERVAL_SECONDS

class NetworkSniffer:
    def __init__(self, engine):
        self.engine = engine
        self.target_iface = self.detect_interface()

    def is_valid_mac(self, mac):
        if mac.lower() == 'ff:ff:ff:ff:ff:ff': return False
        if mac.lower().startswith('01:00:5e'): return False
        return True

    def is_valid_ip(self, ip_str):
        if not ip_str or ip_str.endswith('.255'): return False
        # Simple Unicast Check:
        # Exclude Multicast: 224.0.0.0/4 (224.0.0.0 - 239.255.255.255)
        # Assuming simple parsing for 10.x.x.x or 192.168.x.x
        if ip_str.startswith("224.") or ip_str.startswith("225.") or ip_str.startswith("226.") or \
           ip_str.startswith("227.") or ip_str.startswith("228.") or ip_str.startswith("229.") or \
           ip_str.startswith("230.") or ip_str.startswith("231.") or ip_str.startswith("232.") or \
           ip_str.startswith("233.") or ip_str.startswith("234.") or ip_str.startswith("235.") or \
           ip_str.startswith("236.") or ip_str.startswith("237.") or ip_str.startswith("238.") or \
           ip_str.startswith("239."):
            return False
        return True

    def detect_interface(self):
        iface = get_working_if()
        print(f"Detected working interface: {iface}")
        return iface

    def get_local_subnet(self):
        return "192.168.1.0/24"

    def packet_callback(self, pkt):
        if pkt.haslayer("DHCP"):
            mac = pkt[Ether].src
            if self.is_valid_mac(mac):
                self.engine.update_device(mac)

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
                    if self.is_valid_mac(mac) and self.is_valid_ip(ip):
                        self.engine.update_device(mac, ip=ip)
        except Exception as e:
            print(f"Error reading ARP table: {e}")

    def active_arp_scan(self, aggressive=False):
        print(f"Starting ARP scan on {self.target_iface}...")
        subnet = self.get_local_subnet()
        arp_request = ARP(pdst=subnet)
        broadcast = Ether(dst="ff:ff:ff:ff:ff:ff")
        arp_request_broadcast = broadcast/arp_request

        while True:
            try:
                answered_list = srp(arp_request_broadcast, timeout=2, verbose=False, iface=self.target_iface)[0]
                for element in answered_list:
                    mac = element[1].hwsrc.lower()
                    ip = element[1].psrc
                    if self.is_valid_mac(mac) and self.is_valid_ip(ip):
                        self.engine.update_device(mac, ip=ip)
            except Exception as e:
                print(f"Scapy scan warning: {e}")

            self.scan_arp_table()

            if aggressive:
                aggressive = False
                time.sleep(1)
            else:
                time.sleep(PING_INTERVAL_SECONDS)

    def start_passive_sniffing(self):
        sniff(iface=self.target_iface, prn=self.packet_callback, store=0)

    def launch(self):
        threading.Thread(target=self.active_arp_scan, args=(True,), daemon=True).start()
        self.start_passive_sniffing()
