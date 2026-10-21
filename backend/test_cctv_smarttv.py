import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

from timestamp_engine import TimestampEngine
from config import CATEGORY_RECHECK_SECONDS


class TestCctvSmartTvDetection(unittest.TestCase):
    def test_detect_cctv_by_hostname(self):
        engine = TimestampEngine()
        # Menggunakan MAC non-random (karakter kedua bukan 2, 6, A, E)
        category, vendor = engine.detect_device_category("10.10.8.50", "00:34:56:78:90:ab", "CCTV-Lobby-01", open_ports=[])
        self.assertEqual(category, "CCTV / IP Camera")

    def test_detect_smarttv_by_hostname(self):
        engine = TimestampEngine()
        category, vendor = engine.detect_device_category("10.10.8.51", "00:34:56:78:90:ac", "LivingRoom-SmartTV", open_ports=[])
        self.assertEqual(category, "Smart TV")

    def test_detect_cctv_by_rtsp_port(self):
        engine = TimestampEngine()
        # RTSP (554) adalah sinyal kuat CCTV, tidak bergantung vendor
        category, vendor = engine.detect_device_category("10.10.8.52", "00:12:34:56:78:99", "unknown-device", open_ports=[554])
        self.assertEqual(category, "CCTV / IP Camera")

    def test_port_8000_alone_is_not_cctv(self):
        engine = TimestampEngine()
        # Port 8000 juga dipakai banyak web server/dev server. Tanpa vendor
        # kamera, port ini tidak boleh melabeli perangkat sebagai CCTV.
        category, vendor = engine.detect_device_category("10.10.8.52", "00:12:34:56:78:99", "unknown-device", open_ports=[8000])
        self.assertNotEqual(category, "CCTV / IP Camera")
        self.assertEqual(category, "Web Server")

    def test_laptop_with_port_8000_not_cctv(self):
        engine = TimestampEngine()
        # Kasus nyata: laptop dengan port 8000 terbuka pernah terdeteksi CCTV.
        category, vendor = engine.detect_device_category("10.10.8.183", "80:84:89:76:8e:50", "pienaaa", open_ports=[8000])
        self.assertNotEqual(category, "CCTV / IP Camera")
        self.assertEqual(category, "Web Server")

    def test_detect_smarttv_by_port(self):
        engine = TimestampEngine()
        category, vendor = engine.detect_device_category("10.10.8.53", "00:12:34:56:78:98", "unknown-device", open_ports=[8008, 9197])
        self.assertEqual(category, "Smart TV")

    def test_hostname_cctv_wins_over_randomized_mac(self):
        engine = TimestampEngine()
        # Karakter kedua oktet pertama '2' menandakan MAC acak, tetapi hostname
        # eksplisit lebih dipercaya daripada tebakan dari MAC.
        category, _ = engine.detect_device_category("10.10.8.60", "22:11:22:33:44:55", "CCTV-Gudang", open_ports=[])
        self.assertEqual(category, "CCTV / IP Camera")

    def test_port_8000_with_cctv_vendor_is_cctv(self):
        engine = TimestampEngine()
        # Kasus sah: port 8000 milik kamera Hikvision tetap harus terdeteksi CCTV.
        with patch.object(engine, "lookup_vendor", return_value="Hangzhou Hikvision Digital Technology"):
            category, _ = engine.detect_device_category("10.10.8.61", "00:12:34:56:78:90", "unknown-device", open_ports=[8000])
        self.assertEqual(category, "CCTV / IP Camera")

    def test_web_server_by_port_80(self):
        engine = TimestampEngine()
        category, _ = engine.detect_device_category("10.10.8.62", "00:12:34:56:78:91", "unknown-device", open_ports=[80])
        self.assertEqual(category, "Web Server")

    def test_gateway_ip_with_web_port_is_router(self):
        engine = TimestampEngine()
        category, _ = engine.detect_device_category("10.10.8.1", "00:12:34:56:78:92", "unknown-device", open_ports=[80])
        self.assertEqual(category, "Router / AP")


class TestVendorFallback(unittest.TestCase):
    """Fallback berbasis vendor harus case-insensitive dan tidak saling menimpa."""

    def _engine_with_vendor(self, vendor):
        engine = TimestampEngine()
        patcher = patch.object(engine, "lookup_vendor", return_value=vendor)
        patcher.start()
        self.addCleanup(patcher.stop)
        return engine

    def test_vendor_fallback_is_case_insensitive(self):
        engine = self._engine_with_vendor("HIKVISION")
        category, _ = engine.detect_device_category("10.10.8.70", "00:12:34:56:78:93", "unknown-device", open_ports=[])
        self.assertEqual(category, "CCTV / IP Camera")

    def test_macbook_hostname_beats_apple_vendor(self):
        engine = self._engine_with_vendor("Apple, Inc.")
        # Vendor Apple dipakai iPhone dan MacBook; hostname harus menang.
        category, _ = engine.detect_device_category("10.10.8.71", "00:12:34:56:78:94", "MacBook-Pro", open_ports=[])
        self.assertEqual(category, "Laptop / PC")

    def test_apple_vendor_defaults_to_smartphone(self):
        engine = self._engine_with_vendor("Apple, Inc.")
        category, _ = engine.detect_device_category("10.10.8.72", "00:12:34:56:78:95", "unknown-device", open_ports=[])
        self.assertEqual(category, "Smartphone")


class TestCategoryRecheck(unittest.TestCase):
    """Kategori harus bisa dikoreksi ulang, tidak terkunci selamanya."""

    def _register(self, engine, mac, hostname):
        engine.update_device(mac, ip="10.10.8.183", hostname=hostname)

    def test_new_device_needs_probe(self):
        engine = TimestampEngine()
        needs_probe, _ = engine.update_device("80:84:89:76:8e:50", ip="10.10.8.183")
        self.assertTrue(needs_probe)

    def test_recently_probed_device_not_reprobed(self):
        engine = TimestampEngine()
        mac = "80:84:89:76:8e:50"
        self._register(engine, mac, "pienaaa")
        engine.devices[mac]["category"] = "CCTV / IP Camera"
        engine.devices[mac]["category_checked_at"] = datetime.now()

        needs_probe, _ = engine.update_device(mac, ip="10.10.8.183")
        self.assertFalse(needs_probe, "Probe tidak boleh diulang sebelum CATEGORY_RECHECK_SECONDS")

    def test_stale_category_needs_probe(self):
        engine = TimestampEngine()
        mac = "80:84:89:76:8e:50"
        self._register(engine, mac, "pienaaa")
        engine.devices[mac]["category"] = "CCTV / IP Camera"
        engine.devices[mac]["category_checked_at"] = datetime.now() - timedelta(seconds=CATEGORY_RECHECK_SECONDS + 1)

        needs_probe, _ = engine.update_device(mac, ip="10.10.8.183")
        self.assertTrue(needs_probe, "Kategori kedaluwarsa harus diprobe ulang")

    def test_hostname_change_forces_recheck(self):
        engine = TimestampEngine()
        mac = "80:84:89:76:8e:50"
        self._register(engine, mac, "pienaaa")
        engine.devices[mac]["category_checked_at"] = datetime.now()

        needs_probe, _ = engine.update_device(mac, hostname="CCTV-Lobby-01")
        self.assertTrue(needs_probe, "Hostname baru bisa mengubah kategori, jadi harus diprobe ulang")


if __name__ == "__main__":
    unittest.main()
