"""
Tiny sidecar HTTP service: given a YouTube URL, return its caption track as
plain text. Exists only because yt-dlp needs Python + a real package manager,
which the n8n Docker Hardened Image (Alpine, no apk, no python3) can't
provide. n8n's video-template-extract workflow calls this as a fallback when
Gemini's direct video-URL analysis fails (see workflows/video-template-extract.README.md).

GET /transcript?url=<youtube_url> -> {"ok": true, "title": "...", "transcript": "..."}
                                   -> {"ok": false, "error": "..."}
"""

import glob
import html
import os
import re
import tempfile

from flask import Flask, jsonify, request
import yt_dlp

app = Flask(__name__)


def vtt_to_text(vtt: str) -> str:
    out = []
    seen = set()
    for line in vtt.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith(("WEBVTT", "Kind:", "Language:")):
            continue
        if "-->" in line:
            continue
        if re.match(r"^\d+$", line):
            continue
        clean = re.sub(r"<[^>]+>", "", line).strip()
        clean = html.unescape(clean)
        # Auto-generated YouTube captions render as scrolling/overlapping
        # cues, so consecutive duplicate lines are extremely common — drop
        # exact repeats rather than feeding Claude a heavily duplicated wall
        # of text.
        if clean and clean not in seen:
            out.append(clean)
            seen.add(clean)
    return " ".join(out)


@app.route("/transcript")
def transcript():
    url = (request.args.get("url") or "").strip()
    if not url:
        return jsonify({"ok": False, "error": "Missing url parameter"}), 400

    with tempfile.TemporaryDirectory() as tmpdir:
        outtmpl = os.path.join(tmpdir, "sub")
        ydl_opts = {
            "skip_download": True,
            "writesubtitles": True,
            "writeautomaticsub": True,
            "subtitleslangs": ["en", "en-US", "en-orig"],
            "subtitlesformat": "vtt",
            "outtmpl": outtmpl,
            "quiet": True,
            "no_warnings": True,
        }
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
        except Exception as e:
            return jsonify({"ok": False, "error": str(e)}), 200

        title = (info or {}).get("title", "Untitled")
        files = glob.glob(outtmpl + "*")
        if not files:
            return jsonify({"ok": False, "error": "This video has no captions available", "title": title}), 200

        with open(files[0], encoding="utf-8", errors="replace") as f:
            vtt = f.read()

        text = vtt_to_text(vtt)
        if not text:
            return jsonify({"ok": False, "error": "This video has no captions available", "title": title}), 200

        return jsonify({"ok": True, "title": title, "transcript": text[:50000]})


@app.route("/health")
def health():
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8811)
