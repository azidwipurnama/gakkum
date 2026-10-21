"""
Unit test untuk perbaikan latency IP — DASHBOARD GAKKUMC.

Mengikuti pola unittest tanpa kredensial (seperti test_bssid_integration.py):
- hanya mengimpor modul bebas dependensi (ping_parser, timestamp_engine)
- TimestampEngine diinstanciate langsung
- tidak mengimpor main.py / FastAPI / Supabase

Dikelompokkan sesuai Seksi 5 tugas IMPLEMENTASI PERBAIKAN LATENSI IP:
  (A) Parser output ping — 7 kasus
  (B) Device-update scenarios — 8 skenario
  (C) Regresi — ARP scanner, status, payload kompatibel, tidak error
"""

import unittest
from datetime import datetime, timedelta

from ping_parser import (
    parse_ping_latency,
    LATENCY_FAILED,
    LATENCY_BELOW_1MS,
)
from timestamp_engine import TimestampEngine


# ---------------------------------------------------------------------------
# (A) Parser output ping — 7 kasus yang diminta
# ---------------------------------------------------------------------------
class TestPingParser(unittest.TestCase):
    """Parser harus mengenali output Inggris dan Indonesia, serta semua
    bentuk kegagalan, tanpa mengembalikan 0 untuk kegagalan."""

    def test_english_time_equals_with_ms(self):
        output = "Reply from 10.0.0.1: bytes=32 time=12ms TTL=128"
        self.assertEqual(parse_ping_latency(output), 12)

    def test_english_time_below_1ms(self):
        output = "Reply from 10.0.0.1: bytes=32 time<1ms TTL=128"
        self.assertIs(parse_ping_latency(output), LATENCY_BELOW_1MS)

    def test_indonesian_waktu_equals_with_ms(self):
        output = "Balasan dari 10.0.0.1: byte=32 waktu=12ms TTL=128"
        self.assertEqual(parse_ping_latency(output), 12)

    def test_indonesian_waktu_below_1ms(self):
        output = "Balasan dari 10.0.0.1: byte=32 waktu<1ms TTL=128"
        self.assertIs(parse_ping_latency(output), LATENCY_BELOW_1MS)

    def test_request_timed_out(self):
        output = "Request timed out."
        self.assertIs(parse_ping_latency(output), LATENCY_FAILED)

    def test_destination_host_unreachable(self):
        output = "Ping request could not find host 10.0.0.99."
        self.assertIs(parse_ping_latency(output), LATENCY_FAILED)

    def test_empty_output(self):
        self.assertIs(parse_ping_latency(""), LATENCY_FAILED)
        self.assertIs(parse_ping_latency(None), LATENCY_FAILED)

    def test_sub_ms_not_inflated_to_1(self):
        """'<1ms' / 'waktu<1ms' tidak boleh dinaikkan menjadi 1 ms."""
        for sample in ("time<1ms", "waktu<1ms", "time<1MS", "WAKTU<1ms"):
            self.assertIs(parse_ping_latency(sample), LATENCY_BELOW_1MS)

    def test_failure_not_zero(self):
        """Parser tidak pernah mengembalikan 0 sebagai tanda kegagakan."""
        for sample in ("Request timed out", "Destination host unreachable", ""):
            result = parse_ping_latency(sample)
            self.assertIsNot(result, 0)
            self.assertIs(result, LATENCY_FAILED)

    def test_case_insensitive(self):
        for sample in ("TIME=5MS", "WAKTU=5MS", "Time=5Ms", "Waktu=5Ms"):
            self.assertEqual(parse_ping_latency(sample), 5)

    def test_decimal_comma_localized(self):
        """Beberapa locale menulis koma sebagai desimal: 'time=12,5ms'."""
        self.assertEqual(parse_ping_latency("time=12,5ms"), 12.5)


