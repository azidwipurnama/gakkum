import unittest
from unittest.mock import patch
from wifi_bssid import get_host_bssid

SAMPLE_ENGLISH_CONNECTED = """
There is 1 interface on the system:

    Name             : Wi-Fi
    Description      : Intel(R) Wi-Fi 6 AX201 160MHz
    GUID             : xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    Physical address : aa:bb:cc:11:22:33
    State            : connected
    SSID             : GAKKUM_WIFI
    BSSID            : aa:bb:cc:dd:ee:01
    Network type     : Infrastructure
    Radio type       : 802.11ax
    Authentication   : WPA2-Personal
    Cipher           : CCMP
    Bands            : 5 GHz
    Channel          : 36
    Receive rate (Mbps) : 866
    Transmit rate (Mbps) : 866
    Signal           : 99%
    Profile          : GAKKUM_WIFI
"""

SAMPLE_INDONESIAN_CONNECTED = """
Ada 1 antarmuka pada sistem:

    Nama             : Wi-Fi
    Deskripsi        : Intel(R) Wireless-AC
    GUID             : xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    Alamat fisik     : 11:22:33:44:55:66
    Status           : tersambung
    SSID             : JARINGAN WING C
    BSSID            : AA:BB:CC:DD:EE:02
    Jenis jaringan   : Infrastruktur
    Jenis radio      : 802.11ac
    Otentikasi       : WPA2-PSK
"""

SAMPLE_DISCONNECTED = """
There is 1 interface on the system:

    Name             : Wi-Fi
    Description      : Intel(R) Wi-Fi 6
    GUID             : xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    Physical address : aa:bb:cc:11:22:33
    State            : disconnected
"""

SAMPLE_LOCATION_WARNING = """
There is 1 interface on the system:
    State            : disconnected
    Izin lokasi diperlukan untuk menampilkan BSSID.
"""

class TestWifiBssid(unittest.TestCase):
    @patch('subprocess.run')
    def test_english_connected(self, mock_run):
        mock_run.return_value.stdout = SAMPLE_ENGLISH_CONNECTED
        mock_run.return_value.returncode = 0
        bssid = get_host_bssid()
        self.assertEqual(bssid, "aa:bb:cc:dd:ee:01")

    @patch('subprocess.run')
    def test_indonesian_connected(self, mock_run):
        mock_run.return_value.stdout = SAMPLE_INDONESIAN_CONNECTED
        mock_run.return_value.returncode = 0
        bssid = get_host_bssid()
        self.assertEqual(bssid, "aa:bb:cc:dd:ee:02")

    @patch('subprocess.run')
    def test_disconnected(self, mock_run):
        mock_run.return_value.stdout = SAMPLE_DISCONNECTED
        mock_run.return_value.returncode = 0
        bssid = get_host_bssid()
        self.assertIsNone(bssid)

    @patch('subprocess.run')
    def test_no_wifi_or_empty(self, mock_run):
        mock_run.return_value.stdout = ""
        mock_run.return_value.returncode = 0
        bssid = get_host_bssid()
        self.assertIsNone(bssid)

    @patch('subprocess.run')
    def test_location_warning(self, mock_run):
        mock_run.return_value.stdout = SAMPLE_LOCATION_WARNING
        mock_run.return_value.returncode = 0
        bssid = get_host_bssid()
        self.assertIsNone(bssid)

if __name__ == '__main__':
    unittest.main()
