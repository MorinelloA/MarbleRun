"""Static dev server for Marble Run Builder.

Serves the repo root with `Cache-Control: no-store`, so the browser always
re-fetches ES modules after an edit (Python's stock server sends only
Last-Modified, and browsers then reuse stale modules without asking).
MIME types are pinned because the Windows registry can map `.js` to
`text/plain`, which breaks module scripts.

    python tools/devserver.py [port] [--lan]

--lan binds every interface so an iPad on the same network can connect
(allow Python through the Windows firewall the first time).
"""
import argparse
import functools
import http.server
import os
import socket

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.json': 'application/json',
        '.webmanifest': 'application/manifest+json',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.woff2': 'font/woff2',
        '.txt': 'text/plain',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        # only failed requests are worth a line in the preview logs
        if len(args) > 1 and str(args[1])[:1] in '45':
            super().log_message(fmt, *args)


def lan_addresses():
    try:
        return sorted({info[4][0] for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)})
    except OSError:
        return []


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('port', nargs='?', type=int, default=8321)
    parser.add_argument('--lan', action='store_true', help='listen on every interface')
    args = parser.parse_args()

    host = '0.0.0.0' if args.lan else '127.0.0.1'
    handler = functools.partial(Handler, directory=ROOT)
    with http.server.ThreadingHTTPServer((host, args.port), handler) as server:
        print(f'Serving {ROOT} at http://localhost:{args.port}/', flush=True)
        if args.lan:
            for ip in lan_addresses():
                print(f'  on the network: http://{ip}:{args.port}/', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
