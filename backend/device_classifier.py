import asyncio
import socket

async def check_port(ip: str, port: int, timeout: float = 1.5) -> bool:
    try:
        conn = asyncio.open_connection(ip, port)
        _, writer = await asyncio.wait_for(conn, timeout=timeout)
        writer.close()
        await writer.wait_closed()
        return True
    except:
        return False

def classify_device(ip, mac, hostname, vendor, open_ports=None):
    category = "General Device"
    hn = (hostname or '').lower()
    vendor_clean = (vendor or '').strip()

    # 1. Randomized MAC (private)
    if len(mac) > 1 and mac[1] in ['2', '6', 'a', 'e', 'A', 'E']:
        return "Private MAC (Smartphone)", "Private MAC (Smartphone)"

    # 2. ROUTER / AP (High Priority Logic)
    # Gateway IP check (.1, .254) or Router Vendors or Ports
    if ip.endswith(('.1', '.254')) or \
       any(v.lower() in vendor_clean.lower() for v in ['MikroTik', 'Cisco', 'Ubiquiti', 'Ruijie', 'TP-Link', 'Aruba', 'Huawei Router', 'ZTE']) or \
       (open_ports and any(p in open_ports for p in [8291, 22, 23])):
        category = "Router / AP"

    # 3. PRINTER
    elif category == "General Device" and (
        (open_ports and any(p in open_ports for p in [9100, 631, 515])) or
        any(k in hn or k in vendor_clean.lower() for k in ['printer', 'epson', 'canon', 'hp', 'brother', 'xerox', 'kyocera', 'ricoh'])
    ):
        category = "Printer"

    # 4. WEB SERVER
    elif category == "General Device" and \
         not ip.endswith(('.1', '.254')) and \
         (open_ports and any(p in open_ports for p in [80, 443, 8080, 8443])):
        category = "Web Server"

    # 5. SMARTPHONE, LAPTOP / PC & VENDOR-BASED DETECTION
    elif category == "General Device":
        vendor_lower = vendor_clean.lower()
        # Apple Devices (iPhone, iPad, Mac)
        if 'apple' in vendor_lower:
            if 'macbook' in hn or 'imac' in hn or 'mac' in hn:
                category = "Laptop / PC"
            elif 'iphone' in hn or 'ipad' in hn:
                category = "Smartphone"
            else:
                category = "Smartphone / PC"

        # ASUSTeK & Laptop / PC vendors
        elif any(v in vendor_lower for v in ['asustek', 'asus', 'intel', 'dell', 'lenovo', 'acer', 'msi', 'gigabyte']):
            category = "Laptop / PC"

        # Smartphone vendors
        elif any(v in vendor_lower for v in ['samsung', 'xiaomi', 'oppo', 'vivo', 'realme', 'huawei', 'transsion', 'infinix', 'poco', 'oneplus']):
            category = "Smartphone"

        # Hostname fallback
        elif hn.startswith(('desktop-', 'laptop-', 'pc-', 'macbook', 'win-')):
            category = "Laptop / PC"

    print(f"[DEBUG CLASSIFY] IP: {ip} | Category: {category} | Vendor: {vendor_clean} | Host: {hostname}")
    return category, vendor_clean
