from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError
import os
import io
import logging
import random
import uuid
import bcrypt
import jwt
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'admin123')
ADMIN_TOKEN = os.environ.get('ADMIN_TOKEN', 'mbi-nonton-2026-admin')
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGO = "HS256"
TOKEN_TTL_HOURS = 12
ROLE_LABELS = {"superadmin": "Super Admin", "admin": "Admin", "checkin": "Petugas Check-in"}

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ---------------- Event configuration ----------------
TICKET_PRICE = 50000
HOLD_MINUTES = 15  # unpaid orders auto-release seats after this
MAX_SEATS_PER_ORDER = 6  # batas kursi per pesanan
EVENT_TITLE = 'Nonton Bersama Film Dokumenter "Y.A. MNS. Ashin Jinarakkhita: Jejak Langkah Sang Pelopor di Nusantara"'
EVENT_DATE = "Minggu, 13 September 2026"
EVENT_LOCATION = "CGV Grand Batam"

SESSIONS = [
    {"id": 1, "name": "Sesi 1", "time": "13:00 WIB"},
    {"id": 2, "name": "Sesi 2", "time": "15:00 WIB"},
    {"id": 3, "name": "Sesi 3", "time": "17:00 WIB"},
    {"id": 4, "name": "Sesi 4", "time": "19:00 WIB"},
]

SEAT_ROWS = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K"]
SEATS_PER_ROW = 10
SEATS_PER_SESSION = len(SEAT_ROWS) * SEATS_PER_ROW  # 100
ALL_SEAT_LABELS = {f"{r}{i}" for r in SEAT_ROWS for i in range(1, SEATS_PER_ROW + 1)}

TRANSFER_INFO = {
    "bank": "BCA",
    "account_number": "061 518 3381",
    "account_name": "PD Majelis Buddhayana Indonesia Prov Kepri",
    "short_name": "PD MBI Kepri",
}


# ---------------- Models ----------------
class OrderCreate(BaseModel):
    name: str
    phone: str
    session_id: int
    seats: List[str]
    payment_method: Literal["qris", "transfer"]


class ProofUpload(BaseModel):
    proof_image: str  # base64 data URL


class WalkinCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    session_id: int
    seats: List[str]
    payment_method: Literal["cash", "qris", "transfer"]


