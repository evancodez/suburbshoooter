#!/usr/bin/env python3
"""Dev server with cache disabled so file edits always show on reload."""
import http.server
import socketserver

PORT = 8377


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('', PORT), Handler) as httpd:
    print(f'serving on http://localhost:{PORT}')
    httpd.serve_forever()
