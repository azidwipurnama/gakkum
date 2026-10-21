"""Koleksi pasif detail jaringan per perangkat.

Modul ini hanya mencatat informasi yang terlihat dari paket yang benar-benar
lewat di jaringan (IPv4/IPv6, protokol, port lokal, dan endpoint remote) serta
koneksi lokal host lewat psutil. Tidak ada pemindaian port aktif di sini.
"""

import socket
import threading
import time
from datetime import datetime

try:
    import psutil
except ImportError:  # pragma: no cover - psutil tersedia di lingkungan target
    psutil = None


def _iso(ts):
    return datetime.fromtimestamp(ts).isoformat()


class NetworkActivityCollector:
    """Menyimpan aktivitas jaringan terbaru per MAC address.

    Data dibatasi oleh jendela waktu (WINDOW_SECONDS) agar memori tidak tumbuh
    tanpa batas pada jaringan yang ramai.
    """

    WINDOW_SECONDS = 300
    MAX_CONNECTIONS = 40

    def __init__(self):
        self._lock = threading.Lock()
        self._devices = {}

    # ------------------------------------------------------------------
    # Pencatatan
    # ------------------------------------------------------------------
    def _entry(self, mac):
        return self._devices.setdefault(mac.lower(), {
            "ipv4": {},      # ip -> last_seen
            "ipv6": {},      # ip -> last_seen
            "protocols": {}, # proto -> {"packets", "last_seen"}
            "ports": {},     # (direction, proto, port) -> {"packets", "last_seen"}
            "flows": {},     # (direction, proto, local_port, remote_ip, remote_port) -> {...}
        })

    def _prune(self, entry, now):
        cutoff = now - self.WINDOW_SECONDS
        for key in ("ipv4", "ipv6", "protocols", "ports", "flows"):
            bucket = entry[key]
            for item_key in [k for k, v in bucket.items() if v["last_seen"] < cutoff]:
                del bucket[item_key]

    def _bump(self, bucket, key, now):
        current = bucket.get(key)
        if current is None:
            bucket[key] = {"packets": 1, "last_seen": now}
        else:
            current["packets"] += 1
            current["last_seen"] = now

    def record_packet(self, mac, outbound, proto, src_ip, dst_ip, src_port, dst_port, ts=None):
        """Catat satu paket IP yang melibatkan perangkat `mac`.

        outbound=True berarti paket dikirim oleh perangkat ini; False berarti
        paket diterima perangkat ini.
        """
        if not mac:
            return

        now = time.time() if ts is None else ts
        local_ip = src_ip if outbound else dst_ip
        remote_ip = dst_ip if outbound else src_ip
        local_port = src_port if outbound else dst_port
        remote_port = dst_port if outbound else src_port
        direction = "outbound" if outbound else "inbound"

        with self._lock:
            entry = self._entry(mac)
            self._prune(entry, now)

            if local_ip:
                address_bucket = entry["ipv6"] if ":" in local_ip else entry["ipv4"]
                address_bucket[local_ip] = {"last_seen": now}

            self._bump(entry["protocols"], proto, now)

            if local_port is not None:
                self._bump(entry["ports"], (direction, proto, local_port), now)

            if remote_ip:
                flow_key = (direction, proto, local_port, remote_ip, remote_port)
                self._bump(entry["flows"], flow_key, now)

    # ------------------------------------------------------------------
    # Snapshot untuk API
    # ------------------------------------------------------------------
    def _host_addresses(self):
        ipv4, ipv6 = {}, {}
        if psutil is None:
            return ipv4, ipv6

        now = time.time()
        try:
            interfaces = psutil.net_if_addrs()
        except Exception:
            return ipv4, ipv6

        for addrs in interfaces.values():
            for addr in addrs:
                value = getattr(addr, "address", "") or ""
                if not value:
                    continue
                if addr.family == socket.AF_INET:
                    if not value.startswith("127."):
                        ipv4[value] = {"last_seen": now}
                elif addr.family == socket.AF_INET6:
                    value = value.split("%", 1)[0]
                    if value and value != "::1":
                        ipv6[value] = {"last_seen": now}
        return ipv4, ipv6

    def _host_connections(self):
        connections = {}
        if psutil is None:
            return connections

        now = time.time()
        try:
            raw_connections = psutil.net_connections(kind="inet")
        except Exception:
            return connections

        for conn in raw_connections:
            try:
                if not conn.laddr:
                    continue
                proto = "TCP" if conn.type == socket.SOCK_STREAM else "UDP"
                local_ip = conn.laddr.ip if hasattr(conn.laddr, "ip") else conn.laddr[0]
                local_port = conn.laddr.port if hasattr(conn.laddr, "port") else conn.laddr[1]
                listening = not conn.raddr
                direction = "listening" if listening else "outbound"
                remote_ip = ""
                remote_port = None
                if conn.raddr:
                    remote_ip = conn.raddr.ip if hasattr(conn.raddr, "ip") else conn.raddr[0]
                    remote_port = conn.raddr.port if hasattr(conn.raddr, "port") else conn.raddr[1]

                key = (direction, proto, local_port, remote_ip, remote_port)
                connections[key] = {
                    "packets": 1,
                    "last_seen": now,
                    "local_ip": local_ip,
                }
            except Exception:
                continue
        return connections

    def _build_result(self, entry, now):
        ipv4 = [{"address": ip, "last_seen": _iso(v["last_seen"])}
                for ip, v in entry["ipv4"].items()] if entry else []
        ipv6 = [{"address": ip, "last_seen": _iso(v["last_seen"])}
                for ip, v in entry["ipv6"].items()] if entry else []
        protocols = [{"name": proto, "packets": v["packets"], "last_seen": _iso(v["last_seen"])}
                     for proto, v in entry["protocols"].items()] if entry else []

        connections = []
        if entry:
            for (direction, proto, local_port, remote_ip, remote_port), v in entry["flows"].items():
                connections.append({
                    "protocol": proto,
                    "direction": direction,
                    "local_port": local_port,
                    "remote_address": remote_ip,
                    "remote_port": remote_port,
                    "packets": v["packets"],
                    "last_seen": _iso(v["last_seen"]),
                })
        return ipv4, ipv6, protocols, connections

    def snapshot(self, mac, include_host=False):
        mac = (mac or "").lower()
        now = time.time()

        with self._lock:
            entry = self._devices.get(mac)
            if entry is not None:
                self._prune(entry, now)
            ipv4, ipv6, protocols, connections = self._build_result(entry, now)

        source = "passive"

        if include_host:
            source = "passive+host"
            host_v4, host_v6 = self._host_addresses()
            for ip, value in host_v4.items():
                ipv4 = [item for item in ipv4 if item["address"] != ip]
                ipv4.append({"address": ip, "last_seen": _iso(value["last_seen"])})
            for ip, value in host_v6.items():
                ipv6 = [item for item in ipv6 if item["address"] != ip]
                ipv6.append({"address": ip, "last_seen": _iso(value["last_seen"])})

            for (direction, proto, local_port, remote_ip, remote_port), value in self._host_connections().items():
                connections.append({
                    "protocol": proto,
                    "direction": direction,
                    "local_port": local_port,
                    "remote_address": remote_ip,
                    "remote_port": remote_port,
                    "packets": value["packets"],
                    "last_seen": _iso(value["last_seen"]),
                })

        ipv4.sort(key=lambda item: item["last_seen"], reverse=True)
        ipv6.sort(key=lambda item: item["last_seen"], reverse=True)
        protocols.sort(key=lambda item: (item["packets"], item["last_seen"]), reverse=True)
        connections.sort(key=lambda item: item["last_seen"], reverse=True)

        return {
            "mac": mac,
            "captured_at": _iso(now),
            "window_seconds": self.WINDOW_SECONDS,
            "source": source,
            "ipv4": ipv4,
            "ipv6": ipv6,
            "protocols": protocols,
            "connections": connections[:self.MAX_CONNECTIONS],
        }
