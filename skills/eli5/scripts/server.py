#!/usr/bin/env python3
# ─────────────────────────────────────────────────────────
#  server.py — Help Me Understand notes server
#  (localhost only; no exposure beyond this machine)
#
#  Responsibilities:
#   ① serve the notes directory over HTTP (so pages in the
#      browser can talk to this server)
#   ② POST /ask     receive a select-to-ask question → append
#      to qa.jsonl
#   ② POST /resolve mark a thread resolved from the browser →
#      appended like any other event
#   ③ GET  /qa      incremental Q&A polling (qa.jsonl is the
#      single source of truth; answers and resolves land in the
#      same file — the sides meet through the file)
#   ④ GET  /health liveness probe used by the skill before
#      deciding to start a new server process
#
#  Usage:
#    python3 server.py [--root DIR] [--port N]
#  Cross-platform: Python 3.9+ standard library only
#  (macOS / Linux / Windows).
# ─────────────────────────────────────────────────────────
import argparse
import json
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

VERSION = "1.0.0"
_lock = threading.Lock()


class Store:
    """qa.jsonl access: read (skipping bad lines) + locked append."""

    def __init__(self, path):
        self.path = Path(path)

    def read_all(self):
        items = []
        if self.path.exists():
            try:
                raw = self.path.read_text(encoding="utf-8")
            except OSError:
                return items
            for line in raw.splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    items.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        return items

    def append(self, entry):
        with _lock:
            entry["seq"] = max([i.get("seq", 0) for i in self.read_all()] or [0]) + 1
            with self.path.open("a", encoding="utf-8", newline="\n") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        return entry


def make_handler(store, root):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kw):
            super().__init__(*args, directory=str(root), **kw)

        # Localhost self-use + allow pages opened via file:// to reach us
        # (otherwise select-to-ask would silently fail)
        def end_headers(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            super().end_headers()

        def do_OPTIONS(self):
            self.send_response(204)
            self.end_headers()

        def _json(self, obj, code=200):
            body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            path = urlparse(self.path).path
            if path not in ("/ask", "/resolve"):
                self.send_error(404)
                return
            try:
                payload = json.loads(
                    self.rfile.read(int(self.headers.get("Content-Length", 0)))
                )
                if path == "/resolve":
                    qid = str(payload.get("qid", "")).strip()
                    if not qid:
                        raise ValueError("empty qid")
                    entry = store.append(
                        {
                            "ts": time.strftime("%Y-%m-%d %H:%M:%S"),
                            "type": "resolve",
                            "qid": qid[:200],
                        }
                    )
                    self._json(entry)
                    return
                question = str(payload.get("question", "")).strip()
                if not question:
                    raise ValueError("empty question")
                quote = str(payload.get("quote", "")).strip()
                page = str(payload.get("page", "")).strip()
            except Exception:
                self._json({"error": "bad request"}, 400)
                return
            entry = store.append(
                {
                    "ts": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "type": "question",
                    "id": "q%d" % int(time.time() * 1000),
                    "page": page[:200],
                    "quote": quote[:2000],
                    "text": question[:4000],
                }
            )
            self._json(entry)

        def do_GET(self):
            path = urlparse(self.path).path
            if path == "/qa":
                since = int((parse_qs(urlparse(self.path).query).get("since") or ["0"])[0])
                self._json({"items": [e for e in store.read_all() if e.get("seq", 0) > since]})
            elif path == "/health":
                self._json({"ok": True, "version": VERSION})
            else:
                super().do_GET()

        def log_message(self, *args):
            pass  # stay quiet (log spam would drown background output)

    return Handler


def main():
    ap = argparse.ArgumentParser(description="Help Me Understand notes server")
    ap.add_argument("--root", default=None, help="notes directory to serve (default: ~/.understand/notes)")
    ap.add_argument("--port", type=int, default=8899, help="port to listen on (default: 8899)")
    args = ap.parse_args()

    root = Path(args.root).expanduser() if args.root else Path.home() / ".understand" / "notes"
    root.mkdir(parents=True, exist_ok=True)
    store = Store(root / "qa.jsonl")

    addr = ("127.0.0.1", args.port)
    print("Help Me Understand notes server: http://%s:%d/ (root: %s)" % (addr[0], addr[1], root), flush=True)
    try:
        ThreadingHTTPServer(addr, make_handler(store, root)).serve_forever()
    except OSError as e:
        print("failed to listen on port %d: %s" % (args.port, e), file=sys.stderr, flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
