"""Telegram inspiration bot (Branch 3): share a photo, video or link to the
bot and it lands in /inspiration, tagged the same as a dashboard upload.

Uses long polling (getUpdates), so it needs no public URL or tunnel; it
runs as a background thread inside the API. Only chats listed in
TELEGRAM_ALLOWED_CHAT_IDS are processed. Anyone else gets a reply with their
chat id, so the owner can add their own id on first use.
"""

import base64
import glob
import logging
import os
import re
import tempfile
import threading
from typing import Any

import httpx

from . import ai
from .config import settings
from .routers.tools import save_inspiration

log = logging.getLogger(__name__)

API = "https://api.telegram.org"
MAX_BOT_DOWNLOAD = 20 * 1024 * 1024   # Bot API getFile limit
MAX_IMAGE = 5 * 1024 * 1024           # Claude vision limit
URL_RE = re.compile(r"https?://\S+")


class TelegramError(RuntimeError):
    pass


class UserFacingError(Exception):
    """Something the sender can fix; the message is sent back to them."""


def _call(method: str, http_timeout: float = 30, **params: Any) -> Any:
    res = httpx.post(f"{API}/bot{settings.telegram_bot_token}/{method}", json=params, timeout=http_timeout)
    body = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
    if res.status_code >= 400 or not body.get("ok"):
        raise TelegramError(f"{method} {res.status_code}: {body.get('description') or res.text[:200]}")
    return body["result"]


def _download(file_id: str) -> bytes:
    info = _call("getFile", file_id=file_id)
    res = httpx.get(f"{API}/file/bot{settings.telegram_bot_token}/{info['file_path']}", timeout=120)
    res.raise_for_status()
    return res.content


def reply(chat_id: int | str, message_id: int | None, text: str) -> None:
    params: dict[str, Any] = {"chat_id": chat_id, "text": text}
    if message_id:
        params["reply_parameters"] = {"message_id": message_id, "allow_sending_without_reply": True}
    try:
        _call("sendMessage", **params)
    except (TelegramError, httpx.HTTPError):
        log.exception("telegram reply failed")


def download_link(url: str) -> tuple[bytes, str, bytes | None]:
    """Fetch a shared TikTok / X / YouTube / Instagram link's video with yt-dlp.

    Returns (video_bytes, mime_type, thumbnail_bytes_or_None).
    """
    import yt_dlp

    with tempfile.TemporaryDirectory() as tmp:
        opts = {
            "format": "best[ext=mp4][filesize<20M]/best[filesize<20M]/worst[ext=mp4]/worst",
            "max_filesize": MAX_BOT_DOWNLOAD,
            "outtmpl": os.path.join(tmp, "clip.%(ext)s"),
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
        }
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True)
        except Exception as e:  # noqa: BLE001 — yt-dlp raises many types
            raise UserFacingError(
                "Couldn't download that link (private, login-only, or unsupported site). "
                "Save the video to your phone and send it to me as a file instead.") from e
        files = [f for f in glob.glob(os.path.join(tmp, "clip.*")) if not f.endswith(".part")]
        if not files:
            raise UserFacingError("That link's video is over 20 MB. Send a shorter clip as a file instead.")
        with open(files[0], "rb") as f:
            video = f.read()
    ext = (info or {}).get("ext") or "mp4"
    thumb = None
    if (info or {}).get("thumbnail"):
        try:
            r = httpx.get(info["thumbnail"], timeout=20, follow_redirects=True)
            if r.status_code == 200 and r.headers.get("content-type", "").startswith("image/"):
                thumb = r.content
        except httpx.HTTPError:
            pass
    return video, f"video/{'mp4' if ext == 'mp4' else ext}", thumb