class AdminLogin(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str
    password: str
    name: Optional[str] = ""
    role: Literal["superadmin", "admin", "checkin"] = "checkin"


class SetActiveSession(BaseModel):
    session_id: int


class BulkAction(BaseModel):
    ids: List[str]
    action: Literal["verify", "reject"]


def now_iso():
    return datetime.now(timezone.utc).isoformat()


async def get_config():
    cfg = await db.config.find_one({"_id": "config"})
    if not cfg:
        cfg = {"_id": "config", "active_session": 1}
        await db.config.insert_one(cfg)
    return cfg


async def taken_seats(session_id: int):
    """Occupied seats for a session, sourced from atomic seat_locks.
    Expired locks (unpaid > HOLD_MINUTES) are auto-released and their orders marked expired."""
    now = datetime.now(timezone.utc)
    expired = await db.seat_locks.find(
        {"session_id": session_id, "expires_at": {"$ne": None, "$lt": now}}, {"order_id": 1}
    ).to_list(2000)
    if expired:
        order_ids = list({e["order_id"] for e in expired})
        await db.seat_locks.delete_many(
            {"session_id": session_id, "expires_at": {"$ne": None, "$lt": now}}
        )
        await db.orders.update_many(
            {"id": {"$in": order_ids}, "status": "pending_payment"},
            {"$set": {"status": "expired"}},
        )
    locks = await db.seat_locks.find({"session_id": session_id}, {"seat": 1}).to_list(2000)
    return set(l["seat"] for l in locks)


def build_seat_map(taken: set):
    """Pilihan kursi bebas: semua kursi yang belum dipesan bisa dipilih."""
    rows = []
    for r in SEAT_ROWS:
        seats = []
        for i in range(1, SEATS_PER_ROW + 1):
            l = f"{r}{i}"
            seats.append({"label": l, "status": "booked" if l in taken else "available"})
        rows.append({"row": r, "unlocked": True, "seats": seats})
    return rows


async def session_status(session_id: int, active_session: int):
    taken = await taken_seats(session_id)
    is_full = len(taken) >= SEATS_PER_SESSION
    if session_id < active_session:
        status = "closed"
    elif session_id == active_session:
        status = "full" if is_full else "open"
    else:
        status = "locked"
    return status, len(taken)


async def resolve_active_session():
    """Active session = the first (lowest id) session that still has free seats.
    Fills Sesi 1 first, then 2, etc. — no reliance on a stale/manual pointer."""
    active = None
    for s in SESSIONS:
        taken = await taken_seats(s["id"])
        if len(taken) < SEATS_PER_SESSION:
            active = s["id"]
            break
    if active is None:
        active = len(SESSIONS)
    cfg = await get_config()
    if active != cfg.get("active_session"):
        await db.config.update_one({"_id": "config"}, {"$set": {"active_session": active}}, upsert=True)
    return active


def mask_name(name: str) -> str:
    parts = (name or "").strip().split()
    out = []
    for w in parts:
        if len(w) <= 2:
            out.append(w[0] + "*")
        else:
            out.append(w[0] + "*" * max(1, len(w) - 2) + w[-1])
    return " ".join(out)



async def gen_order_no():
    for _ in range(80):
        n = random.randint(1000, 9999)
        exists = await db.orders.count_documents({"order_no": n}, limit=1)
        if not exists:
            return n
    # fallback: sequential above current max
    last = await db.orders.find({"order_no": {"$exists": True}}).sort("order_no", -1).limit(1).to_list(1)
    return (last[0]["order_no"] + 1) if last else 1000


async def gen_unique_total(base: int):
    for pool in (list(range(11, 100)), list(range(100, 1000))):
        random.shuffle(pool)
        for c in pool:
            exists = await db.orders.count_documents(
                {"total_amount": base + c, "status": {"$ne": "rejected"}}, limit=1
            )
            if not exists:
                return c, base + c
    raise HTTPException(status_code=409, detail="Tidak dapat membuat kode unik, coba lagi.")


def clean(o):
    o.pop("_id", None)
    return o


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_token(user: dict) -> str:
    payload = {
        "sub": user["id"],
        "username": user["username"],
        "role": user["role"],
        "name": user.get("name", ""),
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_TTL_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def public_user(u: dict) -> dict:
    return {"id": u["id"], "username": u["username"], "name": u.get("name", ""),
            "role": u["role"], "role_label": ROLE_LABELS.get(u["role"], u["role"]),
            "created_at": u.get("created_at")}


async def log_activity(actor: dict, action: str, detail: str, target_id: str = None):
    await db.activity_logs.insert_one({
        "id": str(uuid.uuid4()),
        "actor_id": actor.get("id"),
        "actor_username": actor.get("username"),
        "actor_name": actor.get("name", ""),
        "action": action,
        "detail": detail,
        "target_id": target_id,
        "created_at": now_iso(),
    })


async def get_current_user(x_admin_token: Optional[str] = Header(None)):
    if not x_admin_token:
        raise HTTPException(status_code=401, detail="Tidak diizinkan")
    try:
        payload = jwt.decode(x_admin_token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sesi berakhir, silakan login ulang")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Tidak diizinkan")
    u = await db.admin_users.find_one({"id": payload.get("sub")})
    if not u:
        raise HTTPException(status_code=401, detail="Akun tidak ditemukan")
    return {"id": u["id"], "username": u["username"], "name": u.get("name", ""), "role": u["role"]}


def require_roles(*roles):
    async def dep(user: dict = Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Akses tidak diizinkan untuk peran Anda")
        return user
    return dep


require_any = get_current_user
require_staff = require_roles("superadmin", "admin")
require_super = require_roles("superadmin")


# ---------------- Public endpoints ----------------
@api_router.get("/")
async def root():
    return {"message": "Nonton Bareng MBI API"}


@api_router.get("/event")
async def event_info():
    active = await resolve_active_session()
    sessions = []
    for s in SESSIONS:
        status, count = await session_status(s["id"], active)
        sessions.append({**s, "status": status, "booked": count, "capacity": SEATS_PER_SESSION})
    return {
        "title": EVENT_TITLE,
        "date": EVENT_DATE,
        "location": EVENT_LOCATION,
        "ticket_price": TICKET_PRICE,
        "hold_minutes": HOLD_MINUTES,
        "active_session": active,
        "sessions": sessions,
        "transfer": TRANSFER_INFO,
    }


@api_router.get("/sessions/{session_id}/seats")
async def get_seats(session_id: int):
    if session_id not in [s["id"] for s in SESSIONS]:
        raise HTTPException(status_code=404, detail="Sesi tidak ditemukan")
    active = await resolve_active_session()
    status, count = await session_status(session_id, active)
    taken = await taken_seats(session_id)
    return {
        "session_id": session_id,
        "status": status,
        "rows": build_seat_map(taken),
        "booked": count,
        "capacity": SEATS_PER_SESSION,
    }


@api_router.post("/orders")
async def create_order(payload: OrderCreate):
    if not payload.name.strip() or not payload.phone.strip():
        raise HTTPException(status_code=400, detail="Nama dan nomor HP wajib diisi")
    if not payload.seats:
        raise HTTPException(status_code=400, detail="Pilih minimal 1 kursi")

    active = await resolve_active_session()
    if payload.session_id != active:
        raise HTTPException(status_code=400, detail="Sesi ini belum/tidak dibuka untuk pemesanan")

    seats = list(dict.fromkeys(payload.seats))  # dedupe, keep order
    for seat in seats:
        if seat not in ALL_SEAT_LABELS:
            raise HTTPException(status_code=400, detail=f"Kursi {seat} tidak valid")

    # Release any expired locks first so freed seats are claimable
    await taken_seats(payload.session_id)

    qty = len(seats)
    base = qty * TICKET_PRICE
    code, total = await gen_unique_total(base)
    order_no = await gen_order_no()
    order_id = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=HOLD_MINUTES)

    # Atomic seat claim: unique _id per (session, seat) prevents double booking
    claimed = []
    for seat in seats:
        try:
            await db.seat_locks.insert_one({
                "_id": f"{payload.session_id}:{seat}",
                "session_id": payload.session_id,
                "seat": seat,
                "order_id": order_id,
                "expires_at": expires_at,
            })
            claimed.append(seat)
        except DuplicateKeyError:
            if claimed:
                await db.seat_locks.delete_many(
                    {"_id": {"$in": [f"{payload.session_id}:{s}" for s in claimed]}}
                )
            raise HTTPException(status_code=409, detail=f"Kursi {seat} baru saja dipesan orang lain. Silakan pilih kursi lain.")

    order = {
        "id": order_id,
        "order_no": order_no,
        "name": payload.name.strip(),
        "phone": payload.phone.strip(),
        "session_id": payload.session_id,
        "seats": seats,
        "qty": qty,
        "unit_price": TICKET_PRICE,
        "base_amount": base,
        "unique_code": code,
        "total_amount": total,
        "payment_method": payload.payment_method,
        "status": "pending_payment",
        "proof_image": None,
        "checked_in": False,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.orders.insert_one(order)
    return clean(dict(order))


@api_router.get("/orders/lookup")
async def lookup_orders(phone: str):
    p = phone.strip().replace(" ", "").replace("-", "")
    if len(p) < 6:
        raise HTTPException(status_code=400, detail="Masukkan nomor HP yang valid")
    docs = await db.orders.find(
        {"status": {"$ne": "rejected"}}, {"proof_image": 0}
    ).sort("created_at", -1).to_list(3000)
    result = []
    for o in docs:
        if o["phone"].replace(" ", "").replace("-", "") != p:
            continue
        # lazily expire unpaid too-old orders for accurate status
        session = next((s for s in SESSIONS if s["id"] == o["session_id"]), None)
        result.append({
            "id": o["id"], "order_no": o.get("order_no"), "name": mask_name(o["name"]), "phone": o["phone"],
            "session": session, "qty": o["qty"],
            "total_amount": o["total_amount"], "unique_code": o["unique_code"],
            "payment_method": o["payment_method"], "status": o["status"],
            "has_proof": bool(o.get("proof_image")), "created_at": o["created_at"],
        })
    return {"orders": result, "transfer": TRANSFER_INFO}


@api_router.get("/orders/{order_id}")
async def get_order(order_id: str):
    o = await db.orders.find_one({"id": order_id})
    if not o:
        raise HTTPException(status_code=404, detail="Pesanan tidak ditemukan")
    # lazily expire if unpaid and too old (also releases its seat locks)
    if o.get("status") == "pending_payment":
        created = datetime.fromisoformat(o["created_at"])
        if created < datetime.now(timezone.utc) - timedelta(minutes=HOLD_MINUTES):
            await db.orders.update_one({"id": order_id}, {"$set": {"status": "expired"}})
            await db.seat_locks.delete_many({"order_id": order_id})
            o["status"] = "expired"
    session = next((s for s in SESSIONS if s["id"] == o["session_id"]), None)
    o = clean(o)
    o["session"] = session
    o["transfer"] = TRANSFER_INFO
    return o


@api_router.post("/orders/{order_id}/proof")
async def upload_proof(order_id: str, payload: ProofUpload):
    o = await db.orders.find_one({"id": order_id})
    if not o:
        raise HTTPException(status_code=404, detail="Pesanan tidak ditemukan")
    if not payload.proof_image.startswith("data:image"):
        raise HTTPException(status_code=400, detail="File bukti harus berupa gambar")
    # Re-assert/keep seat reservation (handles late upload after auto-expire)
    for seat in o.get("seats", []):
        lid = f"{o['session_id']}:{seat}"
        existing = await db.seat_locks.find_one({"_id": lid})
        if existing:
            if existing["order_id"] == order_id:
                await db.seat_locks.update_one({"_id": lid}, {"$set": {"expires_at": None}})
            else:
                raise HTTPException(status_code=409, detail=f"Maaf, kursi {seat} sudah diambil peserta lain karena pembayaran melewati batas waktu. Silakan hubungi panitia.")
        else:
            await db.seat_locks.insert_one({
                "_id": lid, "session_id": o["session_id"], "seat": seat,
                "order_id": order_id, "expires_at": None,
            })
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"proof_image": payload.proof_image, "status": "waiting_verification", "updated_at": now_iso()}},
    )
    o = await db.orders.find_one({"id": order_id})
    session = next((s for s in SESSIONS if s["id"] == o["session_id"]), None)
    o = clean(o)
    o["session"] = session
    o["transfer"] = TRANSFER_INFO
    return o


