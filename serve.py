#!/usr/bin/env python3
"""BLOCK OPS local server.

Serves the game AND relays LAN multiplayer messages, so friends on the same
wifi can play together even when the router blocks WebRTC or the internet:

    python3 serve.py
    -> you:      http://localhost:8377
    -> friends:  http://<your-lan-ip>:8377   (printed below at startup)

The relay is a dumb mailbox: every player polls their inbox a few times a
second and posts messages addressed to the host, one player, or everyone.
No WebRTC, no external services — plain same-origin HTTP.
"""
import http.server
import json
import socket
import socketserver
import threading
import time

PORT = 8377

# ---------- LAN relay state ----------
LOCK = threading.Lock()
PLAYERS = {}   # pid -> {queue: [msgs], seen: last-poll time, host: bool}
HOST_PID = None


def now():
    return time.monotonic()


def reap_stale():
    """Drop players that stopped polling; if the host vanishes, tell everyone."""
    global HOST_PID
    dead = [pid for pid, p in PLAYERS.items() if now() - p['seen'] > 6]
    for pid in dead:
        was_host = pid == HOST_PID
        del PLAYERS[pid]
        if was_host:
            HOST_PID = None
            for p in PLAYERS.values():
                p['queue'].append({'t': '__hostgone'})
        elif HOST_PID in PLAYERS:
            PLAYERS[HOST_PID]['queue'].append({'t': '__left', 'pid': pid})


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))  # no traffic sent; just picks the LAN interface
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return '127.0.0.1'


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, *args):
        pass  # keep the console readable

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get('Content-Length', 0) or 0)
        return json.loads(self.rfile.read(n) or b'{}')

    def do_GET(self):
        global HOST_PID
        if self.path.startswith('/lan/poll'):
            from urllib.parse import parse_qs, urlparse
            pid = parse_qs(urlparse(self.path).query).get('pid', [''])[0]
            with LOCK:
                reap_stale()
                p = PLAYERS.get(pid)
                if not p:
                    return self._json({'gone': True})
                p['seen'] = now()
                msgs, p['queue'] = p['queue'], []
            return self._json({'msgs': msgs, 'hostUp': HOST_PID is not None})
        if self.path == '/lan/info':
            with LOCK:
                reap_stale()
                return self._json({
                    'ip': lan_ip(), 'port': PORT,
                    'hostUp': HOST_PID is not None,
                    'players': len(PLAYERS),
                })
        return super().do_GET()

    def do_POST(self):
        global HOST_PID
        if self.path == '/lan/host':
            d = self._body()
            with LOCK:
                reap_stale()
                if HOST_PID is not None and HOST_PID != d.get('pid'):
                    return self._json({'err': 'someone on this wifi is already hosting'}, 409)
                HOST_PID = d['pid']
                PLAYERS[HOST_PID] = {'queue': [], 'seen': now(), 'host': True}
            return self._json({'ok': True, 'ip': lan_ip(), 'port': PORT})
        if self.path == '/lan/join':
            d = self._body()
            with LOCK:
                reap_stale()
                if HOST_PID is None:
                    return self._json({'err': 'no wifi game is being hosted right now'}, 404)
                PLAYERS[d['pid']] = {'queue': [], 'seen': now(), 'host': False}
                PLAYERS[HOST_PID]['queue'].append({'t': '__join', 'pid': d['pid']})
            return self._json({'ok': True})
        if self.path == '/lan/send':
            d = self._body()
            with LOCK:
                if d.get('pid') not in PLAYERS:
                    return self._json({'gone': True})
                to = d.get('to')
                msgs = d.get('msgs', [])
                if to == 'host':
                    if HOST_PID in PLAYERS:
                        PLAYERS[HOST_PID]['queue'].extend(
                            {'__from': d['pid'], **m} for m in msgs)
                elif to == 'others':  # host broadcast
                    for pid, p in PLAYERS.items():
                        if pid != d['pid']:
                            p['queue'].extend(msgs)
                elif to in PLAYERS:
                    PLAYERS[to]['queue'].extend(msgs)
            return self._json({'ok': True})
        return self._json({'err': 'unknown'}, 404)


class ThreadingServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


with ThreadingServer(('', PORT), Handler) as httpd:
    print(f'serving on   http://localhost:{PORT}')
    print(f'wifi friends: http://{lan_ip()}:{PORT}')
    httpd.serve_forever()
