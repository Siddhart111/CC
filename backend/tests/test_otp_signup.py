"""Tests for the OTP-gated signup flow (request-otp + signup)."""
import os
import time
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

COLLEGE = "upes-dehradun"


def _fresh_email(prefix: str = "otp") -> str:
    return f"TEST_{prefix}_{uuid.uuid4().hex[:10]}@upes.ac.in"


def _client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --- request-otp ---
class TestRequestOtp:
    def test_request_otp_valid_returns_dev_otp(self):
        s = _client()
        email = _fresh_email("valid")
        r = s.post(f"{BASE_URL}/api/auth/request-otp",
                   json={"email": email, "college_id": COLLEGE}, timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["ok"] is True
        assert b["cooldown_seconds"] == 60
        assert b["ttl_minutes"] == 10
        assert b["email_sent"] is False  # RESEND_API_KEY empty
        assert "dev_otp" in b and len(b["dev_otp"]) == 6 and b["dev_otp"].isdigit()

    def test_request_otp_rejects_non_upes_domain(self):
        s = _client()
        r = s.post(f"{BASE_URL}/api/auth/request-otp",
                   json={"email": f"TEST_x_{uuid.uuid4().hex[:6]}@gmail.com", "college_id": COLLEGE},
                   timeout=15)
        assert r.status_code == 400
        assert "upes" in r.json()["detail"].lower()

    def test_request_otp_cooldown_429(self):
        s = _client()
        email = _fresh_email("cool")
        r1 = s.post(f"{BASE_URL}/api/auth/request-otp",
                    json={"email": email, "college_id": COLLEGE}, timeout=15)
        assert r1.status_code == 200
        r2 = s.post(f"{BASE_URL}/api/auth/request-otp",
                    json={"email": email, "college_id": COLLEGE}, timeout=15)
        assert r2.status_code == 429
        assert "wait" in r2.json()["detail"].lower()

    def test_request_otp_already_registered_email(self):
        # Create a user first
        s = _client()
        email = _fresh_email("dup")
        r = s.post(f"{BASE_URL}/api/auth/request-otp",
                   json={"email": email, "college_id": COLLEGE}, timeout=15)
        assert r.status_code == 200
        otp = r.json()["dev_otp"]
        r2 = s.post(f"{BASE_URL}/api/auth/signup",
                    json={"email": email, "password": "test1234",
                          "college_id": COLLEGE, "otp": otp}, timeout=15)
        assert r2.status_code == 200, r2.text
        # Now requesting another OTP should 400
        r3 = s.post(f"{BASE_URL}/api/auth/request-otp",
                    json={"email": email, "college_id": COLLEGE}, timeout=15)
        assert r3.status_code == 400
        assert "registered" in r3.json()["detail"].lower()


# --- signup ---
class TestSignupOtp:
    def test_signup_without_otp_request_400(self):
        s = _client()
        email = _fresh_email("noreq")
        r = s.post(f"{BASE_URL}/api/auth/signup",
                   json={"email": email, "password": "test1234",
                         "college_id": COLLEGE, "otp": "123456"}, timeout=15)
        assert r.status_code == 400
        assert "request an otp" in r.json()["detail"].lower()

    def test_signup_wrong_otp_400(self):
        s = _client()
        email = _fresh_email("wrong")
        ro = s.post(f"{BASE_URL}/api/auth/request-otp",
                    json={"email": email, "college_id": COLLEGE}, timeout=15)
        assert ro.status_code == 200
        correct = ro.json()["dev_otp"]
        bad = "000000" if correct != "000000" else "111111"
        r = s.post(f"{BASE_URL}/api/auth/signup",
                   json={"email": email, "password": "test1234",
                         "college_id": COLLEGE, "otp": bad}, timeout=15)
        assert r.status_code == 400
        assert "wrong otp" in r.json()["detail"].lower()

    def test_signup_correct_otp_returns_token_and_auto_joins_lounge(self):
        s = _client()
        email = _fresh_email("good")
        ro = s.post(f"{BASE_URL}/api/auth/request-otp",
                    json={"email": email, "college_id": COLLEGE}, timeout=15)
        otp = ro.json()["dev_otp"]
        r = s.post(f"{BASE_URL}/api/auth/signup",
                   json={"email": email, "password": "test1234",
                         "college_id": COLLEGE, "otp": otp}, timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        assert "token" in b and b["token"]
        assert b["user"]["email"] == email.lower()
        assert b["user"]["college_id"] == COLLEGE
        assert "password_hash" not in b["user"] and "_id" not in b["user"]
        # auto-join UPES lounge: check chats list contains group-upes-lounge
        h = {"Authorization": f"Bearer {b['token']}"}
        chats = s.get(f"{BASE_URL}/api/chats", headers=h, timeout=15).json()
        assert any(c.get("chat_id") == "group-upes-lounge" for c in chats), chats

        # OTP doc deleted: a second signup attempt should 400 (email already registered)
        r2 = s.post(f"{BASE_URL}/api/auth/signup",
                    json={"email": email, "password": "test1234",
                          "college_id": COLLEGE, "otp": otp}, timeout=15)
        assert r2.status_code == 400

    def test_signup_5_wrong_then_6th_too_many(self):
        s = _client()
        email = _fresh_email("toomany")
        ro = s.post(f"{BASE_URL}/api/auth/request-otp",
                    json={"email": email, "college_id": COLLEGE}, timeout=15)
        correct = ro.json()["dev_otp"]
        bad = "000000" if correct != "000000" else "111111"
        # 5 wrong attempts → each returns "Wrong OTP"
        for i in range(5):
            r = s.post(f"{BASE_URL}/api/auth/signup",
                       json={"email": email, "password": "test1234",
                             "college_id": COLLEGE, "otp": bad}, timeout=15)
            assert r.status_code == 400
            assert "wrong otp" in r.json()["detail"].lower(), f"attempt {i+1}: {r.text}"
        # 6th: too many attempts message, OTP doc deleted
        r6 = s.post(f"{BASE_URL}/api/auth/signup",
                    json={"email": email, "password": "test1234",
                          "college_id": COLLEGE, "otp": bad}, timeout=15)
        assert r6.status_code == 400
        assert "too many" in r6.json()["detail"].lower()
        # Now even correct OTP should fail with "Please request an OTP first."
        r7 = s.post(f"{BASE_URL}/api/auth/signup",
                    json={"email": email, "password": "test1234",
                          "college_id": COLLEGE, "otp": correct}, timeout=15)
        assert r7.status_code == 400
        assert "request an otp" in r7.json()["detail"].lower()

    def test_signup_non_upes_domain_rejected_even_with_otp_shape(self):
        s = _client()
        # Domain rejected at signup before OTP lookup
        r = s.post(f"{BASE_URL}/api/auth/signup",
                   json={"email": f"TEST_evil_{uuid.uuid4().hex[:6]}@gmail.com",
                         "password": "test1234", "college_id": COLLEGE, "otp": "123456"},
                   timeout=15)
        assert r.status_code == 400
        assert "upes" in r.json()["detail"].lower()


# --- Pydantic validation ---
class TestPydanticValidation:
    def test_signup_empty_otp_422(self):
        s = _client()
        r = s.post(f"{BASE_URL}/api/auth/signup",
                   json={"email": _fresh_email("v1"), "password": "test1234",
                         "college_id": COLLEGE, "otp": ""}, timeout=15)
        assert r.status_code == 422

    def test_signup_5_char_otp_422(self):
        s = _client()
        r = s.post(f"{BASE_URL}/api/auth/signup",
                   json={"email": _fresh_email("v2"), "password": "test1234",
                         "college_id": COLLEGE, "otp": "12345"}, timeout=15)
        assert r.status_code == 422


# --- Login still works without OTP ---
class TestLoginUnchanged:
    def test_login_no_otp_required(self):
        s = _client()
        email = _fresh_email("login")
        ro = s.post(f"{BASE_URL}/api/auth/request-otp",
                    json={"email": email, "college_id": COLLEGE}, timeout=15)
        otp = ro.json()["dev_otp"]
        su = s.post(f"{BASE_URL}/api/auth/signup",
                    json={"email": email, "password": "test1234",
                          "college_id": COLLEGE, "otp": otp}, timeout=15)
        assert su.status_code == 200
        # Login without any otp field
        lo = s.post(f"{BASE_URL}/api/auth/login",
                    json={"email": email, "password": "test1234"}, timeout=15)
        assert lo.status_code == 200
        assert "token" in lo.json()
