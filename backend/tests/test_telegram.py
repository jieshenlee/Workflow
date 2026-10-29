"""Telegram inspiration bot: Telegram's API faked, real DB + save_inspiration."""

import base64
import dataclasses

import pytest

from .conftest import PNG

OWNER = 111


@pytest.fixture()
def bot(monkeypatch, fakes):
    from app import telegram

    monkeypatch.setattr(telegram, "settings", dataclasses.replace(
        telegram.settings, telegram_bot_token="TOKEN", telegram_allowed_chat_ids=frozenset({str(OWNER)})))

    class FakeTelegram:
        def __init__(self):
            self.sent: list[dict] = []
            self.updates: list[list[dict]] = []
            self.files = {"photo-big": base64.b64decode(PNG), "vid": b"MP4DATA", "thumb": base64.b64decode(PNG)}

        def call(self, method, http_timeout=30, **params):
            self.last_params = params
            if method == "sendMessage":
                self.sent.append(params)
                return {}
            if method == "getUpdates":
                return self.updates.pop(0) if self.updates else []
            raise AssertionError(method)

        def download(self, file_id):
            return self.files[file_id]

    fake = FakeTelegram()
    monkeypatch.setattr(telegram, "_call", fake.call)
    monkeypatch.setattr(telegram, "_download", fake.download)
    fake.module = telegram
    return fake


def msg(**kw):
    return {"update_id": kw.pop("update_id", 1),
            "message": {"message_id": 7, "chat": {"id": kw.pop("chat_id", OWNER)}, **kw}}


def latest(db):
    return db.execute("SELECT * FROM inspiration_items ORDER BY created_at DESC LIMIT 1").fetchone()


def test_photo_is_tagged_saved_and_replied(bot, db, fakes):
    bot.module.handle_update(msg(caption="new phone", photo=[
        {"file_id": "photo-small", "file_size": 100}, {"file_id": "photo-big", "file_size": 900}]))
    row = latest(db)
    assert row["type"] == "image" and row["category"] == "gadgets" and row["preview_b64"] == PNG
    assert row["telegram_chat_id"] == str(OWNER) and row["telegram_message_id"] == "7"
    assert "new phone" in fakes.claude_calls[-1]["content"][-1]["text"]
    reply = bot.sent[-1]
    assert reply["chat_id"] == OWNER and reply["reply_parameters"]["message_id"] == 7
    assert reply["text"].startswith("Saved to Inspiration → gadgets") and "#a" in reply["text"]


def test_video_uses_gemini_and_telegram_thumbnail(bot, db, fakes):
    bot.module.handle_update(msg(video={"file_id": "vid", "mime_type": "video/mp4", "file_size": 5000,
                                        "thumbnail": {"file_id": "thumb"}},
                                 forward_origin={"type": "channel", "chat": {"title": "Tech Daily"}}))
    row = latest(db)
    assert row["type"] == "video" and row["preview_mime_type"] == "image/jpeg" and row["preview_b64"] == PNG
    assert "(forwarded from Tech Daily)" in row["source_caption"]
    call = fakes.gemini_calls[-1]["body"]["contents"][0]["parts"][1]["inlineData"]
    assert call == {"mimeType": "video/mp4", "data": base64.b64encode(b"MP4DATA").decode()}


def test_link_is_downloaded_with_ytdlp(bot, db, fakes, monkeypatch):
    seen = []

    def fake_download(url):
        seen.append(url)
        return b"LINKVID", "video/mp4", base64.b64decode(PNG)

    monkeypatch.setattr(bot.module, "download_link", fake_download)
    bot.module.handle_update(msg(text="lol https://www.tiktok.com/@x/video/123 so good"))
    assert seen == ["https://www.tiktok.com/@x/video/123"]
    assert latest(db)["type"] == "video"


def test_download_failure_is_explained_to_sender(bot, db, monkeypatch):
    def fail(url):
        raise bot.module.UserFacingError("Couldn't download that link")

    monkeypatch.setattr(bot.module, "download_link", fail)
    before = db.execute("SELECT count(*) AS n FROM inspiration_items").fetchone()["n"]
    bot.module.handle_update(msg(text="https://instagram.com/p/abc"))
    assert bot.sent[-1]["text"] == "Couldn't download that link"
    assert db.execute("SELECT count(*) AS n FROM inspiration_items").fetchone()["n"] == before


def test_unknown_chat_is_refused_with_its_id(bot, db, fakes):
    calls = len(fakes.claude_calls)
    bot.module.handle_update(msg(chat_id=999, photo=[{"file_id": "photo-big"}]))
    assert "add 999 to TELEGRAM_ALLOWED_CHAT_IDS" in bot.sent[-1]["text"]
    assert len(fakes.claude_calls) == calls  # no AI spend for strangers


def test_too_big_and_unsupported_messages(bot):
    bot.module.handle_update(msg(photo=[{"file_id": "photo-big", "file_size": 9 * 1024 * 1024}]))
    assert "over 5 MB" in bot.sent[-1]["text"]
    bot.module.handle_update(msg(text="hello"))
    assert bot.sent[-1]["text"].startswith("Send me a photo")
    bot.module.handle_update(msg(text="/start"))
    assert "Inspiration" in bot.sent[-1]["text"]


def test_ai_failure_is_reported_not_raised(bot, monkeypatch):
    from app import ai

    def boom(**kw):
        raise ai.AIError("api.anthropic.com 529: overloaded")

    monkeypatch.setattr(ai, "claude", boom)
    bot.module.handle_update(msg(photo=[{"file_id": "photo-big"}]))
    assert bot.sent[-1]["text"].startswith("Couldn't save that: api.anthropic.com 529")


def test_poll_once_advances_offset_even_when_a_handler_crashes(bot, monkeypatch):
    poller = bot.module.Poller()
    bot.updates.append([msg(update_id=41, text="/help"), msg(update_id=42, text="/help")])
    handled = []

    def flaky(update):
        handled.append(update["update_id"])
        if update["update_id"] == 41:
            raise RuntimeError("bad message")

    monkeypatch.setattr(bot.module, "handle_update", flaky)
    assert poller.poll_once(timeout=0) == 2
    assert handled == [41, 42] and poller.offset == 43
    poller.poll_once(timeout=0)
    assert bot.last_params == {"timeout": 0, "allowed_updates": ["message", "channel_post"], "offset": 43}
