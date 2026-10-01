import subprocess
import re

def get_active_ssid():
    try:
        result = subprocess.check_output("netsh wlan show interfaces", shell=True).decode()
        match = re.search(r'SSID\s+:\s+(.*)', result)
        if match:
            return match.group(1).strip()
    except Exception as e:
        print(f"Error getting SSID: {e}")
    return "Unknown Network"

if __name__ == "__main__":
    print(get_active_ssid())
