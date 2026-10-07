"""HTTP-over-Unix-socket server for the Life Toolbox TOS application."""

from __future__ import annotations

import json
import os
import signal
import socketserver
import sys
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler
from typing import Any

from . import __version__
from . import calculations

APP_ID = "life-toolbox"
SOCKET_DIR = "/var/api"
SOCKET_PATH = os.path.join(SOCKET_DIR, f"{APP_ID}.sock")
MAX_BODY_BYTES = 64 * 1024


def log(level: str, message: str) -> None:
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [{level}] [life-toolbox] {message}", flush=True)


class LifeToolboxHandler(BaseHTTPRequestHandler):
    server_version = f"life-toolbox/{__version__}"
    timeout = 30

    def log_message(self, format: str, *args: Any) -> None:
        # systemd already captures stdout/stderr; avoid duplicate access logs.
        return

    def _origin(self) -> str:
        return self.headers.get("Origin") or "null"

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", self._origin())
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.end_headers()
        self.wfile.write(body)

    def _action(self) -> str:
        path = self.path.split("?", 1)[0].rstrip("/")
        parts = [part for part in path.split("/") if part]
        if not parts:
            return "info"
        if APP_ID in parts:
            index = parts.index(APP_ID)
            parts = parts[index + 1 :]
        return parts[-1] if parts else "info"

    def _read_json(self) -> dict[str, Any]:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise calculations.CalculationError("invalid Content-Length") from exc
        if length < 0 or length > MAX_BODY_BYTES:
            raise calculations.CalculationError("request body is too large")
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise calculations.CalculationError("request body must be valid JSON") from exc
        if not isinstance(payload, dict):
            raise calculations.CalculationError("JSON body must be an object")
        return payload

    def _handle(self, action: str, payload: dict[str, Any] | None = None) -> None:
        payload = payload or {}
        try:
            if action in {"health", "healthz", "ping"}:
                self._send_json(
                    200,
                    {
                        "status": "ok",
                        "app": APP_ID,
                        "version": __version__,
                        "python": sys.version.split()[0],
                    },
                )
                return

            if action in {"info", ""}:
                self._send_json(
                    200,
                    {
                        "status": "ok",
                        "app": APP_ID,
                        "version": __version__,
                        "capabilities": [
                            "date",
                            "unit",
                            "bmi",
                            "discount",
                            "tip",
                            "fuel",
                            "loan",
                            "picker",
                            "password",
                        ],
                    },
                )
                return

            operation = str(payload.get("operation", ""))
            if action in {"calculate", "api"}:
                if operation == "date":
                    result = calculations.date_difference(payload.get("start"), payload.get("end"))
                elif operation == "unit":
                    result = calculations.convert_unit(
                        payload.get("value"),
                        payload.get("from_unit", ""),
                        payload.get("to_unit", ""),
                    )
                elif operation == "bmi":
                    result = calculations.bmi(payload.get("height_cm"), payload.get("weight_kg"))
                elif operation == "discount":
                    result = calculations.discount(
                        payload.get("original_price"),
                        payload.get("discount_percent"),
                        payload.get("tax_percent", 0),
                    )
                elif operation == "tip":
                    result = calculations.tip_split(
                        payload.get("bill"),
                        payload.get("tip_percent"),
                        payload.get("people"),
                    )
                elif operation == "fuel":
                    result = calculations.fuel_cost(
                        payload.get("distance_km"),
                        payload.get("liters_per_100km"),
                        payload.get("price_per_liter"),
                    )
                elif operation == "loan":
                    result = calculations.loan_payment(
                        payload.get("principal"),
                        payload.get("annual_rate_percent"),
                        payload.get("years"),
                    )
                else:
                    raise calculations.CalculationError("unknown calculation operation")
                self._send_json(200, {"ok": True, "operation": operation, "result": result})
                return

            if action == "pick":
                self._send_json(200, {"ok": True, **calculations.pick_item(payload.get("items", []))})
                return

            if action == "password":
                self._send_json(
                    200,
                    {
                        "ok": True,
                        **calculations.generate_password(
                            payload.get("length", 16),
                            str(payload.get("mode", "mixed")),
                        ),
                    },
                )
                return

            self._send_json(404, {"ok": False, "error": "not found", "path": self.path})
        except calculations.CalculationError as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
        except Exception as exc:  # pragma: no cover - defensive last resort
            log("ERROR", f"Unhandled request failure: {exc}")
            self._send_json(500, {"ok": False, "error": "internal server error"})

    def do_GET(self) -> None:
        self._handle(self._action())

    def do_POST(self) -> None:
        try:
            payload = self._read_json()
        except calculations.CalculationError as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
            return
        self._handle(self._action(), payload)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", self._origin())
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Csrf-Token, Cookie")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    """Cross-platform test server; production uses the Unix socket variant."""

    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 100


UnixServerBase = getattr(socketserver, "UnixStreamServer", socketserver.TCPServer)


class ThreadedUnixHTTPServer(socketserver.ThreadingMixIn, UnixServerBase):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 100


def _remove_stale_socket() -> None:
    os.makedirs(SOCKET_DIR, exist_ok=True)
    if os.path.exists(SOCKET_PATH):
        os.unlink(SOCKET_PATH)


def create_server() -> ThreadedUnixHTTPServer:
    if not hasattr(socketserver, "UnixStreamServer"):
        raise RuntimeError("Unix sockets are required to run the production service")
    _remove_stale_socket()
    server = ThreadedUnixHTTPServer(SOCKET_PATH, LifeToolboxHandler)
    os.chmod(SOCKET_PATH, 0o660)
    return server


def main() -> int:
    server = create_server()
    stop_event = threading.Event()

    def request_stop(signum: int, frame: Any) -> None:
        log("INFO", f"Received signal {signum}; stopping service")
        stop_event.set()

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)

    worker = threading.Thread(target=server.serve_forever, name="http-server", daemon=True)
    worker.start()
    log("INFO", f"Service started on {SOCKET_PATH} with Python {sys.version.split()[0]}")

    try:
        while not stop_event.wait(1.0):
            pass
    finally:
        server.shutdown()
        worker.join(timeout=5)
        server.server_close()
        if os.path.exists(SOCKET_PATH):
            os.unlink(SOCKET_PATH)
        log("INFO", "Service stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
