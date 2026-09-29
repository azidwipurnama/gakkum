import time
from datetime import datetime
from config import TIMEOUT_MINUTES, ALERT_DOWN_MINUTES, BSSID_MAPPING

class TimestampEngine:
    def __init__(self):
        self.devices = {} # {mac: {"ip": "", "last_seen": timestamp, "status": "UP", "vendor": "", "hostname": "", "bssid": ""}}

    def lookup_vendor(self, mac):
        # Simplified OUI Lookup (6 digits/3 bytes)
        oui = mac[:8].upper()
        # Common OUI Examples
        oui_map = {
            "00:0C:29": "VMware",
            "AC:3A:7A": "Apple",
            "3C:D9:2B": "Intel",
            "44:8A:5B": "Samsung"
        }
        return oui_map.get(oui, f"Unknown ({oui})")

    def update_device(self, mac, ip="", vendor="", hostname="", bssid=""):
        now = datetime.now()
        mac = mac.lower()

        if mac not in self.devices:
            # New device detected
            print(f"New MAC detected: {mac}")

            # Vendor lookup if no vendor provided
            final_vendor = vendor or self.lookup_vendor(mac)

            self.devices[mac] = {
                "ip": ip,
                "last_seen": now,
                "status": "UP",
                "vendor": final_vendor,
                "hostname": hostname or f"{final_vendor}-Device",
                "bssid": bssid
            }
        else:
            self.devices[mac]["last_seen"] = now
            self.devices[mac]["status"] = "UP"
            if ip: self.devices[mac]["ip"] = ip
            if vendor: self.devices[mac]["vendor"] = vendor
            if bssid: self.devices[mac]["bssid"] = bssid
            # Keep hostname if not already set or if explicitly provided
            if hostname: self.devices[mac]["hostname"] = hostname

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
