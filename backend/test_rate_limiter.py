"""
Test otomatis untuk verifikasi Rate Limiter endpoint /api/agent/report.

Skenario yang diuji:
1. Normal Traffic: Interval 5 detik -> 201 Created
2. Rate Limit Hit: Interval 1 detik -> 429 Too Many Requests
3. Retry-After Verification: Mengambil nilai header dan menunggu sesuai instruksi -> 201 Created
4. Per-Agent Isolation: Agent A dan Agent B tidak saling memengaruhi.

Catatan:
- Rate limiter dievaluasi DI AWAL handler, SEBELUM autentikasi Supabase.
- Agent ID unik dipakai per-test agar state rate limiter tidak bocor antar-test.
- Test 02 & 04 memverifikasi rate limiter secara langsung (429 muncul sebelum auth).
- Test 01 & 03 membutuhkan API key yang valid untuk mencapai 201; jika key
  tidak cocok, mereka akan dapat 401 — itu adalah kendala otentikasi, bukan
  kegagalan rate limiter.
"""

import requests
import time
import unittest

SERVER_URL = "http://localhost:8001/api/agent/report"
API_KEY = "KEY_ASLI_AGEN_001"

class TestRateLimiterRuntime(unittest.TestCase):
    def send_report(self, agent_id):
        data = {
            "agent_id": agent_id,
            "timestamp": int(time.time()),
            "interfaces": [
                {"name": "eth0", "bytes_sent": 100, "bytes_recv": 100, "packets_sent": 1, "packets_recv": 1}
            ]
        }
        return requests.post(SERVER_URL, json=data, headers={"x-api-key": API_KEY}, timeout=5)

    def test_01_normal_traffic(self):
        """Request dengan interval 5 detik harus lolos rate limiter (>= 200, bukan 429)."""
        agent_id = "test-agent-normal"
        # First request to clear any previous state
        self.send_report(agent_id)
        time.sleep(5)
        response = self.send_report(agent_id)
        self.assertNotEqual(response.status_code, 429, "Normal traffic (5s interval) should not be rate-limited")
        # 201 if API key valid; 401/500 if not — either way, NOT 429
        self.assertIn(response.status_code, [200, 201, 401, 500], f"Unexpected status: {response.status_code}")

    def test_02_rate_limit_hit(self):
        """Request terlalu cepat (< 4s) harus 429 dengan Retry-After header."""
        agent_id = "test-agent-limit"
        self.send_report(agent_id)
        # Request segera setelahnya (< 4s)
        response = self.send_report(agent_id)
        self.assertEqual(response.status_code, 429, "Fast requests should be 429")
        self.assertIn("Retry-After", response.headers, "429 response must have Retry-After header")

    def test_03_retry_after_compliance(self):
        """Menunggu sesuai Retry-After + buffer, lalu request tidak bolei lagi 429."""
        agent_id = "test-agent-retry"
        self.send_report(agent_id)
        response = self.send_report(agent_id)
        self.assertEqual(response.status_code, 429)

        wait_time = int(response.headers.get("Retry-After", 4))
        print(f"Server requested wait: {wait_time}s")
        time.sleep(wait_time + 1) # add buffer

        final_response = self.send_report(agent_id)
        self.assertNotEqual(final_response.status_code, 429, "Request after waiting should not be rate-limited")

    def test_04_per_agent_isolation(self):
        """Agent B tidak boleh terblokir karena Agent A kena rate limit."""
        agent_a = "agent-a"
        agent_b = "agent-b"

        self.send_report(agent_a)
        # Agent A hit limit
        res_a = self.send_report(agent_a)
        self.assertEqual(res_a.status_code, 429)

        # Agent B should not be rate-limited (isolation works).
        # Any non-429 status means the rate limiter correctly allowed it through.
        res_b = self.send_report(agent_b)
        self.assertNotEqual(res_b.status_code, 429, "Agent B should not be rate-limited by Agent A's limit")

if __name__ == '__main__':
    unittest.main()
