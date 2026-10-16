# Orlen demo — test: a plain-Python (stdlib only) HTTP server behind the demos gateway.
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Hello(BaseHTTPRequestHandler):
    def do_GET(self):
        body = b"hello world\n"
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


port = int(os.environ.get("PORT", "8000"))
print(f"hello world on http://localhost:{port}", flush=True)
ThreadingHTTPServer(("127.0.0.1", port), Hello).serve_forever()
