import unittest

from timestamp_engine import TimestampEngine, BSSID_MAPPING_NORMALIZED
from supabase_payload import DEVICE_UPSERT_FIELDS, build_device_upsert_payload


class TestBssidIntegration(unittest.TestCase):
    """Verifikasi alur BSSID host -> lokasi tanpa menyentuh jaringan atau Supabase."""

    def test_mapping_dinormalisasi_ke_huruf_kecil(self):
        # get_host_bssid() mengembalikan huruf kecil, sedangkan config.py memakai huruf besar
        self.assertEqual(BSSID_MAPPING_NORMALIZED.get("aa:bb:cc:dd:ee:01"), "Gakkum-1")

    def test_stamp_host_bssid_mengisi_lokasi(self):
        engine = TimestampEngine()
        engine.update_device("aa:bb:cc:00:00:0a", ip="10.10.20.11", hostname="AP-Lobby")
        engine.update_device("aa:bb:cc:00:00:0b", ip="10.10.20.12", hostname="AP-Koridor")

        lokasi_awal = sorted(d["location"] for d in engine.get_full_payload()["devices"])
        self.assertEqual(lokasi_awal, ["Unknown", "Unknown"])

        # Huruf besar sengaja dipakai untuk menguji normalisasi
        self.assertEqual(engine.apply_host_bssid("AA:BB:CC:DD:EE:01"), 2)

        lokasi_akhir = sorted(d["location"] for d in engine.get_full_payload()["devices"])
        self.assertEqual(lokasi_akhir, ["Gakkum-1", "Gakkum-1"])

    def test_bssid_perangkat_tidak_ditimpa(self):
        engine = TimestampEngine()
        engine.update_device("aa:bb:cc:00:00:0c", ip="10.10.20.13", bssid="aa:bb:cc:dd:ee:02")
        engine.apply_host_bssid("aa:bb:cc:dd:ee:01")

        self.assertEqual(engine.devices["aa:bb:cc:00:00:0c"]["bssid"], "aa:bb:cc:dd:ee:02")
        self.assertEqual(engine.get_full_payload()["devices"][0]["location"], "Gakkum-2")

    def test_bssid_none_tidak_mengubah_apa_pun(self):
        engine = TimestampEngine()
        engine.update_device("aa:bb:cc:00:00:0e", ip="10.10.20.14")

        self.assertEqual(engine.apply_host_bssid(None), 0)
        self.assertEqual(engine.devices["aa:bb:cc:00:00:0e"]["bssid"], "")

    def test_payload_memuat_field_bssid(self):
        engine = TimestampEngine()
        engine.update_device("aa:bb:cc:00:00:0f", ip="10.10.20.15", bssid="aa:bb:cc:dd:ee:01")

        device = engine.get_full_payload()["devices"][0]
        self.assertEqual(device["bssid"], "aa:bb:cc:dd:ee:01")

    def test_perangkat_tanpa_ip_difilter(self):
        engine = TimestampEngine()
        engine.update_device("aa:bb:cc:00:00:10", ip="")

        self.assertEqual(engine.get_full_payload()["devices"], [])

    def test_payload_upsert_tidak_memuat_bssid(self):
        engine = TimestampEngine()
        engine.update_device(
            "aa:bb:cc:00:00:11",
            ip="10.10.20.16",
            hostname="Laptop-A",
            bssid="aa:bb:cc:dd:ee:01",
        )
        devices = engine.get_full_payload()["devices"]

        # BSSID tetap ada di payload internal (frontend + pemetaan lokasi)
        self.assertEqual(devices[0]["bssid"], "aa:bb:cc:dd:ee:01")

        prepared = build_device_upsert_payload(devices)
        self.assertEqual(len(prepared), 1)

        # BSSID tidak boleh ikut ke Supabase
        self.assertNotIn("bssid", prepared[0])
        self.assertNotIn("bssid", DEVICE_UPSERT_FIELDS)
        self.assertEqual(
            sorted(prepared[0].keys()),
            ["category", "hostname", "id", "ip", "location", "vendor"],
        )
        self.assertEqual(prepared[0]["id"], "aa:bb:cc:00:00:11")
        self.assertEqual(prepared[0]["location"], "Gakkum-1")

    def test_payload_upsert_bssid_kosong_tetap_tanpa_bssid(self):
        engine = TimestampEngine()
        engine.update_device("aa:bb:cc:00:00:12", ip="10.10.20.17", hostname="PC-B")

        prepared = build_device_upsert_payload(engine.get_full_payload()["devices"])

        self.assertEqual(len(prepared), 1)
        self.assertNotIn("bssid", prepared[0])
        self.assertEqual(prepared[0]["location"], "Unknown")


if __name__ == '__main__':
    unittest.main()
