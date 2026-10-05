# anomaly_config.py

# Warmup period in days
WARMUP_DAYS = 3

# Absolute minimum threshold (bps) to avoid alerting on idle jitter
ABS_MIN_BPS = 500 * 1024  # 500 Kbps

# Sensitivity factor for standard deviation (mean + N * std_dev)
STD_DEV_MULT = 3

# Cooldown for alerts (in seconds)
ALERT_COOLDOWN_SECONDS = 3600  # 1 hour

# Timeout for agent disappearance (in minutes)
AGENT_TIMEOUT_MINUTES = 10

# Weights for risk scoring (0-100)
WEIGHTS = {
    "traffic_peak": 40,
    "ip_mismatch": 30,
    "agent_offline": 30
}
