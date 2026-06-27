"""Campus Chat backend - anonymous college chat for UPES Dehradun students."""
import os
import uuid
import random
import logging
import asyncio
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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "campus-chat-dev-secret-change-me")
JWT_ALGO = "HS256"
JWT_TTL_DAYS = 30

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
    existing = await db.users.find_one({"email": req.email.lower()}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered. Please login.")
    user_id = f"u_{uuid.uuid4().hex[:12]}"
    anon = generate_anon_username()
    user = {
        "user_id": user_id,
        "email": req.email.lower(),
        "password_hash": hash_password(req.password),
        "college_id": req.college_id,
        "anon_username": anon,
        "profile_pic": None,
        "bio": "",
        "created_at": now_utc().isoformat(),
    }
    await db.users.insert_one(user)
    # auto-join lounge
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
    # seed UPES Lounge
    for c in COLLEGES:
        existing = await db.chats.find_one({"chat_id": c["lounge_id"]}, {"_id": 0})
        if not existing:
            await db.chats.insert_one(
                {
                    "chat_id": c["lounge_id"],
                    "type": "group",
                    "college_id": c["college_id"],
                    "title": f"{c['short']} Lounge",
                    "description": f"The official anonymous lounge for {c['name']} students.",
                    "cover": "https://images.unsplash.com/photo-1517256673644-36ad11246d21",
                    "created_at": now_utc().isoformat(),
                }
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
