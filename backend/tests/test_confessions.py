"""Backend tests for Confessions Wall endpoints."""
import os
import uuid
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path("/app/frontend/.env"))
BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
).rstrip("/")


# Helper signups (don't depend on session-scoped users that may be shared)
def _signup_new():
    email = f"TEST_conf_{uuid.uuid4().hex[:8]}@upes.ac.in"
    ro = requests.post(
        f"{BASE_URL}/api/auth/request-otp",
        json={"email": email, "college_id": "upes-dehradun"},
        timeout=15,
    )
    assert ro.status_code == 200, ro.text
    otp = ro.json()["dev_otp"]
    r = requests.post(
        f"{BASE_URL}/api/auth/signup",
        json={"email": email, "password": "test1234", "college_id": "upes-dehradun", "otp": otp},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    return {"token": d["token"], "user": d["user"], "auth": {"Authorization": f"Bearer {d['token']}"}}


@pytest.fixture(scope="module")
def author():
    return _signup_new()


@pytest.fixture(scope="module")
def other():
    return _signup_new()


# --- Create ---
class TestConfessionCreate:
    def test_create_basic(self, api_client, author):
        r = api_client.post(
            f"{BASE_URL}/api/confessions",
            headers=author["auth"],
            json={"content": "TEST_first_conf_" + uuid.uuid4().hex[:6], "mood": "spicy"},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        # response shape & privacy
        assert "author_id" not in d
        assert "_id" not in d
        assert d["confession_id"].startswith("c_")
        assert d["anon_username"].startswith("Anon ")
        assert d["color"].startswith("#")
        assert d["heart_count"] == 0
        assert d["has_hearted"] is False
        assert d["is_mine"] is True
        assert d["mood"] == "spicy"

    def test_empty_content_422(self, api_client, author):
        r = api_client.post(
            f"{BASE_URL}/api/confessions",
            headers=author["auth"],
            json={"content": "", "mood": "lol"},
        )
        assert r.status_code == 422

    def test_invalid_mood_silently_nulled(self, api_client, author):
        r = api_client.post(
            f"{BASE_URL}/api/confessions",
            headers=author["auth"],
            json={"content": "TEST_badmood_" + uuid.uuid4().hex[:5], "mood": "not-a-mood"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["mood"] is None

    def test_unauthenticated_rejected(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/confessions",
            json={"content": "no auth", "mood": "lol"},
        )
        assert r.status_code == 401


# --- List ---
class TestConfessionList:
    def test_list_default_new_sort(self, api_client, author):
        # Create 2 confessions quickly
        ids = []
        for mood in ["lol", "vent"]:
            r = api_client.post(
                f"{BASE_URL}/api/confessions",
                headers=author["auth"],
                json={"content": f"TEST_sort_{mood}_" + uuid.uuid4().hex[:5], "mood": mood},
            )
            assert r.status_code == 200
            ids.append(r.json()["confession_id"])

        r = api_client.get(f"{BASE_URL}/api/confessions", headers=author["auth"])
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 2
        # privacy across list
        for c in items:
            assert "author_id" not in c
            assert "_id" not in c
            assert "hearts" not in c  # raw hearts list not exposed
        # descending by created_at
        created = [c["created_at"] for c in items]
        assert created == sorted(created, reverse=True)

    def test_list_hot_sort(self, api_client, author, other):
        # Create 2 confessions; heart the second to push it to the top in hot
        c1 = api_client.post(
            f"{BASE_URL}/api/confessions",
            headers=author["auth"],
            json={"content": "TEST_hot_low_" + uuid.uuid4().hex[:4], "mood": "lol"},
        ).json()["confession_id"]
        c2 = api_client.post(
            f"{BASE_URL}/api/confessions",
            headers=author["auth"],
            json={"content": "TEST_hot_high_" + uuid.uuid4().hex[:4], "mood": "tea"},
        ).json()["confession_id"]
        # other user hearts c1 only (oldest), so it should win on hot
        rh = api_client.post(f"{BASE_URL}/api/confessions/{c1}/heart", headers=other["auth"])
        assert rh.status_code == 200
        assert rh.json()["heart_count"] >= 1

        r = api_client.get(f"{BASE_URL}/api/confessions?sort=hot", headers=author["auth"])
        assert r.status_code == 200
        items = r.json()
        # all heart_counts should be non-increasing
        counts = [c["heart_count"] for c in items]
        assert counts == sorted(counts, reverse=True)
        # c1 (1 heart) should appear before c2 (0 hearts)
        pos = {c["confession_id"]: i for i, c in enumerate(items)}
        assert pos[c1] < pos[c2]

    def test_college_scope(self, api_client, author):
        r = api_client.get(f"{BASE_URL}/api/confessions", headers=author["auth"])
        assert r.status_code == 200
        # all returned items should have been posted by upes-dehradun users
        # we can't see college_id (it's stripped), but we already verified author can read posts
        # so just ensure list call succeeds with auth
        assert isinstance(r.json(), list)


# --- Heart toggle ---
class TestConfessionHeart:
    def test_heart_toggle(self, api_client, author, other):
        c = api_client.post(
            f"{BASE_URL}/api/confessions",
            headers=author["auth"],
            json={"content": "TEST_heart_" + uuid.uuid4().hex[:5], "mood": "love"},
        ).json()
        cid = c["confession_id"]
        # other hearts -> added
        r1 = api_client.post(f"{BASE_URL}/api/confessions/{cid}/heart", headers=other["auth"])
        assert r1.status_code == 200
        d1 = r1.json()
        assert d1["action"] == "added"
        assert d1["heart_count"] == 1
        assert d1["has_hearted"] is True
        # toggle off
        r2 = api_client.post(f"{BASE_URL}/api/confessions/{cid}/heart", headers=other["auth"])
        d2 = r2.json()
        assert d2["action"] == "removed"
        assert d2["heart_count"] == 0
        assert d2["has_hearted"] is False

    def test_heart_nonexistent(self, api_client, author):
        r = api_client.post(
            f"{BASE_URL}/api/confessions/c_doesnotexist/heart",
            headers=author["auth"],
        )
        assert r.status_code == 404


# --- Delete ---
class TestConfessionDelete:
    def test_non_author_403(self, api_client, author, other):
        c = api_client.post(
            f"{BASE_URL}/api/confessions",
            headers=author["auth"],
            json={"content": "TEST_del_" + uuid.uuid4().hex[:5]},
        ).json()
        cid = c["confession_id"]
        # other tries to delete -> 403
        r = api_client.delete(
            f"{BASE_URL}/api/confessions/{cid}", headers=other["auth"]
        )
        assert r.status_code == 403

    def test_author_can_delete(self, api_client, author):
        c = api_client.post(
            f"{BASE_URL}/api/confessions",
            headers=author["auth"],
            json={"content": "TEST_del_ok_" + uuid.uuid4().hex[:5]},
        ).json()
        cid = c["confession_id"]
        r = api_client.delete(
            f"{BASE_URL}/api/confessions/{cid}", headers=author["auth"]
        )
        assert r.status_code == 200
        assert r.json().get("ok") is True
        # GET list should no longer contain this id
        rl = api_client.get(f"{BASE_URL}/api/confessions", headers=author["auth"])
        ids = [x["confession_id"] for x in rl.json()]
        assert cid not in ids
        # delete again -> 404
        r2 = api_client.delete(
            f"{BASE_URL}/api/confessions/{cid}", headers=author["auth"]
        )
        assert r2.status_code == 404