# ---------------- Admin endpoints ----------------
@api_router.post("/admin/login")
async def admin_login(payload: AdminLogin):
    uname = payload.username.strip().lower()
    u = await db.admin_users.find_one({"username": uname})
    if not u or not verify_password(payload.password, u["password_hash"]):
        raise HTTPException(status_code=401, detail="Username atau password salah")
    token = create_token(u)
    return {"token": token, "user": public_user(u)}


@api_router.get("/admin/me")
async def admin_me(user: dict = Depends(get_current_user)):
    u = await db.admin_users.find_one({"id": user["id"]})
    return public_user(u)


@api_router.get("/admin/orders")
async def admin_orders(user: dict = Depends(require_staff), status: Optional[str] = None):
    match = {}
    if status:
        match["status"] = status
    pipeline = []
    if match:
        pipeline.append({"$match": match})
    pipeline += [
        {"$addFields": {"has_proof": {"$and": [
            {"$ne": ["$proof_image", None]}, {"$ne": ["$proof_image", ""]},
        ]}}},
        {"$project": {"proof_image": 0}},
        {"$sort": {"created_at": -1}},
        {"$limit": 1000},
    ]
    orders = await db.orders.aggregate(pipeline).to_list(1000)
    result = []
    for o in orders:
        session = next((s for s in SESSIONS if s["id"] == o["session_id"]), None)
        o = clean(o)
        o["session"] = session
        result.append(o)
    return result


