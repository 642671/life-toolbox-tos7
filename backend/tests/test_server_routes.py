from __future__ import annotations

import http.client
import json
import sys
import threading
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from life_toolbox import server  # noqa: E402


class ServerRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.instance = server.ThreadedTCPServer(("127.0.0.1", 0), server.LifeToolboxHandler)
        cls.host, cls.port = cls.instance.server_address
        cls.thread = threading.Thread(target=cls.instance.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.instance.shutdown()
        cls.thread.join(timeout=5)
        cls.instance.server_close()

    def request(self, method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
        connection = http.client.HTTPConnection(self.host, self.port, timeout=5)
        payload = json.dumps(body) if body is not None else None
        headers = {"Content-Type": "application/json"} if body is not None else {}
        connection.request(method, path, body=payload, headers=headers)
        response = connection.getresponse()
        data = json.loads(response.read().decode("utf-8"))
        connection.close()
        return response.status, data

    def test_health(self) -> None:
        for path in (
            "/health",
            "/life-toolbox/health",
            "/life-toolbox/api/health",
            "/life-toolbox/v2/proxy/life-toolbox/health",
            "/v2/proxy/life-toolbox/health",
        ):
            status, data = self.request("GET", path)
            self.assertEqual(status, 200, path)
            self.assertEqual(data["status"], "ok", path)
            self.assertEqual(data["app"], "life-toolbox", path)

    def test_loan_calculation(self) -> None:
        status, data = self.request(
            "POST",
            "/v2/proxy/life-toolbox/calculate",
            {
                "operation": "loan",
                "principal": 100000,
                "annual_rate_percent": 4.5,
                "years": 10,
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(data["result"]["months"], 120)
        self.assertAlmostEqual(data["result"]["monthly_payment"], 1036.38, places=2)

    def test_invalid_calculation_returns_400(self) -> None:
        status, data = self.request(
            "POST",
            "/v2/proxy/life-toolbox/calculate",
            {"operation": "bmi", "height_cm": 0, "weight_kg": 65},
        )
        self.assertEqual(status, 400)
        self.assertFalse(data["ok"])


class ServerShutdownTests(unittest.TestCase):
    def test_stop_runtime_has_bounded_wait(self) -> None:
        import time

        class SlowServer:
            def __init__(self) -> None:
                self.closed = False

            def shutdown(self) -> None:
                time.sleep(0.3)

            def server_close(self) -> None:
                self.closed = True

        class Worker:
            def join(self, timeout: float | None = None) -> None:
                if timeout:
                    time.sleep(min(timeout, 0.01))

        server_instance = SlowServer()
        started = time.monotonic()
        server.stop_server_runtime(server_instance, Worker(), timeout=0.05)
        elapsed = time.monotonic() - started

        self.assertTrue(server_instance.closed)
        self.assertLess(elapsed, 0.25)


if __name__ == "__main__":
    unittest.main()
