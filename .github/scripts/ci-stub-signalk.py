"""Minimal stand-in SignalK server for the docker-smoke-test CI job.

Answers GET /signalk/v1/api/vessels/self with 401 unless the request
carries "Authorization: Bearer good-token" — just enough for
docker/healthcheck.sh's SignalK-connectivity probe to exercise a real
success/failure path without needing an actual SignalK server in CI.
"""

import http.server


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.headers.get("Authorization") == "Bearer good-token":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b"{}")
        else:
            self.send_response(401)
            self.end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    http.server.HTTPServer(("127.0.0.1", 3001), Handler).serve_forever()
