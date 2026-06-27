"""Campus Chat backend - anonymous college chat for UPES Dehradun students."""
import os
import uuid
import random
import logging
import asyncio
import secrets as pysecrets
import urllib.parse
import urllib.request
import json as pyjson
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Set

import jwt
import bcrypt
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
import firebase_admin
from firebase_admin import credentials, firestore

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "campus-chat-dev-secret-change-me")
JWT_ALGO = "HS256"
JWT_TTL_DAYS = 30
SMTP_USER = os.environ.get("SMTP_USER", "")
RESEND_FROM = os.environ.get("RESEND_FROM", "Campus Chat <onboarding@resend.dev>")
OTP_TTL_MIN = 10
OTP_RESEND_COOLDOWN_SEC = 60
OTP_MAX_ATTEMPTS = 5

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Campus Chat API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("campus-chat")

# --- College config (seed) ---
COLLEGES = [
    {
        "college_id": "upes-dehradun",
        "name": "UPES Dehradun",
        "short": "UPES",
        "city": "Dehradun",
        "allowed_domains": ["upes.ac.in", "stu.upes.ac.in", "ddn.upes.ac.in"],
        "lounge_id": "group-upes-lounge",
    }
]

# --- Anonymous username generator ---
ADJECTIVES = ["Blue", "Red", "Golden", "Silver", "Mystic", "Wild", "Cosmic", "Swift", "Brave", "Lucky", "Neon", "Royal", "Sleepy", "Sunny", "Funky", "Chill", "Spicy", "Rusty", "Foggy", "Hyper"]
ANIMALS = ["Tiger", "Panda", "Falcon", "Otter", "Koala", "Fox", "Wolf", "Owl", "Lynx", "Shark", "Bear", "Hawk", "Yeti", "Phoenix", "Dragon", "Llama", "Moose", "Raccoon", "Penguin", "Sloth"]


def generate_anon_username() -> str:
    return f"{random.choice(ADJECTIVES)}{random.choice(ANIMALS)}{random.randint(10, 99)}"


