import requests
import time
import random

# Configuration
SERVER_URL = "http://localhost:8000/api/agent/report"
AGENT_ID = "agent-001"
API_KEY = "KEY_ASLI_AGEN_001"

def send_report(bytes_sent, bytes_recv):
    data = {
        "agent_id": AGENT_ID,
        "timestamp": int(time.time()),
        "interfaces": [
            {"name": "eth0", "bytes_sent": bytes_sent, "bytes_recv": bytes_recv, "packets_sent": 100, "packets_recv": 100}
        ]
    }
    try:
        response = requests.post(SERVER_URL, json=data, headers={"x-api-key": API_KEY}, timeout=5)
        print(f"Sent: {bytes_sent}, Status: {response.status_code}")
    except Exception as e:
        print(f"Error: {e}")

# Scenario: Normal traffic
print("Scenario: Normal traffic")
bs, br = 10000, 10000
for _ in range(5):
    send_report(bs, br)
    bs += 1000
    br += 1000
    time.sleep(2)

# Scenario: Anomaly
print("Scenario: Anomaly (Spike)")
send_report(bs + 1000000, br + 1000000)

# Scenario: Counter reset / Reboot
print("Scenario: Counter reset")
send_report(100, 100) # reset
time.sleep(2)
send_report(200, 200)
