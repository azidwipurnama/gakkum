import time
import asyncio
from datetime import datetime
import socket
from config import TIMEOUT_MINUTES, ALERT_DOWN_MINUTES, BSSID_MAPPING
try:
    from mac_vendor_lookup import MacLookup
    mac_lookup = MacLookup()
except ImportError:
    mac_lookup = None

PREFIX_MAP = {
    "9C:CE:88": "ASUSTeK Computer",
    "1E:E3:C1": "Randomized MAC (Privacy)",
    "00:16:78": "ARRIS Group",
    "50:57:9C": "Apple, Inc.",
    "0C:73:EB": "Apple, Inc.",
}

class TimestampEngine:
    def __init__(self):
        self.devices = {} # {mac: {"ip": "", "last_seen": timestamp, "status": "UP", "vendor": "", "hostname": "", "bssid": "", "category": ""}}

    async def check_open_ports(self, ip, ports=[80, 443, 631, 8291, 9100, 8080, 8443]):
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

        # Check for Randomized MAC (2nd char of 1st octet is 2, 6, A, or E)
        if mac[1] in ['2', '6', 'a', 'e', 'A', 'E']:
            category = "Private MAC (Smartphone)"
            vendor = "Private MAC (Smartphone)"
            return category, vendor

        # PORT-BASED CLASSIFICATION
        if open_ports:
            # PRINTER: Port 9100 (JetDirect) or 631 (IPP)
            if 9100 in open_ports or 631 in open_ports:
                category = "Printer"
            # ROUTER / AP: Port 8291 (MikroTik) OR (Port 80/443 AND IP suffix .1/.254)
            elif 8291 in open_ports or ((80 in open_ports or 443 in open_ports) and (ip.endswith('.1') or ip.endswith('.254'))):
                category = "Router / AP"
            # WEB SERVER: Port 80, 443, 8080, or 8443
            elif any(p in open_ports for p in [80, 443, 8080, 8443]):
                category = "Web Server"

        # FALLBACK VENDOR / HOSTNAME-BASED detection (only if still General Device)
        if category == "General Device":
            # ROUTER / AP detection
            router_vendors = ['Cisco', 'MikroTik', 'Ubiquiti', 'TP-Link', 'Ruijie']
            if any(v in vendor for v in router_vendors) or ip.endswith('.1'):
                category = "Router / AP"

            # PRINTER detection
            printer_vendors = ['Epson', 'Canon', 'Brother', 'Xerox', 'Kyocera']
            if any(v in vendor for v in printer_vendors):
                category = "Printer"

            # SMARTPHONE detection
            smartphone_vendors = ['Apple', 'Samsung', 'Xiaomi', 'Oppo', 'Vivo', 'Realme', 'Huawei']
            if any(v in vendor for v in smartphone_vendors):
                category = "Smartphone"

            # LAPTOP / PC detection
            laptop_vendors = ['Intel', 'Dell', 'Lenovo', 'HP', 'Asus', 'Acer']
            if any(v in vendor for v in laptop_vendors):
                category = "Laptop / PC"

            # Hostname-based detection
            hostname_lower = (hostname or '').lower()
            if hostname_lower.startswith('desktop-') or hostname_lower.startswith('laptop-'):
                category = "Laptop / PC"
            if hostname_lower.startswith('macbook'):
                category = "Laptop / PC"

        return category, vendor

    def lookup_vendor(self, mac):
        # Improved OUI Lookup using mac_vendor_lookup library and fallback map
        if mac_lookup:
            try:
                vendor = mac_lookup.lookup(mac)
                return vendor
            except Exception:
                pass

        # Fallback to PREFIX_MAP
        prefix = mac[:8].upper()
        return PREFIX_MAP.get(prefix, f"Unknown ({prefix})")

    async def probe_device_ports(self, ip, mac):
        open_ports = await self.check_open_ports(ip)
        category, vendor = self.detect_device_category(ip, mac, self.devices[mac]['hostname'], open_ports=open_ports)
        self.devices[mac]['category'] = category
        self.devices[mac]['vendor'] = vendor
        return True

    def update_device(self, mac, ip="", hostname="", bssid=""):
        now = datetime.now()
        mac = mac.lower()

        if mac not in self.devices:
            print(f"New MAC detected: {mac}")

            # Initialize with basic info
            vendor = self.lookup_vendor(mac)
            display_name = hostname
            if not display_name or display_name.lower() == "loading...":
                display_name = f"{vendor} Device"

            self.devices[mac] = {
                "ip": ip,
                "last_seen": now,
                "status": "UP",
                "vendor": vendor,
                "hostname": display_name,
                "bssid": bssid,
                "category": "General Device"
            }
            return True, ip # Needs async probing

        self.devices[mac]["last_seen"] = now
        self.devices[mac]["status"] = "UP"
        if ip: self.devices[mac]["ip"] = ip
        if bssid: self.devices[mac]["bssid"] = bssid

        # Intelligent Hostname/Display Name Fallback during updates
        if hostname and hostname.lower() != "loading...":
            self.devices[mac]["hostname"] = hostname
        elif self.devices[mac]["hostname"] == "Loading..." or self.devices[mac]["hostname"] == "Loading...":
            self.devices[mac]["hostname"] = f"{self.devices[mac]['vendor']} Device"

        # Check if needs probing
        if self.devices[mac]["category"] == "General Device":
            return True, ip
        return False, None


    def check_status(self):
        now = datetime.now()
        updates = []
        for mac, data in self.devices.items():
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

        for mac, data in self.devices.items():
            if data["status"] == "UP": total_up += 1
            else: total_down += 1

            location = BSSID_MAPPING.get(data.get("bssid", ""), "Unknown")

            devices_list.append({
                "ip": data.get("ip", ""),
                "mac": mac,
                "hostname": data.get("hostname", ""),
                "vendor": data.get("vendor", ""),
                "category": data.get("category", "General Device"),
                "location": location,
                "status": data["status"],
                "last_seen": data["last_seen"].isoformat()
            })

        return {
            "type": "DEVICE_UPDATE",
            "devices": devices_list,
            "metrics": {
                "total_up": total_up,
                "total_down": total_down
            }
        }
