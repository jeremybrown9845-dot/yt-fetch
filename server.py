#!/usr/bin/env python3
"""
FETCH — yt-dlp server (Render-compatible)
==========================================
Streams downloaded video/audio directly to the browser — no disk storage.

Routes:
  GET  /health          → 200 OK  (Render health check)
  POST /info            → video metadata JSON
  POST /download        → downloads file to tmp, streams it back as attachment
"""

import json
import os
import subprocess
import sys
import tempfile
import threading
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse

PORT = int(os.environ.get("PORT", 8765))
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")   # set to your frontend URL on Render


def build_format_flag(fmt: str) -> list:
    mapping = {
        "best":                ["-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b"],
        "bestvideo+bestaudio": ["-f", "bestvideo+bestaudio", "--merge-output-format", "mp4"],
        "1080p":               ["-f", "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]"],
        "720p":                ["-f", "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]"],
        "480p":                ["-f", "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]"],
        "360p":                ["-f", "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]"],
        "mp3":                 ["-x", "--audio-format", "mp3", "--audio-quality", "0"],
        "m4a":                 ["-x", "--audio-format", "m4a", "--audio-quality", "0"],
        "wav":                 ["-x", "--audio-format", "wav"],
    }
    return mapping.get(fmt, ["-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b"])


def guess_mime(path: str) -> str:
    ext = path.rsplit(".", 1)[-1].lower()
    return {
        "mp4": "video/mp4", "webm": "video/webm", "mkv": "video/x-matroska",
        "mp3": "audio/mpeg", "m4a": "audio/mp4", "wav": "audio/wav", "ogg": "audio/ogg",
    }.get(ext, "application/octet-stream")


class Handler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        print(f"[{self.address_string()}] {fmt % args}", flush=True)

    def send_cors(self):
        self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors()
        self.end_headers()

    def read_json(self):
        n = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(n)) if n else {}

    def json_response(self, code: int, data: dict):
        payload = json.dumps(data).encode()
        self.send_response(code)
        self.send_cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    # GET /health
    def handle_health(self):
        self.json_response(200, {"status": "ok"})

    # POST /info
    def handle_info(self):
        body = self.read_json()
        url = body.get("url", "").strip()
        if not url:
            return self.json_response(400, {"error": "missing url"})

        result = subprocess.run(
            ["yt-dlp", "--dump-json", "--no-playlist", "--no-warnings", url],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            err = (result.stderr.strip().splitlines() or ["unknown error"])[-1]
            return self.json_response(500, {"error": err})

        try:
            info = json.loads(result.stdout)
        except json.JSONDecodeError:
            return self.json_response(500, {"error": "could not parse yt-dlp output"})

        self.json_response(200, {
            "title":           info.get("title", "Unknown"),
            "uploader":        info.get("uploader") or info.get("channel", ""),
            "duration_string": info.get("duration_string", ""),
            "view_count":      info.get("view_count"),
            "thumbnail":       info.get("thumbnail", ""),
            "ext":             info.get("ext", "mp4"),
        })

    # POST /download  — yt-dlp → tmpdir → stream to client
    def handle_download(self):
        body = self.read_json()
        url   = body.get("url", "").strip()
        fmt   = body.get("format", "best")
        subs  = body.get("subs", False)
        thumb = body.get("thumb", True)

        if not url:
            return self.json_response(400, {"error": "missing url"})

        with tempfile.TemporaryDirectory() as tmpdir:
            output_tmpl = os.path.join(tmpdir, "%(title)s.%(ext)s")

            cmd = ["yt-dlp", "--no-playlist", "--newline"]
            cmd += build_format_flag(fmt)
            if subs:
                cmd += ["--write-subs", "--sub-langs", "en.*", "--embed-subs"]
            if thumb:
                cmd += ["--embed-thumbnail"]
            cmd += ["-o", output_tmpl, url]

            print(f"Running: {' '.join(cmd)}", flush=True)
            result = subprocess.run(cmd, capture_output=True, text=True, cwd=tmpdir)

            files = [f for f in os.listdir(tmpdir) if not f.endswith(".part")]
            if not files or result.returncode != 0:
                err = (result.stderr.strip().splitlines() or ["yt-dlp failed"])[-1]
                return self.json_response(500, {"error": err})

            filename = files[0]
            filepath = os.path.join(tmpdir, filename)
            filesize = os.path.getsize(filepath)
            mime     = guess_mime(filepath)
            safe_name = filename.encode("ascii", "replace").decode("ascii")

            self.send_response(200)
            self.send_cors()
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(filesize))
            self.send_header("Content-Disposition", f'attachment; filename="{safe_name}"')
            self.end_headers()

            with open(filepath, "rb") as f:
                while chunk := f.read(256 * 1024):
                    try:
                        self.wfile.write(chunk)
                    except BrokenPipeError:
                        break

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/health":
            self.handle_health()
        else:
            self.json_response(404, {"error": "not found"})

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            if path == "/info":
                self.handle_info()
            elif path == "/download":
                self.handle_download()
            else:
                self.json_response(404, {"error": "not found"})
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr, flush=True)
            try:
                self.json_response(500, {"error": str(e)})
            except Exception:
                pass


if __name__ == "__main__":
    # Make imageio's bundled ffmpeg available on PATH (works on Render without root)
    try:
        import imageio_ffmpeg
        ffmpeg_dir = os.path.dirname(imageio_ffmpeg.get_ffmpeg_exe())
        os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")
        print(f"✅  ffmpeg via imageio: {imageio_ffmpeg.get_ffmpeg_exe()}")
    except Exception as e:
        print(f"⚠️  imageio-ffmpeg not available: {e} — continuing without it")

    check = subprocess.run(["yt-dlp", "--version"], capture_output=True, text=True)
    if check.returncode != 0:
        print("❌  yt-dlp not found — install it: pip install yt-dlp")
        sys.exit(1)
    print(f"✅  yt-dlp {check.stdout.strip()}")
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"🚀  FETCH backend on port {PORT}  (ALLOWED_ORIGIN={ALLOWED_ORIGIN})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