def _media_from_message(msg: dict) -> dict:
    """Work out what was shared and fetch it. Returns kwargs for save_inspiration."""
    caption = (msg.get("caption") or msg.get("text") or "").strip()
    fwd = msg.get("forward_origin") or {}
    source = (fwd.get("chat") or {}).get("title") or (fwd.get("sender_user") or {}).get("username") or fwd.get("sender_user_name")
    if source:
        caption = f"{caption}\n(forwarded from {source})".strip()

    def check_size(obj: dict, limit: int, what: str) -> None:
        if (obj.get("file_size") or 0) > limit:
            raise UserFacingError(f"That {what} is over {limit // (1024 * 1024)} MB, too big for me to read. Send a smaller one.")

    if msg.get("photo"):
        photo = max(msg["photo"], key=lambda p: p.get("file_size") or p.get("width", 0) * p.get("height", 0))
        check_size(photo, MAX_IMAGE, "photo")
        return {"is_video": False, "file_b64": base64.b64encode(_download(photo["file_id"])).decode(),
                "mime_type": "image/jpeg", "caption": caption}

    video = msg.get("video") or msg.get("animation") or msg.get("video_note")
    doc = msg.get("document") or {}
    if not video and (doc.get("mime_type") or "").startswith("video/"):
        video = doc
    if video:
        check_size(video, MAX_BOT_DOWNLOAD, "video")
        thumb = video.get("thumbnail") or video.get("thumb")
        preview = base64.b64encode(_download(thumb["file_id"])).decode() if thumb else None
        return {"is_video": True, "file_b64": base64.b64encode(_download(video["file_id"])).decode(),
                "mime_type": video.get("mime_type") or "video/mp4", "caption": caption,
                "preview_b64": preview, "preview_mime_type": "image/jpeg" if preview else None}

    if (doc.get("mime_type") or "").startswith("image/"):
        check_size(doc, MAX_IMAGE, "image")
        return {"is_video": False, "file_b64": base64.b64encode(_download(doc["file_id"])).decode(),
                "mime_type": doc["mime_type"], "caption": caption}

    link = URL_RE.search(msg.get("text") or msg.get("caption") or "")
    if link:
        data, mime, thumb = download_link(link.group(0))
        return {"is_video": True, "file_b64": base64.b64encode(data).decode(), "mime_type": mime,
                "caption": caption, "preview_b64": base64.b64encode(thumb).decode() if thumb else None,
                "preview_mime_type": "image/jpeg" if thumb else None}

    raise UserFacingError("Send me a photo, a video, or a link to a post (TikTok, X, YouTube…) and I'll save it to Inspiration.")


def handle_update(update: dict) -> None:
    msg = update.get("message") or update.get("channel_post")
    if not msg:
        return
    chat_id = msg["chat"]["id"]
    message_id = msg.get("message_id")
    if str(chat_id) not in settings.telegram_allowed_chat_ids:
        log.warning("telegram: ignoring message from unlisted chat %s", chat_id)
        reply(chat_id, message_id, f"This bot is private. If it's yours, add {chat_id} to TELEGRAM_ALLOWED_CHAT_IDS "
                                   "in .env and run: docker compose up -d --force-recreate api")
        return
    if (msg.get("text") or "").strip() in ("/start", "/help"):
        reply(chat_id, message_id, "Share or forward a photo, video, or post link here and I'll tag it and save it "
                                   "to Inspiration in the dashboard.")
        return
    try:
        media = _media_from_message(msg)
        saved = save_inspiration(**media, telegram_chat_id=str(chat_id), telegram_message_id=str(message_id))
    except UserFacingError as e:
        reply(chat_id, message_id, str(e))
        return
    except (ai.AIError, TelegramError, httpx.HTTPError) as e:
        log.exception("telegram: failed to save inspiration")
        reply(chat_id, message_id, f"Couldn't save that: {str(e)[:300]}")
        return
    tags = " ".join(f"#{t.replace(' ', '_')}" for t in saved["tags"])
    reply(chat_id, message_id, f"Saved to Inspiration → {saved['category'].replace('_', ' ')}\n\n{saved['summary']}\n{tags}".strip())


class Poller:
    """getUpdates long-poll loop on a daemon thread."""

    def __init__(self) -> None:
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.offset: int | None = None
        self.last_error: str | None = None

    @property
    def running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def start(self) -> None:
        if not settings.telegram_bot_token or self.running:
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="telegram-poller", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def poll_once(self, timeout: int = 50) -> int:
        params: dict[str, Any] = {"timeout": timeout, "allowed_updates": ["message", "channel_post"]}
        if self.offset is not None:
            params["offset"] = self.offset
        updates = _call("getUpdates", http_timeout=timeout + 15, **params)
        for u in updates:
            # Advance first: a message that crashes the handler must not be retried forever.
            self.offset = u["update_id"] + 1
            try:
                handle_update(u)
            except Exception:  # noqa: BLE001 — keep polling whatever one message does
                log.exception("telegram: unhandled error for update %s", u.get("update_id"))
        return len(updates)

    def _run(self) -> None:
        try:
            _call("deleteWebhook")  # getUpdates is refused while a webhook is set
        except (TelegramError, httpx.HTTPError) as e:
            log.warning("telegram: deleteWebhook failed: %s", e)
        log.info("telegram: polling for messages")
        backoff = 1
        while not self._stop.is_set():
            try:
                self.poll_once()
                self.last_error = None
                backoff = 1
            except (TelegramError, httpx.HTTPError) as e:
                self.last_error = str(e) if isinstance(e, TelegramError) else f"Can't reach Telegram: {e}"
                # 409 = another copy of the bot is polling (e.g. a second API instance).
                log.warning("telegram: %s (retrying in %ss)", e, backoff)
                self._stop.wait(backoff)
                backoff = min(backoff * 2, 60)


poller = Poller()
