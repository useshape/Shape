from http.server import BaseHTTPRequestHandler, HTTPServer
import json

ITEMS = {}

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(json.dumps(ITEMS).encode())

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length) or b"{}")
        ITEMS[body["id"]] = body
        self.send_response(200)
        self.end_headers()
