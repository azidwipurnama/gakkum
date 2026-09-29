import os
from dotenv import load_dotenv

load_dotenv()

# API Key
API_KEY = "GAKKUM_SECRET_KEY"

# Supabase Configurations
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

# Networking Config
# Mapping BSSID to Room name
BSSID_MAPPING = {
    "AA:BB:CC:DD:EE:01": "Gakkum-1",
    "AA:BB:CC:DD:EE:02": "Gakkum-2",
    # ... Add more mappings based on 13 Access Points
}

# Network interface for Scapy (might depend on OS)
INTERFACE = "Ethernet" # Adjust to your local interface name

# Constants
TIMEOUT_MINUTES = 3
ALERT_DOWN_MINUTES = 10
PING_INTERVAL_SECONDS = 10
BROADCAST_INTERVAL_SECONDS = 2