@api_router.get("/admin/orders/{order_id}/proof-image")
async def get_proof_image(order_id: str, user: dict = Depends(require_staff)):
    o = await db.orders.find_one({"id": order_id}, {"proof_image": 1})
    if not o or not o.get("proof_image"):
        raise HTTPException(status_code=404, detail="Bukti tidak ditemukan")
    return {"proof_image": o["proof_image"]}


@api_router.get("/admin/stats")
async def admin_stats(user: dict = Depends(require_staff)):
    pipeline = [{"$group": {
        "_id": "$status",
        "count": {"$sum": 1},
        "revenue": {"$sum": "$base_amount"},
        "tickets": {"$sum": "$qty"},
    }}]
    stats = {"total_orders": 0, "waiting_verification": 0, "verified": 0, "pending_payment": 0,
             "rejected": 0, "expired": 0, "revenue_verified": 0, "tickets_verified": 0}
    async for g in db.orders.aggregate(pipeline):
        st = g["_id"]
        stats["total_orders"] += g["count"]
        if st in stats:
            stats[st] += g["count"]
        if st == "verified":
            stats["revenue_verified"] += g.get("revenue", 0) or 0
            stats["tickets_verified"] += g.get("tickets", 0) or 0

    # Breakdown penjualan (hanya order terverifikasi): online vs walk-in per metode
    online = {"orders": 0, "tickets": 0, "revenue": 0}
    walkin = {"orders": 0, "tickets": 0, "revenue": 0,
              "cash": {"orders": 0, "tickets": 0, "revenue": 0},
              "qris": {"orders": 0, "tickets": 0, "revenue": 0},
              "transfer": {"orders": 0, "tickets": 0, "revenue": 0}}
    pipeline2 = [
        {"$match": {"status": "verified"}},
        {"$group": {
            "_id": {"walkin": {"$ifNull": ["$walkin", False]}, "method": "$payment_method"},
            "orders": {"$sum": 1},
            "tickets": {"$sum": "$qty"},
            "revenue": {"$sum": "$base_amount"},
        }},
    ]
    async for g in db.orders.aggregate(pipeline2):
        is_walkin = bool(g["_id"].get("walkin"))
        method = g["_id"].get("method") or "transfer"
        o, t, r = g.get("orders", 0), g.get("tickets", 0), g.get("revenue", 0) or 0
        target = walkin if is_walkin else online
        target["orders"] += o
        target["tickets"] += t
        target["revenue"] += r
        if is_walkin and method in walkin:
            walkin[method]["orders"] += o
            walkin[method]["tickets"] += t
            walkin[method]["revenue"] += r
    stats["breakdown"] = {"online": online, "walkin": walkin}
    stats["cash_total"] = walkin["cash"]["revenue"]
    return stats


