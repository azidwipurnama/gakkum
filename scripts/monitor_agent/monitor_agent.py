import os
import time
import json
import logging
import psutil
import requests
from collections import deque
from dotenv import load_dotenv
from logging.handlers import RotatingFileHandler

# Load env
load_dotenv()

# Configuration
SERVER_URL = os.getenv("SERVER_URL")
AGENT_ID = os.getenv("AGENT_ID")
API_KEY = os.getenv("API_KEY")
INTERVAL = int(os.getenv("REPORT_INTERVAL", 5))
EXCLUDED = os.getenv("EXCLUDED_INTERFACES", "lo,vEthernet").split(",")

# Logging Setup
log_file = "monitor_agent.log"
handler = RotatingFileHandler(log_file, maxBytes=1024*1024, backupCount=3)
logging.basicConfig(level=logging.INFO, handlers=[handler], format='%(asctime)s - %(levelname)s - %(message)s')

# Queue for buffering (limit to 100 samples ~ 500s buffer if interval=5s)
queue = deque(maxlen=100)

def get_network_data():
    net_io = psutil.net_io_counters(pernic=True)
    interfaces = []

    for nic, counters in net_io.items():
        if any(excl in nic for excl in EXCLUDED):
            continue

        interfaces.append({
            "name": nic,
            "bytes_sent": counters.bytes_sent,
            "bytes_recv": counters.bytes_recv,
            "packets_sent": counters.packets_sent,
            "packets_recv": counters.packets_recv
        })
    return interfaces

def run_agent():
    logging.info(f"Agent {AGENT_ID} started.")
    backoff = 1

    while True:
        try:
            data = {
                "agent_id": AGENT_ID,
                "timestamp": int(time.time()),
                "interfaces": get_network_data()
            }

            queue.append(data)

            # Try to send oldest. When the server returns 429, honor the
            # Retry-After header and retry the same queued sample after
            # waiting — plus a small buffer or minimum backoff to avoid
            # immediate re-collision when interval equals rate limit window.
            while queue:
                report = queue[0]
                response = requests.post(SERVER_URL, json=report, headers={"x-api-key": API_KEY}, timeout=5)
                if response.status_code == 201:
                    queue.popleft()
                    backoff = 1 # reset backoff
                elif response.status_code == 429:
                    retry_after = response.headers.get("Retry-After")
                    try:
                        wait = int(retry_after) + 1  # add 1s buffer to avoid immediate re-trigger
                    except (TypeError, ValueError):
                        wait = max(backoff, INTERVAL)
                    logging.warning(
                        f"Rate limited (429). Retry-After={retry_after}, "
                        f"waiting {wait}s before retry."
                    )
                    time.sleep(wait)
                    continue
                else:
                    logging.warning(f"Server returned {response.status_code}")
                    break # Wait for next attempt

            # Sleep the normal interval between collection cycles.
            # (A 429 retry cycle already slept via Retry-After above, so
            #  this only runs after a successful send or an unhandled error.)
            if response.status_code != 429:
                time.sleep(INTERVAL)

        except Exception as e:
            logging.error(f"Error: {e}")
            time.sleep(backoff)
            backoff = min(backoff * 2, 60)

if __name__ == "__main__":
    try:
        run_agent()
    except KeyboardInterrupt:
        logging.info("Agent stopped by user.")
