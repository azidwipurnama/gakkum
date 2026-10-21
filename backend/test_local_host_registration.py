import unittest
from unittest.mock import patch, MagicMock
import json
import threading
from timestamp_engine import TimestampEngine
from sniffer import NetworkSniffer

class TestLocalHostRegistration(unittest.TestCase):
    @patch('sniffer.get_working_if', return_value='DummyInterface')
    @patch('sniffer.get_if_hwaddr', return_value='80-84-89-76-8E-50')
    @patch('socket.gethostname', return_value='TestLaptop')
    @patch('subprocess.check_output', return_value=b"")
    def test_local_host_registration_flow(self, mock_subprocess, mock_hostname, mock_get_hwaddr, mock_get_working_if):
        engine = TimestampEngine()

        # Mock dependencies for NetworkSniffer
        mock_workers = MagicMock()
        mock_shutdown = threading.Event()

        # Initialize properly
        sniffer = NetworkSniffer(engine, mock_workers, mock_shutdown)
        sniffer.target_iface = 'DummyInterface'
        sniffer.local_ip = '192.168.100.23'

        # To prevent scan_arp_table from looping forever, we set the shutdown event
        # shortly after the first iteration or mock the loop.
        # Since scan_arp_table now has 'while not self.shutdown_event.is_set():',
        # we need a way to break out.

        def side_effect(*args, **kwargs):
            mock_shutdown.set()
            return b""

        mock_subprocess.side_effect = side_effect

        # Execute scan_arp_table
        sniffer.scan_arp_table()

        # Verify host is in engine.devices
        mac_key = '80:84:89:76:8e:50'
        self.assertIn(mac_key, engine.devices)
        self.assertEqual(engine.devices[mac_key]['ip'], '192.168.100.23')
        self.assertEqual(engine.devices[mac_key]['hostname'], 'TestLaptop')
        self.assertEqual(engine.devices[mac_key]['latency'], 0)

        # Verify payload generation & JSON serializability
        payload = engine.get_full_payload()
        self.assertEqual(len(payload['devices']), 1)
        self.assertEqual(payload['devices'][0]['mac'], mac_key)
        self.assertEqual(payload['devices'][0]['ip'], '192.168.100.23')

        # Test json serialization
        serialized = json.dumps(payload)
        self.assertIn('192.168.100.23', serialized)
        self.assertNotIn('_LatencyMarker', serialized)

        # Run scan_arp_table again to ensure no duplication
        # Reset shutdown event first
        mock_shutdown.clear()
        mock_subprocess.side_effect = side_effect
        sniffer.scan_arp_table()
        self.assertEqual(len(engine.devices), 1)

if __name__ == '__main__':
    unittest.main()