# ---------------------------------------------------------------------------
# (B) Device-update scenarios — 8 skenario
# ---------------------------------------------------------------------------
class TestDeviceLatencyUpdate(unittest.TestCase):
    """update_device() harus membedakan lima keadaan:
    1. latency tidak diberikan (ARP/DHCP)   -> tidak menimpa nilai lama
    2. belum pernah terukur                   -> 0, latency_since None
    3. pengukuran gagal                       -> LATENCY_FAILED, tidak 0
    4. terukur sangat kecil (<1ms)            -> LATENCY_BELOW_1MS
    5. terukur positif                        -> angka ms
    """

    def setUp(self):
        self.eng = TimestampEngine()
        self.mac = "aa:bb:cc:00:00:01"

    def test_scenario_1_arp_update_without_latency_preserves_value(self):
        """latency 12ms → ARP update tanpa latency → masih 12ms."""
        self.eng.update_device(self.mac, ip="10.0.0.1", latency=12)
        before = self.eng.devices[self.mac]["latency"]
        self.assertEqual(before, 12)

        # Simulasi scan_arp_table(): update_device(mac, ip=ip, latency=None)
        self.eng.update_device(self.mac, ip="10.0.0.2", latency=None)
        after = self.eng.devices[self.mac]["latency"]
        self.assertEqual(after, 12)
        self.assertFalse(after == LATENCY_FAILED)

    def test_scenario_2_new_measurement_replaces_old(self):
        """pengukuran baru 25ms → menimpa 12ms."""
        self.eng.update_device(self.mac, ip="10.0.0.1", latency=12)
        self.eng.update_device(self.mac, ip="10.0.0.1", latency=25)
        self.assertEqual(self.eng.devices[self.mac]["latency"], 25)

    def test_scenario_3_failed_measurement_not_treated_as_zero(self):
        """pengukuran gagal → tidak dianggap 0 ms sukses."""
        self.eng.update_device(self.mac, ip="10.0.0.1", latency=12)
        self.eng.update_device(self.mac, ip="10.0.0.1", latency=LATENCY_FAILED)
        stored = self.eng.devices[self.mac]["latency"]
        self.assertIs(stored, LATENCY_FAILED)
        self.assertNotEqual(stored, 0)

        # Payload harus menghilangkan latency (bukan render "0ms")
        payload = self.eng.get_full_payload()
        dev = payload["devices"][0]
        self.assertNotIn("latency", dev)

    def test_scenario_4_never_measured_device_distinguished(self):
        """perangkat baru dari ARP tanpa ping: latency 0 default + latency_since
        ada sehingga tidak disamakan dengan 'gagal'."""
        self.eng.update_device(self.mac, ip="10.0.0.1", latency=None)
        dev = self.eng.get_full_payload()["devices"][0]
        self.assertIn("latency", dev)
        self.assertEqual(dev["latency"], 0)

    def test_scenario_5_below_1ms_preserved_not_inflated(self):
        """LATENCY_BELOW_1MS tidak naik menjadi 1 ms."""
        self.eng.update_device(self.mac, ip="10.0.0.1", latency=LATENCY_BELOW_1MS)
        self.assertIs(self.eng.devices[self.mac]["latency"], LATENCY_BELOW_1MS)

    def test_scenario_6_arp_update_does_not_lose_ping_result(self):
        """Tanpa race: ping result valid tidak hilang setelah ARP scan."""
        # ping pertama
        self.eng.update_device(self.mac, ip="10.0.0.1", latency=12)
        # ARP scan berikutnya (latency=None)
        self.eng.update_device(self.mac, ip="10.0.0.1", latency=None)
        self.assertEqual(self.eng.devices[self.mac]["latency"], 12)

    def test_scenario_7_arp_then_new_ping_updates(self):
        """ARP update dulu (None), lalu ping baru — latency harus berubah."""
        self.eng.update_device(self.mac, ip="10.0.0.1", latency=None)
        self.eng.update_device(self.mac, ip="10.0.0.1", latency=18)
        self.assertEqual(self.eng.devices[self.mac]["latency"], 18)

    def test_scenario_8_stale_latency_hidden_after_expiry(self):
        """Latency yang sudah kedaluwarsa (> LATENCY_STALE_SECONDS) tidak
        ditampilkan di payload (hilang → frontend render '-')."""
        from config import LATENCY_STALE_SECONDS
        # latency valid tapi lama sekali
        self.eng.update_device(self.mac, ip="10.0.0.1", latency=42)
        # Modifikasi latency_since ke masa lalu
        self.eng.devices[self.mac]["latency_since"] = datetime.now() - timedelta(
            seconds=LATENCY_STALE_SECONDS + 1
        )
        dev = self.eng.get_full_payload()["devices"][0]
        self.assertNotIn("latency", dev)