@api_router.post("/admin/orders/{order_id}/verify")
async def verify_order(order_id: str, user: dict = Depends(require_staff)):
    o = await db.orders.find_one({"id": order_id})
    if not o:
        raise HTTPException(status_code=404, detail="Pesanan tidak ditemukan")
    await db.orders.update_one({"id": order_id}, {"$set": {"status": "verified", "updated_at": now_iso()}})
    await log_activity(user, "verify", f"Verifikasi pembayaran #{o.get('order_no')} — {o.get('name')}", order_id)
    return clean(await db.orders.find_one({"id": order_id}))


@api_router.post("/admin/orders/{order_id}/reject")
async def reject_order(order_id: str, user: dict = Depends(require_staff)):
    o = await db.orders.find_one({"id": order_id})
    if not o:
        raise HTTPException(status_code=404, detail="Pesanan tidak ditemukan")
    await db.orders.update_one({"id": order_id}, {"$set": {"status": "rejected", "updated_at": now_iso()}})
    await db.seat_locks.delete_many({"order_id": order_id})  # free the seats
    await log_activity(user, "reject", f"Tolak pesanan #{o.get('order_no')} — {o.get('name')}", order_id)
    return clean(await db.orders.find_one({"id": order_id}))


@api_router.delete("/admin/orders/{order_id}")
async def delete_order(order_id: str, user: dict = Depends(require_staff)):
    o = await db.orders.find_one({"id": order_id})
    if not o:
        raise HTTPException(status_code=404, detail="Pesanan tidak ditemukan")
    await db.orders.delete_one({"id": order_id})
    await db.seat_locks.delete_many({"order_id": order_id})  # free the seats
    await log_activity(user, "delete", f"Hapus permanen pesanan #{o.get('order_no')} — {o.get('name')} ({o.get('phone')})", order_id)
    return {"deleted": True, "id": order_id}


@api_router.post("/admin/orders/bulk")
async def bulk_action(payload: BulkAction, user: dict = Depends(require_staff)):
    if not payload.ids:
        raise HTTPException(status_code=400, detail="Tidak ada pesanan dipilih")
    if payload.action == "verify":
        await db.orders.update_many(
            {"id": {"$in": payload.ids}},
            {"$set": {"status": "verified", "updated_at": now_iso()}},
        )
    else:
        await db.orders.update_many(
            {"id": {"$in": payload.ids}},
            {"$set": {"status": "rejected", "updated_at": now_iso()}},
        )
        await db.seat_locks.delete_many({"order_id": {"$in": payload.ids}})
    act_label = "Verifikasi massal" if payload.action == "verify" else "Tolak massal"
    await log_activity(user, f"bulk_{payload.action}", f"{act_label} {len(payload.ids)} pesanan")
    return {"updated": len(payload.ids), "action": payload.action}