# --- Models ---
class SignupReq(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    college_id: str
    otp: str = Field(min_length=6, max_length=6)


class RequestOtpReq(BaseModel):
    email: EmailStr
    college_id: str


class LoginReq(BaseModel):
    email: EmailStr
    password: str


class ProfileUpdateReq(BaseModel):
    anon_username: Optional[str] = None
    profile_pic: Optional[str] = None  # base64
    bio: Optional[str] = None


class FriendRequestReq(BaseModel):
    target_user_id: str


class FriendRespondReq(BaseModel):
    request_id: str
    action: str  # accept | reject


class DMCreateReq(BaseModel):
    target_user_id: str


class SendMessageReq(BaseModel):
    content: str


class ConfessionCreateReq(BaseModel):
    content: str = Field(min_length=1, max_length=600)
    mood: Optional[str] = None  # e.g. "spicy", "lol", "vent", "love"


CONFESSION_MOODS = ["lol", "spicy", "vent", "love", "wholesome", "tea"]


# --- Helpers ---
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(p: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def make_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": int(now_utc().timestamp()),
        "exp": int((now_utc() + timedelta(days=JWT_TTL_DAYS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        return payload.get("sub")
    except Exception:
        return None


async def get_current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing auth token")
    token = authorization.split(" ", 1)[1].strip()
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def email_domain(email: str) -> str:
    return email.lower().split("@")[-1] if "@" in email else ""


def find_college(college_id: str) -> Optional[dict]:
    for c in COLLEGES:
        if c["college_id"] == college_id:
            return c
    return None


def dm_chat_id(a: str, b: str) -> str:
    return "dm-" + "-".join(sorted([a, b]))


# --- WebSocket manager ---
class WSManager:
    def __init__(self) -> None:
        self.connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, user_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self.connections.setdefault(user_id, set()).add(ws)

    def disconnect(self, user_id: str, ws: WebSocket) -> None:
        if user_id in self.connections:
            self.connections[user_id].discard(ws)
            if not self.connections[user_id]:
                self.connections.pop(user_id, None)

    async def send_to_users(self, user_ids: List[str], payload: dict) -> None:
        for uid in set(user_ids):
            for ws in list(self.connections.get(uid, [])):
                try:
                    await ws.send_json(payload)
                except Exception:
                    pass


ws_manager = WSManager()


# --- Resend email helper ---
# --- Gmail SMTP email helper ---
def send_email_resend(to_email: str, subject: str, html: str, text: str) -> bool:
    try:
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = os.environ.get("SMTP_USER")
        msg["To"] = to_email
        msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(os.environ.get("SMTP_USER"), os.environ.get("SMTP_PASS"))
            server.sendmail(os.environ.get("SMTP_USER"), to_email, msg.as_string())
        return True
    except Exception as e:
        logger.error(f"SMTP send failed for {to_email}: {e}")
        return False
    """Send an email via Resend HTTP API. Returns True on success, False otherwise.
    If SMTP_USER is not configured, logs the message and returns False so callers
    can fall back to dev mode (returning the OTP in the response)."""
    if not SMTP_USER:
        logger.warning(f"[DEV] No SMTP_USER set. Would have sent to {to_email}: {subject}")
        return False
    body = pyjson.dumps(
        {"from": RESEND_FROM, "to": [to_email], "subject": subject, "html": html, "text": text}
    ).encode("utf-8")
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=body,
        headers={
            "Authorization": f"Bearer {SMTP_USER}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        # Run blocking call off the event loop
        loop = asyncio.get_event_loop()
        def _do():
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status
        # Synchronous fallback (call directly; small payload, fast)
        with urllib.request.urlopen(req, timeout=10) as resp:
            return 200 <= resp.status < 300
    except Exception as e:
        logger.error(f"Resend send failed for {to_email}: {e}")
        return False


def build_otp_email(otp: str) -> tuple[str, str]:
    html = f"""
    <div style=\"font-family:-apple-system,system-ui,sans-serif;max-width:520px;margin:auto;padding:32px 24px;background:#0E0F12;color:#F5F4EE;border-radius:16px\">
      <div style=\"font-size:14px;letter-spacing:2px;color:#C084FC;font-weight:800\">CAMPUS CHAT</div>
      <h1 style=\"font-size:24px;margin:8px 0 16px\">Verify your campus email</h1>
      <p style=\"color:#9C9A92;line-height:1.5;font-size:14px\">Use the code below to finish creating your anonymous Campus Chat account. It expires in {OTP_TTL_MIN} minutes.</p>
      <div style=\"font-size:38px;font-weight:800;letter-spacing:10px;background:#171A20;border:2px solid #C084FC;border-radius:12px;padding:18px;text-align:center;margin:24px 0;color:#F5F4EE\">{otp}</div>
      <p style=\"color:#9C9A92;font-size:12px\">If you didn't request this, you can ignore this email.</p>
    </div>
    """
    text = (
        f"Campus Chat verification code: {otp}\n\n"
        f"This code expires in {OTP_TTL_MIN} minutes. If you didn't request it, ignore this email."
    )
    return html, text


# --- Routes ---
@api.get("/")
async def root():
    return {"ok": True, "app": "Campus Chat"}


@api.get("/colleges")
async def list_colleges():
    return [
        {
            "college_id": c["college_id"],
            "name": c["name"],
            "short": c["short"],
            "city": c["city"],
            "allowed_domains": c["allowed_domains"],
        }
        for c in COLLEGES
    ]


@api.post("/auth/request-otp")
async def request_otp(req: RequestOtpReq):
    college = find_college(req.college_id)
    if not college:
        raise HTTPException(status_code=400, detail="Invalid college")
    domain = email_domain(req.email)
    if domain not in college["allowed_domains"]:
        raise HTTPException(
            status_code=400,
            detail=f"Email must end with one of: {', '.join('@'+d for d in college['allowed_domains'])}",
        )
    email = req.email.lower()
    if await db.users.find_one({"email": email}, {"_id": 0}):
        raise HTTPException(status_code=400, detail="Email already registered. Please login.")
    existing = await db.email_otps.find_one({"email": email}, {"_id": 0})
    now = now_utc()
    if existing and existing.get("last_sent_at"):
        last = datetime.fromisoformat(existing["last_sent_at"])
        elapsed = (now - last).total_seconds()
        if elapsed < OTP_RESEND_COOLDOWN_SEC:
            wait = int(OTP_RESEND_COOLDOWN_SEC - elapsed)
            raise HTTPException(status_code=429, detail=f"Please wait {wait}s before requesting another code.")
    otp = f"{pysecrets.randbelow(1000000):06d}"
    doc = {
        "email": email,
        "otp_hash": hash_password(otp),
        "attempts": 0,
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(minutes=OTP_TTL_MIN)).isoformat(),
        "last_sent_at": now.isoformat(),
    }
    await db.email_otps.update_one({"email": email}, {"$set": doc}, upsert=True)
    html, text = build_otp_email(otp)
    sent = send_email_resend(email, "Your Campus Chat verification code", html, text)
    resp: dict = {"ok": True, "cooldown_seconds": OTP_RESEND_COOLDOWN_SEC, "ttl_minutes": OTP_TTL_MIN, "email_sent": sent}
    if not sent:
        resp["dev_otp"] = otp
        resp["dev_note"] = "Email provider not configured; using dev OTP."
    return resp


@api.post("/auth/signup")
async def signup(req: SignupReq):
    college = find_college(req.college_id)
    if not college:
        raise HTTPException(status_code=400, detail="Invalid college")
    domain = email_domain(req.email)
    if domain not in college["allowed_domains"]:
        raise HTTPException(
            status_code=400,
            detail=f"Email must end with one of: {', '.join('@'+d for d in college['allowed_domains'])}",
        )
    email = req.email.lower()
    if await db.users.find_one({"email": email}, {"_id": 0}):
        raise HTTPException(status_code=400, detail="Email already registered. Please login.")
    otp_doc = await db.email_otps.find_one({"email": email}, {"_id": 0})
    if not otp_doc:
        raise HTTPException(status_code=400, detail="Please request an OTP first.")
    if datetime.fromisoformat(otp_doc["expires_at"]) < now_utc():
        await db.email_otps.delete_one({"email": email})
        raise HTTPException(status_code=400, detail="OTP expired. Request a new one.")
    if otp_doc.get("attempts", 0) >= OTP_MAX_ATTEMPTS:
        await db.email_otps.delete_one({"email": email})
        raise HTTPException(status_code=400, detail="Too many wrong attempts. Request a new code.")
    if not verify_password(req.otp, otp_doc["otp_hash"]):
        await db.email_otps.update_one({"email": email}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Wrong OTP. Try again.")
    await db.email_otps.delete_one({"email": email})
    user_id = f"u_{uuid.uuid4().hex[:12]}"
    anon = generate_anon_username()
    user = {
        "user_id": user_id,
        "email": email,
        "password_hash": hash_password(req.password),
        "college_id": req.college_id,
        "anon_username": anon,
        "profile_pic": None,
        "bio": "",
        "created_at": now_utc().isoformat(),
    }
    await db.users.insert_one(user)
    await db.chat_members.update_one(
        {"chat_id": college["lounge_id"], "user_id": user_id},
        {"$set": {"chat_id": college["lounge_id"], "user_id": user_id, "joined_at": now_utc().isoformat()}},
        upsert=True,
    )
    token = make_token(user_id)
    safe = {k: v for k, v in user.items() if k not in ("password_hash", "_id")}
    return {"token": token, "user": safe}


@api.post("/auth/login")
async def login(req: LoginReq):
    user = await db.users.find_one({"email": req.email.lower()})
    if not user or not verify_password(req.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = make_token(user["user_id"])
    user.pop("_id", None)
    user.pop("password_hash", None)
    return {"token": token, "user": user}


@api.get("/auth/me")
async def me(current=Depends(get_current_user)):
    return current


@api.patch("/profile")
async def update_profile(req: ProfileUpdateReq, current=Depends(get_current_user)):
    updates = {k: v for k, v in req.dict().items() if v is not None}
    if updates:
        await db.users.update_one({"user_id": current["user_id"]}, {"$set": updates})
    updated = await db.users.find_one({"user_id": current["user_id"]}, {"_id": 0, "password_hash": 0})
    return updated


@api.get("/profile/randomize")
async def randomize_username(current=Depends(get_current_user)):
    return {"anon_username": generate_anon_username()}


@api.get("/users/search")
async def search_users(q: str = "", current=Depends(get_current_user)):
    """Search users in same college (excluding self)."""
    query: dict = {"college_id": current["college_id"], "user_id": {"$ne": current["user_id"]}}
    if q:
        query["anon_username"] = {"$regex": q, "$options": "i"}
    users = await db.users.find(query, {"_id": 0, "password_hash": 0, "email": 0}).limit(50).to_list(50)
    # mark friendship status
    my_id = current["user_id"]
    fs = await db.friendships.find(
        {"$or": [{"requester_id": my_id}, {"recipient_id": my_id}]}, {"_id": 0}
    ).to_list(500)
    status_map = {}
    for f in fs:
        other = f["recipient_id"] if f["requester_id"] == my_id else f["requester_id"]
        status_map[other] = {"status": f["status"], "direction": "out" if f["requester_id"] == my_id else "in", "request_id": f["request_id"]}
    for u in users:
        u["friendship"] = status_map.get(u["user_id"])
    return users


# --- Friends ---
@api.post("/friends/request")
async def send_friend_request(req: FriendRequestReq, current=Depends(get_current_user)):
    if req.target_user_id == current["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot friend yourself")
    target = await db.users.find_one({"user_id": req.target_user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    a, b = current["user_id"], req.target_user_id
    existing = await db.friendships.find_one(
        {
            "$or": [
                {"requester_id": a, "recipient_id": b},
                {"requester_id": b, "recipient_id": a},
            ]
        },
        {"_id": 0},
    )
    if existing:
        raise HTTPException(status_code=400, detail=f"Request already exists ({existing['status']})")
    request_id = f"fr_{uuid.uuid4().hex[:12]}"
    doc = {
        "request_id": request_id,
        "requester_id": a,
        "recipient_id": b,
        "status": "pending",
        "created_at": now_utc().isoformat(),
    }
    await db.friendships.insert_one(doc)
    await ws_manager.send_to_users([b], {"type": "friend_request", "from": current["anon_username"]})
    return {"request_id": request_id, "status": "pending"}


@api.post("/friends/respond")
async def respond_friend(req: FriendRespondReq, current=Depends(get_current_user)):
    fr = await db.friendships.find_one({"request_id": req.request_id}, {"_id": 0})
    if not fr or fr["recipient_id"] != current["user_id"]:
        raise HTTPException(status_code=404, detail="Request not found")
    if fr["status"] != "pending":
        raise HTTPException(status_code=400, detail="Already handled")
    new_status = "accepted" if req.action == "accept" else "rejected"
    await db.friendships.update_one(
        {"request_id": req.request_id},
        {"$set": {"status": new_status, "updated_at": now_utc().isoformat()}},
    )
    await ws_manager.send_to_users(
        [fr["requester_id"]],
        {"type": "friend_response", "status": new_status, "from": current["anon_username"]},
    )
    return {"status": new_status}


@api.get("/friends")
async def list_friends(current=Depends(get_current_user)):
    my_id = current["user_id"]
    fs = await db.friendships.find(
        {"status": "accepted", "$or": [{"requester_id": my_id}, {"recipient_id": my_id}]},
        {"_id": 0},
    ).to_list(500)
    other_ids = [f["recipient_id"] if f["requester_id"] == my_id else f["requester_id"] for f in fs]
    users = await db.users.find(
        {"user_id": {"$in": other_ids}}, {"_id": 0, "password_hash": 0, "email": 0}
    ).to_list(500)
    return users


@api.get("/friends/requests")
async def list_requests(current=Depends(get_current_user)):
    """Incoming pending friend requests."""
    fs = await db.friendships.find(
        {"recipient_id": current["user_id"], "status": "pending"}, {"_id": 0}
    ).to_list(200)
    requester_ids = [f["requester_id"] for f in fs]
    users = await db.users.find(
        {"user_id": {"$in": requester_ids}}, {"_id": 0, "password_hash": 0, "email": 0}
    ).to_list(200)
    user_map = {u["user_id"]: u for u in users}
    return [
        {
            "request_id": f["request_id"],
            "created_at": f["created_at"],
            "from": user_map.get(f["requester_id"]),
        }
        for f in fs
        if f["requester_id"] in user_map
    ]


# --- Chats & Messages ---
@api.get("/chats")
async def list_chats(current=Depends(get_current_user)):
    """List groups (joined) + DM chats (with friends or anyone messaged)."""
    my_id = current["user_id"]
    memberships = await db.chat_members.find({"user_id": my_id}, {"_id": 0}).to_list(500)
    chat_ids = [m["chat_id"] for m in memberships]
    chats = await db.chats.find({"chat_id": {"$in": chat_ids}}, {"_id": 0}).to_list(500)

    result = []
    for c in chats:
        last = await db.messages.find_one(
            {"chat_id": c["chat_id"]}, {"_id": 0}, sort=[("created_at", -1)]
        )
        meta = {"chat_id": c["chat_id"], "type": c["type"], "last_message": last}
        if c["type"] == "group":
            meta["title"] = c.get("title", "Group")
            meta["cover"] = c.get("cover")
            members_count = await db.chat_members.count_documents({"chat_id": c["chat_id"]})
            meta["members_count"] = members_count
        else:
            # DM - resolve the other user
            mems = await db.chat_members.find({"chat_id": c["chat_id"]}, {"_id": 0}).to_list(10)
            other = next((m for m in mems if m["user_id"] != my_id), None)
            if other:
                other_user = await db.users.find_one(
                    {"user_id": other["user_id"]}, {"_id": 0, "password_hash": 0, "email": 0}
                )
                if other_user:
                    meta["title"] = other_user["anon_username"]
                    meta["profile_pic"] = other_user.get("profile_pic")
                    meta["other_user_id"] = other_user["user_id"]
        result.append(meta)
    # sort by last message time desc
    result.sort(key=lambda x: (x.get("last_message") or {}).get("created_at", ""), reverse=True)
    return result


@api.post("/chats/dm")
async def create_dm(req: DMCreateReq, current=Depends(get_current_user)):
    target = await db.users.find_one({"user_id": req.target_user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    chat_id = dm_chat_id(current["user_id"], req.target_user_id)
    existing = await db.chats.find_one({"chat_id": chat_id}, {"_id": 0})
    if not existing:
        await db.chats.insert_one(
            {"chat_id": chat_id, "type": "dm", "created_at": now_utc().isoformat()}
        )
        for uid in [current["user_id"], req.target_user_id]:
            await db.chat_members.update_one(
                {"chat_id": chat_id, "user_id": uid},
                {"$set": {"chat_id": chat_id, "user_id": uid, "joined_at": now_utc().isoformat()}},
                upsert=True,
            )
    return {"chat_id": chat_id, "type": "dm", "other_user_id": req.target_user_id, "title": target["anon_username"]}


@api.get("/chats/{chat_id}/messages")
async def get_messages(chat_id: str, current=Depends(get_current_user)):
    membership = await db.chat_members.find_one({"chat_id": chat_id, "user_id": current["user_id"]}, {"_id": 0})
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this chat")
    msgs = await db.messages.find({"chat_id": chat_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    # enrich sender info
    sender_ids = list({m["sender_id"] for m in msgs})
    users = await db.users.find(
        {"user_id": {"$in": sender_ids}}, {"_id": 0, "password_hash": 0, "email": 0}
    ).to_list(500)
    umap = {u["user_id"]: {"anon_username": u["anon_username"], "profile_pic": u.get("profile_pic")} for u in users}
    for m in msgs:
        m["sender"] = umap.get(m["sender_id"])
    return msgs


@api.post("/chats/{chat_id}/messages")
async def send_message(chat_id: str, req: SendMessageReq, current=Depends(get_current_user)):
    membership = await db.chat_members.find_one({"chat_id": chat_id, "user_id": current["user_id"]}, {"_id": 0})
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this chat")
    content = req.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Empty message")
    msg = {
        "message_id": f"m_{uuid.uuid4().hex[:14]}",
        "chat_id": chat_id,
        "sender_id": current["user_id"],
        "content": content,
        "created_at": now_utc().isoformat(),
    }
    await db.messages.insert_one(dict(msg))
    msg.pop("_id", None)
    msg["sender"] = {"anon_username": current["anon_username"], "profile_pic": current.get("profile_pic")}
    # broadcast to chat members
    members = await db.chat_members.find({"chat_id": chat_id}, {"_id": 0}).to_list(2000)
    member_ids = [m["user_id"] for m in members]
    await ws_manager.send_to_users(member_ids, {"type": "message", "chat_id": chat_id, "message": msg})
    return msg


@api.get("/groups")
async def list_groups(current=Depends(get_current_user)):
    """List groups available to user's college."""
    groups = await db.chats.find(
        {"type": "group", "college_id": current["college_id"]}, {"_id": 0}
    ).to_list(100)
    for g in groups:
        g["members_count"] = await db.chat_members.count_documents({"chat_id": g["chat_id"]})
        g["joined"] = bool(
            await db.chat_members.find_one({"chat_id": g["chat_id"], "user_id": current["user_id"]})
        )
    return groups


@api.post("/groups/{chat_id}/join")
async def join_group(chat_id: str, current=Depends(get_current_user)):
    group = await db.chats.find_one({"chat_id": chat_id, "type": "group"}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if group.get("college_id") and group["college_id"] != current["college_id"]:
        raise HTTPException(status_code=403, detail="This group is for another college")
    await db.chat_members.update_one(
        {"chat_id": chat_id, "user_id": current["user_id"]},
        {"$set": {"chat_id": chat_id, "user_id": current["user_id"], "joined_at": now_utc().isoformat()}},
        upsert=True,
    )
    return {"ok": True}


# --- Confessions wall ---
CONFESSION_COLORS = ["#FFC13B", "#4ECDC4", "#FF6B6B", "#A06CD5", "#56D6CD", "#F7A072"]
CONFESSION_MASKS = [
    "Anon Falcon", "Anon Otter", "Anon Comet", "Anon Moose", "Anon Yeti",
    "Anon Phoenix", "Anon Llama", "Anon Sparrow", "Anon Koala", "Anon Whale",
    "Anon Mango", "Anon Cactus", "Anon Pebble", "Anon Glitter", "Anon Cloud",
]


def _serialize_confession(c: dict, my_id: str) -> dict:
    hearts = c.get("hearts", []) or []
    return {
        "confession_id": c["confession_id"],
        "content": c["content"],
        "mood": c.get("mood"),
        "anon_username": c.get("anon_username"),
        "color": c.get("color"),
        "heart_count": len(hearts),
        "has_hearted": my_id in hearts,
        "is_mine": c.get("author_id") == my_id,
        "created_at": c["created_at"],
    }


@api.post("/confessions")
async def post_confession(req: ConfessionCreateReq, current=Depends(get_current_user)):
    mood = (req.mood or "").lower().strip() or None
    if mood and mood not in CONFESSION_MOODS:
        mood = None
    confession_id = f"c_{uuid.uuid4().hex[:14]}"
    doc = {
        "confession_id": confession_id,
        "college_id": current["college_id"],
        "author_id": current["user_id"],
        "anon_username": random.choice(CONFESSION_MASKS),
        "color": random.choice(CONFESSION_COLORS),
        "content": req.content.strip(),
        "mood": mood,
        "hearts": [],
        "created_at": now_utc().isoformat(),
    }
    await db.confessions.insert_one(dict(doc))
    return _serialize_confession(doc, current["user_id"])


@api.get("/confessions")
async def list_confessions(sort: str = "new", current=Depends(get_current_user)):
    query = {"college_id": current["college_id"]}
    items = await db.confessions.find(query, {"_id": 0}).limit(200).to_list(200)
    if sort == "hot":
        items.sort(key=lambda c: (len(c.get("hearts", []) or []), c["created_at"]), reverse=True)
    else:
        items.sort(key=lambda c: c["created_at"], reverse=True)
    return [_serialize_confession(c, current["user_id"]) for c in items]


@api.post("/confessions/{confession_id}/heart")
async def heart_confession(confession_id: str, current=Depends(get_current_user)):
    c = await db.confessions.find_one(
        {"confession_id": confession_id, "college_id": current["college_id"]}, {"_id": 0}
    )
    if not c:
        raise HTTPException(status_code=404, detail="Confession not found")
    hearts = set(c.get("hearts", []) or [])
    if current["user_id"] in hearts:
        hearts.discard(current["user_id"])
        action = "removed"
    else:
        hearts.add(current["user_id"])
        action = "added"
    await db.confessions.update_one(
        {"confession_id": confession_id}, {"$set": {"hearts": list(hearts)}}
    )
    return {"action": action, "heart_count": len(hearts), "has_hearted": action == "added"}


@api.delete("/confessions/{confession_id}")
async def delete_confession(confession_id: str, current=Depends(get_current_user)):
    c = await db.confessions.find_one({"confession_id": confession_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    if c.get("author_id") != current["user_id"]:
        raise HTTPException(status_code=403, detail="Only the author can delete this")
    await db.confessions.delete_one({"confession_id": confession_id})
    return {"ok": True}


# --- WebSocket endpoint ---
@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket, token: str):
    user_id = decode_token(token)
    if not user_id:
        await websocket.close(code=1008)
        return
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        await websocket.close(code=1008)
        return
    await ws_manager.connect(user_id, websocket)
    try:
        await websocket.send_json({"type": "ready", "user_id": user_id})
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        ws_manager.disconnect(user_id, websocket)
    except Exception as e:
        logger.warning(f"ws error: {e}")
        ws_manager.disconnect(user_id, websocket)


# --- Startup seed ---
@app.on_event("startup")
async def startup():
    # indexes
    await db.users.create_index("user_id", unique=True)
    await db.users.create_index("email", unique=True)
    await db.friendships.create_index("request_id", unique=True)
    await db.chat_members.create_index([("chat_id", 1), ("user_id", 1)], unique=True)
    await db.messages.create_index([("chat_id", 1), ("created_at", 1)])
    await db.chats.create_index("chat_id", unique=True)
    await db.confessions.create_index("confession_id", unique=True)
    await db.confessions.create_index([("college_id", 1), ("created_at", -1)])
    await db.email_otps.create_index("email", unique=True)
    # seed UPES Lounge (idempotent rename: ensure title is short college code, e.g. "UPES")
    for c in COLLEGES:
        await db.chats.update_one(
            {"chat_id": c["lounge_id"]},
            {
                "$set": {
                    "chat_id": c["lounge_id"],
                    "type": "group",
                    "college_id": c["college_id"],
                    "title": c["short"],
                    "description": f"The official anonymous space for {c['name']} students.",
                    "cover": "https://customer-assets.emergentagent.com/job_college-hub-chat/artifacts/yeya0mm6_IMG_1965.jpg",
                },
                "$setOnInsert": {"created_at": now_utc().isoformat()},
            },
            upsert=True,
        )
    logger.info("Campus Chat backend ready.")


@app.on_event("shutdown")
async def shutdown():
    client.close()


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