# ---------------------------------------------------------------------------
# (C) Regresi
# ---------------------------------------------------------------------------
class TestRegression(unittest.TestCase):
    """Regresi: scanner ARP, status online/offline, device update, payload
    WebSocket tetap kompatibel dengan frontend; tidak error import/sintaks."""

    def test_update_device_new_creates_entry(self):
        eng = TimestampEngine()
        needs_probe, ip = eng.update_device("aa:bb:cc:00:00:99",
                                           ip="10.0.0.1", hostname="TestHost",
                                           latency=15)
        self.assertTrue(needs_probe)
        self.assertEqual(ip, "10.0.0.1")
        self.assertEqual(eng.devices["aa:bb:cc:00:00:99"]["latency"], 15)

    def test_update_device_existing_no_probe(self):
        eng = TimestampEngine()
        eng.update_device("aa:bb:cc:00:00:99", ip="10.0.0.1", hostname="TestHost",
                          latency=15)
        needs_probe, ip = eng.update_device("aa:bb:cc:00:00:99",
                                            ip="10.0.0.1", hostname="TestHost",
                                            latency=15, is_blacklisted=True)
        self.assertTrue(needs_probe)  # masih "General Device" category
        self.assertTrue(eng.devices["aa:bb:cc:00:00:99"]["is_blacklisted"])

    def test_online_offline_status_unchanged(self):
        eng = TimestampEngine()
        eng.update_device("aa:bb:cc:00:00:01", ip="10.0.0.1", latency=5)
        self.assertEqual(eng.devices["aa:bb:cc:00:00:01"]["status"], "UP")

        # Simulasi check_status: last_seen lama → DOWN
        eng.devices["aa:bb:cc:00:00:01"]["last_seen"] = datetime.now() - timedelta(minutes=4)
        eng.check_status()
        self.assertEqual(eng.devices["aa:bb:cc:00:00:01"]["status"], "DOWN")

    def test_payload_websocket_compatible(self):
        """WebSocket payload harus tetap punya struktur type/devices/metrics
        dan field yang diperlukan frontend."""
        eng = TimestampEngine()
        eng.update_device("aa:bb:cc:00:00:01", ip="10.0.0.1",
                          hostname="DeviceA", latency=12)
        eng.update_device("aa:bb:cc:00:00:02", ip="10.0.0.2",
                          hostname="DeviceB", latency=LATENCY_FAILED)

        payload = eng.get_full_payload()
        self.assertEqual(payload["type"], "DEVICE_UPDATE")
        self.assertIn("devices", payload)
        self.assertIn("metrics", payload)
        self.assertIn("total_up", payload["metrics"])
        self.assertIn("total_down", payload["metrics"])

        dev_a = payload["devices"][0]
        expected_keys = {"ip", "mac", "hostname", "vendor", "category",
                         "location", "bssid", "status", "last_seen",
                         "is_blacklisted"}
        # latency boleh ada atau tidak (hanya saat gagal dihapuskan)
        self.assertTrue(expected_keys.issubset(set(dev_a.keys())))

        # DeviceB (gagal) — latency harus dihapus agi frontend render "-"
        dev_b = payload["devices"][1]
        self.assertNotIn("latency", dev_b)

    def test_arp_scan_call_site_uses_none(self):
        """scan_arp_table / packet_callback memanggil update_device dengan
        latency=None (bukan 0) — diverifikasi lewat grep pattern."""
        import re as _re
        with open("sniffer.py") as f:
            source = f.read()
        # scan_arp_table: update_device(mac, ip=ip, latency=None)
        self.assertTrue(
            _re.search(r"update_device\(mac, ip=ip, latency=None\)", source),
            "scan_arp_table harus memanggil update_device dengan latency=None",
        )
        # packet_callback: update_device(mac, latency=None)
        self.assertTrue(
            _re.search(r"update_device\(mac, latency=None\)", source),
            "packet_callback harus memanggil update_device dengan latency=None",
        )

    def test_periodic_scan_uses_parser(self):
        """periodic_scan harus memakai parse_ping_latency, bukan regex lama."""
        with open("sniffer.py") as f:
            source = f.read()
        self.assertIn("parse_ping_latency", source)
        self.assertIn("from ping_parser", source)
        # Regex lama yang bilingual tidak boleh ada lagi
        self.assertNotIn(r"time[=<](\d+)ms", source)


if __name__ == '__main__':
    unittest.main()
