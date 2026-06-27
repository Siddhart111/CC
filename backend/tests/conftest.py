"""Shared pytest fixtures for Campus Chat backend tests."""
import os
import uuid
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

# Load frontend .env for EXPO_PUBLIC_BACKEND_URL
load_dotenv(Path("/app/frontend/.env"))

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
).rstrip("/")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _signup(client, email: str, password: str = "test1234", college_id: str = "upes-dehradun"):
    r = client.post(
        f"{BASE_URL}/api/auth/signup",
        json={"email": email, "password": password, "college_id": college_id},
        timeout=15,
    )
    return r


@pytest.fixture(scope="session")
def user_a():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    email = f"TEST_usera_{uuid.uuid4().hex[:8]}@upes.ac.in"
    r = _signup(s, email)
    assert r.status_code == 200, f"Signup A failed: {r.status_code} {r.text}"
    data = r.json()
    return {
        "session": s,
        "email": email,
        "password": "test1234",
        "token": data["token"],
        "user": data["user"],
        "auth": {"Authorization": f"Bearer {data['token']}"},
    }


@pytest.fixture(scope="session")
def user_b():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    email = f"TEST_userb_{uuid.uuid4().hex[:8]}@stu.upes.ac.in"
    r = _signup(s, email)
    assert r.status_code == 200, f"Signup B failed: {r.status_code} {r.text}"
    data = r.json()
    return {
        "session": s,
        "email": email,
        "password": "test1234",
        "token": data["token"],
        "user": data["user"],
        "auth": {"Authorization": f"Bearer {data['token']}"},
    }
