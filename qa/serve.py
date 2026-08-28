"""Static server for the QA build snapshot, mounted at /flyway/ like production."""
import http.server, socketserver, os, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5211


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def translate_path(self, path):
        if path.startswith("/flyway/"):
            path = path[len("/flyway"):]
        elif path == "/flyway":
            path = "/"
        return super().translate_path(path)

    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), H) as httpd:
    print(f"serving {ROOT} at http://localhost:{PORT}/flyway/", flush=True)
    httpd.serve_forever()
