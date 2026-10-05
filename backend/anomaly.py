import time
import math
from datetime import datetime
import anomaly_config

class AnomalyDetector:
    def __init__(self, supabase, broadcast_func):
        self.supabase = supabase
        self.broadcast_func = broadcast_func
        self.stats = {} # {device_id: {hour: {count, mean, m2}}}

    # Stats Welford's algorithm
    def update_stats(self, device_id, bps):
        hour = datetime.now().replace(minute=0, second=0, microsecond=0)
        if device_id not in self.stats:
            self.stats[device_id] = {}
        if hour not in self.stats[device_id]:
            self.stats[device_id][hour] = {'count': 0, 'mean': 0, 'm2': 0}

        s = self.stats[device_id][hour]
        s['count'] += 1
        delta = bps - s['mean']
        s['mean'] += delta / s['count']
        delta2 = bps - s['mean']
        s['m2'] += delta * delta2

    def get_std_dev(self, device_id, hour):
        s = self.stats[device_id].get(hour)
        if not s or s['count'] < 2: return 0
        return math.sqrt(s['m2'] / (s['count'] - 1))

    async def process_report(self, agent_id, device_id, interfaces, timestamp):
        # 1. BPS Calculation (Simple version)
        total_bps = 0
        for iface in interfaces:
            # Need previous sample to calculate BPS difference.
            # For now, simplistic approach: sum of bytes / 5s interval (from agent)
            total_bps += (iface['bytes_sent'] + iface['bytes_recv']) * 8 / 5

        # 2. Anomaly Detection
        self.update_stats(device_id, total_bps)
        hour = datetime.now().replace(minute=0, second=0, microsecond=0)
        s = self.stats[device_id].get(hour)

        # Threshold Logic: > mean + 3*std AND > MIN
        if s and s['count'] > 10: # Start after warmup
            mean = s['mean']
            std = self.get_std_dev(device_id, hour)
            if total_bps > (mean + anomaly_config.STD_DEV_MULT * std) and total_bps > anomaly_config.ABS_MIN_BPS:
                reason = f"Trafik tinggi: {total_bps/1e6:.2f} Mbps, rata-rata: {mean/1e6:.2f} Mbps"
                alert = await self.create_alert(device_id, "traffic_peak", "warning", 50, reason)
                await self.broadcast_func({"type": "ALERT", "data": alert})

    async def create_alert(self, device_id, rule_type, severity, risk_score, reason):
        alert = {
            "device_id": device_id,
            "rule_type": rule_type,
            "severity": severity,
            "risk_score": risk_score,
            "reason": reason
        }
        self.supabase.table("alerts").insert(alert).execute()
        return alert