@api_router.post("/admin/orders/{order_id}/wa-sent")
async def mark_wa_sent(order_id: str, user: dict = Depends(require_staff)):
    r = await db.orders.update_one(
        {"id": order_id},
        {"$set": {"wa_sent": True, "wa_sent_at": now_iso(), "updated_at": now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Pesanan tidak ditemukan")
    return clean(await db.orders.find_one({"id": order_id}))


@api_router.post("/admin/orders/{order_id}/checkin")
async def checkin_order(order_id: str, user: dict = Depends(require_any)):
    o = await db.orders.find_one({"id": order_id})
    if not o:
        raise HTTPException(status_code=404, detail="Pesanan tidak ditemukan")
    already = o.get("checked_in", False)
    update = {"checked_in": True, "checked_in_at": now_iso(), "updated_at": now_iso()}
    if not already:
        update["checked_in_by"] = user.get("name") or user.get("username")
        update["checked_in_by_username"] = user.get("username")
    await db.orders.update_one({"id": order_id}, {"$set": update})
    if not already:
        await log_activity(user, "checkin", f"Check-in peserta #{o.get('order_no')} — {o.get('name')}", order_id)
    return clean(await db.orders.find_one({"id": order_id}))


@api_router.post("/admin/walkin")
async def walkin_order(payload: WalkinCreate, user: dict = Depends(require_staff)):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Nama wajib diisi")
    if payload.session_id not in [s["id"] for s in SESSIONS]:
        raise HTTPException(status_code=400, detail="Sesi tidak valid")
    seats = list(dict.fromkeys(payload.seats))  # dedupe, keep order
    if not seats:
        raise HTTPException(status_code=400, detail="Pilih minimal 1 kursi")
    for seat in seats:
        if seat not in ALL_SEAT_LABELS:
            raise HTTPException(status_code=400, detail=f"Kursi {seat} tidak valid")

    await taken_seats(payload.session_id)  # release expired locks first

    order_id = str(uuid.uuid4())
    claimed = []
    for seat in seats:
        try:
            await db.seat_locks.insert_one({
                "_id": f"{payload.session_id}:{seat}", "session_id": payload.session_id,
                "seat": seat, "order_id": order_id, "expires_at": None,
            })
            claimed.append(seat)
        except DuplicateKeyError:
            if claimed:
                await db.seat_locks.delete_many({"_id": {"$in": [f"{payload.session_id}:{s}" for s in claimed]}})
            raise HTTPException(status_code=409, detail=f"Kursi {seat} baru saja terisi. Pilih kursi lain.")

    qty = len(claimed)
    order_no = await gen_order_no()
    base = qty * TICKET_PRICE
    if payload.payment_method == "cash":
        code, total = 0, base
    else:
        code, total = await gen_unique_total(base)
    actor = user.get("name") or user.get("username")
    order = {
        "id": order_id, "order_no": order_no,
        "name": payload.name.strip(), "phone": (payload.phone or "").strip(),
        "session_id": payload.session_id, "seats": claimed, "qty": qty,
        "unit_price": TICKET_PRICE, "base_amount": base, "unique_code": code, "total_amount": total,
        "payment_method": payload.payment_method, "status": "verified",
        "proof_image": None, "checked_in": True, "checked_in_at": now_iso(),
        "checked_in_by": actor, "checked_in_by_username": user.get("username"),
        "walkin": True, "sold_by": actor,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.orders.insert_one(order)
    await log_activity(user, "walkin",
                       f"Walk-in {qty} tiket #{order_no} — {payload.name.strip()} ({payload.payment_method.upper()}), kursi {', '.join(claimed)}",
                       order_id)
    return clean(dict(order))



@api_router.post("/admin/active-session")
async def set_active_session(payload: SetActiveSession, user: dict = Depends(require_staff)):
    if payload.session_id not in [s["id"] for s in SESSIONS]:
        raise HTTPException(status_code=400, detail="Sesi tidak valid")
    await db.config.update_one({"_id": "config"}, {"$set": {"active_session": payload.session_id}}, upsert=True)
    return {"active_session": payload.session_id}


@api_router.get("/admin/participants")
async def list_participants(user: dict = Depends(require_any)):
    docs = await db.orders.find({"status": "verified"}, {"proof_image": 0}).sort("created_at", -1).to_list(3000)
    result = []
    for o in docs:
        session = next((s for s in SESSIONS if s["id"] == o["session_id"]), None)
        result.append({
            "id": o["id"], "order_no": o.get("order_no"), "name": o["name"], "phone": o["phone"],
            "session": session, "seats": o["seats"], "qty": o["qty"],
            "checked_in": o.get("checked_in", False), "checked_in_at": o.get("checked_in_at"),
            "checked_in_by": o.get("checked_in_by"),
        })
    return result


@api_router.get("/admin/export")
async def export_orders(_: bool = Depends(require_staff)):
    status_label = {
        "pending_payment": "Belum Bayar",
        "waiting_verification": "Perlu Verifikasi",
        "verified": "Terverifikasi",
        "rejected": "Ditolak",
        "expired": "Kadaluarsa",
    }
    orders = await db.orders.find({}, {"proof_image": 0}).sort([("session_id", 1), ("created_at", 1)]).to_list(5000)
    wb = Workbook()
    ws = wb.active
    ws.title = "Peserta"
    headers = ["No", "No. Order", "Kode Pesanan", "Nama", "No HP", "Sesi", "Jam", "Kursi",
               "Jml Tiket", "Nominal (Rp)", "Kode Unik", "Metode", "Status", "Sudah Hadir", "Waktu Check-in", "Waktu Pesan"]
    ws.append(headers)
    header_fill = PatternFill("solid", fgColor="1E3A5F")
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")
    for i, o in enumerate(orders, 1):
        session = next((s for s in SESSIONS if s["id"] == o["session_id"]), None)
        created = o.get("created_at", "")
        try:
            dt = datetime.fromisoformat(created)
            created_str = dt.strftime("%d/%m/%Y %H:%M")
        except Exception:
            created_str = created
        checkin_str = ""
        if o.get("checked_in_at"):
            try:
                checkin_str = datetime.fromisoformat(o["checked_in_at"]).strftime("%d/%m/%Y %H:%M")
            except Exception:
                checkin_str = o["checked_in_at"]
        ws.append([
            i,
            o.get("order_no", ""),
            o["id"][:8].upper(),
            o["name"],
            o["phone"],
            session["name"] if session else o["session_id"],
            session["time"] if session else "",
            ", ".join(o.get("seats", [])),
            o.get("qty", 0),
            o.get("total_amount", 0),
            o.get("unique_code", ""),
            "QRIS" if o.get("payment_method") == "qris" else "Transfer",
            status_label.get(o.get("status"), o.get("status")),
            "Ya" if o.get("checked_in") else "Belum",
            checkin_str,
            created_str,
        ])
    widths = [5, 9, 12, 24, 16, 10, 12, 18, 9, 14, 9, 10, 16, 11, 18, 18]
    for idx, w in enumerate(widths, 1):
        ws.column_dimensions[ws.cell(row=1, column=idx).column_letter].width = w
    ws.freeze_panes = "A2"
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname = f"peserta_nonton_mbi_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M')}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )


# ---------------- User management (superadmin) ----------------
@api_router.get("/admin/users")
async def list_users(user: dict = Depends(require_super)):
    docs = await db.admin_users.find({}).sort("created_at", 1).to_list(200)
    return [public_user(u) for u in docs]


@api_router.post("/admin/users")
async def create_user(payload: UserCreate, user: dict = Depends(require_super)):
    uname = payload.username.strip().lower()
    if len(uname) < 3:
        raise HTTPException(status_code=400, detail="Username minimal 3 karakter")
    if len(payload.password) < 4:
        raise HTTPException(status_code=400, detail="Password minimal 4 karakter")
    if await db.admin_users.find_one({"username": uname}):
        raise HTTPException(status_code=409, detail="Username sudah dipakai")
    doc = {
        "id": str(uuid.uuid4()),
        "username": uname,
        "name": payload.name or uname,
        "role": payload.role,
        "password_hash": hash_password(payload.password),
        "created_at": now_iso(),
    }
    await db.admin_users.insert_one(doc)
    await log_activity(user, "user_create", f"Buat user '{uname}' ({ROLE_LABELS.get(payload.role, payload.role)})", doc["id"])
    return public_user(doc)


@api_router.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(require_super)):
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Tidak bisa menghapus akun sendiri")
    target = await db.admin_users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    if target["role"] == "superadmin":
        supers = await db.admin_users.count_documents({"role": "superadmin"})
        if supers <= 1:
            raise HTTPException(status_code=400, detail="Minimal harus ada 1 Super Admin")
    await db.admin_users.delete_one({"id": user_id})
    await log_activity(user, "user_delete", f"Hapus user '{target['username']}'", user_id)
    return {"deleted": True, "id": user_id}


# ---------------- Activity logs (staff) ----------------
@api_router.get("/admin/logs")
async def list_logs(user: dict = Depends(require_staff), limit: int = 300):
    docs = await db.activity_logs.find({}).sort("created_at", -1).to_list(min(limit, 1000))
    return [clean(d) for d in docs]


ACTION_LABEL_ID = {
    "delete": "Hapus Order",
    "verify": "Verifikasi",
    "reject": "Tolak",
    "bulk_verify": "Verifikasi Massal",
    "bulk_reject": "Tolak Massal",
    "checkin": "Check-in",
    "user_create": "Buat User",
    "user_delete": "Hapus User",
    "walkin": "Walk-in (Jual di Tempat)",
}


@api_router.get("/admin/logs/export")
async def export_logs(_: bool = Depends(require_staff)):
    docs = await db.activity_logs.find({}).sort("created_at", -1).to_list(5000)
    wb = Workbook()
    ws = wb.active
    ws.title = "Log Aktivitas"
    headers = ["No", "Waktu (WIB)", "Petugas", "Username", "Aksi", "Detail"]
    ws.append(headers)
    header_fill = PatternFill("solid", fgColor="1E3A5F")
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")
    for i, l in enumerate(docs, 1):
        waktu = l.get("created_at", "")
        try:
            dt = datetime.fromisoformat(waktu).astimezone(timezone(timedelta(hours=7)))
            waktu = dt.strftime("%d/%m/%Y %H:%M")
        except Exception:
            pass
        ws.append([
            i, waktu,
            l.get("actor_name") or l.get("actor_username", ""),
            l.get("actor_username", ""),
            ACTION_LABEL_ID.get(l.get("action"), l.get("action", "")),
            l.get("detail", ""),
        ])
    for idx, w in enumerate([5, 18, 20, 16, 16, 55], 1):
        ws.column_dimensions[ws.cell(row=1, column=idx).column_letter].width = w
    ws.freeze_panes = "A2"
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname = f"log_aktivitas_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M')}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )




app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def seed_admin_users():
    """Create default admin users on first run + unique index."""
    try:
        await db.admin_users.create_index("username", unique=True)
        count = await db.admin_users.count_documents({})
        if count == 0:
            default_pw = os.environ.get("ADMIN_PASSWORD", "admin123")
            defaults = [
                ("admin1", "Admin 1", "superadmin"),
                ("admin2", "Admin 2", "admin"),
                ("admin3", "Petugas Check-in", "checkin"),
            ]
            for uname, name, role in defaults:
                await db.admin_users.insert_one({
                    "id": str(uuid.uuid4()),
                    "username": uname,
                    "name": name,
                    "role": role,
                    "password_hash": hash_password(default_pw),
                    "created_at": now_iso(),
                })
            logger.info("default admin_users seeded")
    except Exception as e:
        logger.error(f"seed admin_users error: {e}")


@app.on_event("startup")
async def backfill_seat_locks():
    """Ensure seat_locks exist for active (non-rejected/expired) orders.
    Runs on every startup and is idempotent (unique _id per session:seat)."""
    try:
        active_statuses = ["pending_payment", "waiting_verification", "verified"]
        async for o in db.orders.find({"status": {"$in": active_statuses}}):
            exp = None
            if o["status"] == "pending_payment":
                try:
                    exp = datetime.fromisoformat(o["created_at"]) + timedelta(minutes=HOLD_MINUTES)
                except Exception:
                    exp = None
            for seat in o.get("seats", []):
                try:
                    await db.seat_locks.insert_one({
                        "_id": f"{o['session_id']}:{seat}",
                        "session_id": o["session_id"],
                        "seat": seat,
                        "order_id": o["id"],
                        "expires_at": exp,
                    })
                except DuplicateKeyError:
                    pass
        logger.info("seat_locks backfill complete")
    except Exception as e:
        logger.error(f"seat_locks backfill error: {e}")
    # assign 4-digit order_no to any order missing it
    try:
        async for o in db.orders.find({"order_no": {"$exists": False}}):
            await db.orders.update_one({"id": o["id"]}, {"$set": {"order_no": await gen_order_no()}})
        logger.info("order_no backfill complete")
    except Exception as e:
        logger.error(f"order_no backfill error: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
