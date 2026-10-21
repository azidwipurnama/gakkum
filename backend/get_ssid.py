import subprocess
import re

def get_active_ssid(timeout=5):
    try:
        result = subprocess.check_output("netsh wlan show interfaces", shell=True, timeout=timeout).decode()
        match = re.search(r'SSID\s+:\s+(.*)', result)
        if match:
            return match.group(1).strip()
    except subprocess.TimeoutExpired:
        print("[ERROR] netsh timeout getting SSID")
    except Exception as e:
        print(f"Error getting SSID: {e}")
    return "Unknown Network"

def is_target_ssid(ssid: str) -> bool:
    if not ssid:
        return False
    normalized = " ".join(ssid.casefold().replace("-", " ").replace("_", " ").split())
    return normalized == "gakkum wing c"

if __name__ == "__main__":
    print(get_active_ssid())
