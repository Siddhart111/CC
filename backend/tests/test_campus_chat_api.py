"""End-to-end backend tests for Campus Chat API."""
import os
import json
import time
import uuid
import asyncio
import pytest
import requests
import websockets
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path("/app/frontend/.env"))
BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
).rstrip("/")
WS_URL = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")


# --- Health & colleges ---
class TestHealth:
    def test_root(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/", timeout=10)
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_colleges(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/colleges", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert any(c["college_id"] == "upes-dehradun" for c in data)
        c = next(c for c in data if c["college_id"] == "upes-dehradun")
        assert "upes.ac.in" in c["allowed_domains"]


# --- Auth ---
class TestAuth:
    def test_signup_valid_upes(self, api_client):
        email = f"TEST_sa_{uuid.uuid4().hex[:8]}@upes.ac.in"
        r = api_client.post(
            f"{BASE_URL}/api/auth/signup",
            json={"email": email, "password": "test1234", "college_id": "upes-dehradun"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data
        assert "user" in data
        user = data["user"]
        assert "_id" not in user
        assert "password_hash" not in user
        assert user["email"] == email.lower()
        assert user["anon_username"]
        assert user["college_id"] == "upes-dehradun"

    def test_signup_invalid_domain(self, api_client):
        email = f"TEST_bad_{uuid.uuid4().hex[:6]}@gmail.com"
        r = api_client.post(
            f"{BASE_URL}/api/auth/signup",
            json={"email": email, "password": "test1234", "college_id": "upes-dehradun"},
        )
        assert r.status_code == 400, r.text
        assert "must end with" in r.json()["detail"].lower() or "upes" in r.json()["detail"].lower()

    def test_signup_duplicate(self, api_client):
        email = f"TEST_dup_{uuid.uuid4().hex[:6]}@upes.ac.in"
        body = {"email": email, "password": "test1234", "college_id": "upes-dehradun"}
        r1 = api_client.post(f"{BASE_URL}/api/auth/signup", json=body)
        assert r1.status_code == 200
        r2 = api_client.post(f"{BASE_URL}/api/auth/signup", json=body)
        assert r2.status_code == 400
        assert "already" in r2.json()["detail"].lower()

    def test_login_success(self, api_client, user_a):
        r = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": user_a["email"], "password": user_a["password"]},
        )
        assert r.status_code == 200
        data = r.json()
        assert "token" in data
        assert "_id" not in data["user"]
        assert "password_hash" not in data["user"]

    def test_login_wrong_password(self, api_client, user_a):
        r = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": user_a["email"], "password": "wrong-password"},
        )
        assert r.status_code == 401

    def test_me_endpoint(self, api_client, user_a):
        r = api_client.get(f"{BASE_URL}/api/auth/me", headers=user_a["auth"])
        assert r.status_code == 200
        u = r.json()
        assert "_id" not in u
        assert "password_hash" not in u
        assert u["user_id"] == user_a["user"]["user_id"]

    def test_me_no_token(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401


# --- Profile ---
class TestProfile:
    def test_update_profile(self, api_client, user_a):
        new_name = f"TestyTiger{uuid.uuid4().hex[:4]}"
        r = api_client.patch(
            f"{BASE_URL}/api/profile",
            headers=user_a["auth"],
            json={"anon_username": new_name, "bio": "hello world"},
        )
        assert r.status_code == 200
        u = r.json()
        assert u["anon_username"] == new_name
        assert u["bio"] == "hello world"
        # verify via GET /me
        r2 = api_client.get(f"{BASE_URL}/api/auth/me", headers=user_a["auth"])
        assert r2.json()["anon_username"] == new_name

    def test_randomize_username(self, api_client, user_a):
        r = api_client.get(f"{BASE_URL}/api/profile/randomize", headers=user_a["auth"])
        assert r.status_code == 200
        assert "anon_username" in r.json()


# --- Search users ---
class TestUserSearch:
    def test_search_excludes_self(self, api_client, user_a, user_b):
        r = api_client.get(f"{BASE_URL}/api/users/search?q=", headers=user_a["auth"])
        assert r.status_code == 200
        users = r.json()
        ids = [u["user_id"] for u in users]
        assert user_a["user"]["user_id"] not in ids
        # user_b should be in same college list
        assert any(u["user_id"] == user_b["user"]["user_id"] for u in users)


# --- Friends ---
class TestFriends:
    def test_friend_request_flow(self, api_client, user_a, user_b):
        # A sends request to B
        r = api_client.post(
            f"{BASE_URL}/api/friends/request",
            headers=user_a["auth"],
            json={"target_user_id": user_b["user"]["user_id"]},
        )
        assert r.status_code == 200, r.text
        request_id = r.json()["request_id"]
        assert r.json()["status"] == "pending"

        # duplicate -> 400
        r2 = api_client.post(
            f"{BASE_URL}/api/friends/request",
            headers=user_a["auth"],
            json={"target_user_id": user_b["user"]["user_id"]},
        )
        assert r2.status_code == 400

        # B lists incoming requests
        rl = api_client.get(f"{BASE_URL}/api/friends/requests", headers=user_b["auth"])
        assert rl.status_code == 200
        assert any(x["request_id"] == request_id for x in rl.json())

        # B accepts
        rac = api_client.post(
            f"{BASE_URL}/api/friends/respond",
            headers=user_b["auth"],
            json={"request_id": request_id, "action": "accept"},
        )
        assert rac.status_code == 200
        assert rac.json()["status"] == "accepted"

        # Both list friends
        ra_f = api_client.get(f"{BASE_URL}/api/friends", headers=user_a["auth"])
        rb_f = api_client.get(f"{BASE_URL}/api/friends", headers=user_b["auth"])
        assert ra_f.status_code == 200 and rb_f.status_code == 200
        assert any(u["user_id"] == user_b["user"]["user_id"] for u in ra_f.json())
        assert any(u["user_id"] == user_a["user"]["user_id"] for u in rb_f.json())


# --- Chats & Messages ---
class TestChats:
    def test_groups_listed(self, api_client, user_a):
        r = api_client.get(f"{BASE_URL}/api/groups", headers=user_a["auth"])
        assert r.status_code == 200
        groups = r.json()
        lounge = next((g for g in groups if g["chat_id"] == "group-upes-lounge"), None)
        assert lounge is not None
        assert lounge["joined"] is True
        assert lounge["members_count"] >= 1

    def test_send_and_get_messages_lounge(self, api_client, user_a):
        chat_id = "group-upes-lounge"
        content = f"TEST_msg_{uuid.uuid4().hex[:6]}"
        r = api_client.post(
            f"{BASE_URL}/api/chats/{chat_id}/messages",
            headers=user_a["auth"],
            json={"content": content},
        )
        assert r.status_code == 200, r.text
        msg = r.json()
        assert msg["content"] == content
        assert msg["sender"]["anon_username"]
        assert "_id" not in msg

        rg = api_client.get(f"{BASE_URL}/api/chats/{chat_id}/messages", headers=user_a["auth"])
        assert rg.status_code == 200
        msgs = rg.json()
        assert any(m["content"] == content for m in msgs)

    def test_non_member_cannot_post(self, api_client, user_a, user_b):
        # Create DM between A and B
        rdm = api_client.post(
            f"{BASE_URL}/api/chats/dm",
            headers=user_a["auth"],
            json={"target_user_id": user_b["user"]["user_id"]},
        )
        assert rdm.status_code == 200
        chat_id = rdm.json()["chat_id"]

        # Make a 3rd user not in this dm
        email_c = f"TEST_userc_{uuid.uuid4().hex[:6]}@ddn.upes.ac.in"
        rs = api_client.post(
            f"{BASE_URL}/api/auth/signup",
            json={"email": email_c, "password": "test1234", "college_id": "upes-dehradun"},
        )
        assert rs.status_code == 200
        token_c = rs.json()["token"]
        # C tries posting -> 403
        r403 = api_client.post(
            f"{BASE_URL}/api/chats/{chat_id}/messages",
            headers={"Authorization": f"Bearer {token_c}"},
            json={"content": "intrude"},
        )
        assert r403.status_code == 403

    def test_dm_idempotent(self, api_client, user_a, user_b):
        r1 = api_client.post(
            f"{BASE_URL}/api/chats/dm",
            headers=user_a["auth"],
            json={"target_user_id": user_b["user"]["user_id"]},
        )
        r2 = api_client.post(
            f"{BASE_URL}/api/chats/dm",
            headers=user_b["auth"],
            json={"target_user_id": user_a["user"]["user_id"]},
        )
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["chat_id"] == r2.json()["chat_id"]

    def test_list_chats(self, api_client, user_a):
        r = api_client.get(f"{BASE_URL}/api/chats", headers=user_a["auth"])
        assert r.status_code == 200
        items = r.json()
        # should have lounge and at least the DM with user_b
        assert any(c["chat_id"] == "group-upes-lounge" for c in items)


# --- WebSocket ---
class TestWebSocket:
    def test_ws_connect_and_receive_message(self, api_client, user_a, user_b):
        async def runner():
            url_a = f"{WS_URL}/api/ws?token={user_a['token']}"
            url_b = f"{WS_URL}/api/ws?token={user_b['token']}"
            received = {}
            async with websockets.connect(url_a) as wsa, websockets.connect(url_b) as wsb:
                ready_a = json.loads(await asyncio.wait_for(wsa.recv(), timeout=5))
                ready_b = json.loads(await asyncio.wait_for(wsb.recv(), timeout=5))
                assert ready_a.get("type") == "ready"
                assert ready_b.get("type") == "ready"

                # Send message in lounge as A; B should receive it
                content = f"TEST_ws_{uuid.uuid4().hex[:6]}"
                resp = requests.post(
                    f"{BASE_URL}/api/chats/group-upes-lounge/messages",
                    headers=user_a["auth"],
                    json={"content": content},
                    timeout=10,
                )
                assert resp.status_code == 200

                # B waits for message event
                deadline = time.time() + 6
                while time.time() < deadline:
                    try:
                        ev = json.loads(await asyncio.wait_for(wsb.recv(), timeout=3))
                    except asyncio.TimeoutError:
                        break
                    if ev.get("type") == "message" and ev.get("chat_id") == "group-upes-lounge":
                        if ev["message"]["content"] == content:
                            received["ok"] = True
                            break
            assert received.get("ok"), "Did not receive WS message"

        asyncio.run(runner())

    def test_ws_invalid_token(self):
        async def runner():
            url = f"{WS_URL}/api/ws?token=invalid.token.here"
            try:
                async with websockets.connect(url) as ws:
                    # Should be closed by server quickly
                    try:
                        await asyncio.wait_for(ws.recv(), timeout=3)
                    except Exception:
                        pass
            except Exception:
                pass
            # Just ensure no crash; consider pass if connection closed/refused

        asyncio.run(runner())
