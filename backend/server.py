from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import io
import logging
import random
import uuid
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

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ---------------- Event configuration ----------------
TICKET_PRICE = 50000
HOLD_MINUTES = 15  # unpaid orders auto-release seats after this
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


class AdminLogin(BaseModel):
    password: str


class SetActiveSession(BaseModel):
    session_id: int


def now_iso():
    return datetime.now(timezone.utc).isoformat()


async def get_config():
    cfg = await db.config.find_one({"_id": "config"})
    if not cfg:
        cfg = {"_id": "config", "active_session": 1}
        await db.config.insert_one(cfg)
    return cfg


async def taken_seats(session_id: int):
    """Return set of seat labels currently occupied for a session.
    Auto-releases (marks expired) unpaid orders older than HOLD_MINUTES."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=HOLD_MINUTES)
    taken = set()
    cursor = db.orders.find({"session_id": session_id, "status": {"$ne": "rejected"}})
    async for o in cursor:
        status = o.get("status")
        if status == "expired":
            continue
        if status == "pending_payment":
            created = datetime.fromisoformat(o["created_at"])
            if created < cutoff:
                await db.orders.update_one({"id": o["id"]}, {"$set": {"status": "expired"}})
                continue
        taken.update(o.get("seats", []))
    return taken


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
    """Advance active session pointer automatically when the current one is full."""
    cfg = await get_config()
    active = cfg["active_session"]
    for s in SESSIONS:
        if s["id"] < active:
            continue
        taken = await taken_seats(s["id"])
        if len(taken) >= SEATS_PER_SESSION:
            active = s["id"] + 1
        else:
            break
    if active > len(SESSIONS):
        active = len(SESSIONS)
    if active != cfg["active_session"]:
        await db.config.update_one({"_id": "config"}, {"$set": {"active_session": active}})
    return active


async def gen_unique_total(base: int):
    existing = set()
    async for o in db.orders.find({"status": {"$ne": "rejected"}}, {"total_amount": 1}):
        if o.get("total_amount"):
            existing.add(o["total_amount"])
    for pool in (list(range(11, 100)), list(range(100, 1000))):
        random.shuffle(pool)
        for c in pool:
            if base + c not in existing:
                return c, base + c
    raise HTTPException(status_code=409, detail="Tidak dapat membuat kode unik, coba lagi.")


def clean(o):
    o.pop("_id", None)
    return o


def require_admin(x_admin_token: Optional[str] = Header(None)):
    if x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Tidak diizinkan")
    return True


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

    seat_map = build_seat_map(await taken_seats(payload.session_id))
    status_by_label = {s["label"]: s["status"] for row in seat_map for s in row["seats"]}
    for seat in payload.seats:
        st = status_by_label.get(seat)
        if st is None:
            raise HTTPException(status_code=400, detail=f"Kursi {seat} tidak valid")
        if st == "booked":
            raise HTTPException(status_code=409, detail=f"Kursi {seat} sudah dipesan orang lain")

    qty = len(payload.seats)
    base = qty * TICKET_PRICE
    code, total = await gen_unique_total(base)

    order = {
        "id": str(uuid.uuid4()),
        "name": payload.name.strip(),
        "phone": payload.phone.strip(),
        "session_id": payload.session_id,
        "seats": payload.seats,
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
    docs = await db.orders.find({"status": {"$ne": "rejected"}}).sort("created_at", -1).to_list(3000)
    result = []
    for o in docs:
        if o["phone"].replace(" ", "").replace("-", "") != p:
            continue
        # lazily expire unpaid too-old orders for accurate status
        session = next((s for s in SESSIONS if s["id"] == o["session_id"]), None)
        result.append({
            "id": o["id"], "name": o["name"], "phone": o["phone"],
            "session": session, "seats": o["seats"], "qty": o["qty"],
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
    # lazily expire if unpaid and too old
    if o.get("status") == "pending_payment":
        created = datetime.fromisoformat(o["created_at"])
        if created < datetime.now(timezone.utc) - timedelta(minutes=HOLD_MINUTES):
            await db.orders.update_one({"id": order_id}, {"$set": {"status": "expired"}})
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
    if payload.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Password salah")
    return {"token": ADMIN_TOKEN}


@api_router.get("/admin/orders")
async def admin_orders(_: bool = Depends(require_admin), status: Optional[str] = None):
    query = {}
    if status:
        query["status"] = status
    orders = await db.orders.find(query).sort("created_at", -1).to_list(2000)
    result = []
    for o in orders:
        session = next((s for s in SESSIONS if s["id"] == o["session_id"]), None)
        o = clean(o)
        o["session"] = session
        result.append(o)
    return result


@api_router.get("/admin/stats")
async def admin_stats(_: bool = Depends(require_admin)):
    orders = await db.orders.find({}).to_list(5000)
    stats = {"total_orders": 0, "waiting_verification": 0, "verified": 0, "pending_payment": 0,
             "rejected": 0, "expired": 0, "revenue_verified": 0, "tickets_verified": 0}
    for o in orders:
        stats["total_orders"] += 1
        st = o.get("status", "")
        if st in stats:
            stats[st] += 1
        if st == "verified":
            stats["revenue_verified"] += o.get("base_amount", 0)
            stats["tickets_verified"] += o.get("qty", 0)
    return stats


@api_router.post("/admin/orders/{order_id}/verify")
async def verify_order(order_id: str, _: bool = Depends(require_admin)):
    r = await db.orders.update_one({"id": order_id}, {"$set": {"status": "verified", "updated_at": now_iso()}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Pesanan tidak ditemukan")
    return clean(await db.orders.find_one({"id": order_id}))


@api_router.post("/admin/orders/{order_id}/reject")
async def reject_order(order_id: str, _: bool = Depends(require_admin)):
    r = await db.orders.update_one({"id": order_id}, {"$set": {"status": "rejected", "updated_at": now_iso()}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Pesanan tidak ditemukan")
    return clean(await db.orders.find_one({"id": order_id}))


@api_router.post("/admin/orders/{order_id}/checkin")
async def checkin_order(order_id: str, _: bool = Depends(require_admin)):
    r = await db.orders.update_one(
        {"id": order_id},
        {"$set": {"checked_in": True, "checked_in_at": now_iso(), "updated_at": now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Pesanan tidak ditemukan")
    return clean(await db.orders.find_one({"id": order_id}))


@api_router.post("/admin/active-session")
async def set_active_session(payload: SetActiveSession, _: bool = Depends(require_admin)):
    if payload.session_id not in [s["id"] for s in SESSIONS]:
        raise HTTPException(status_code=400, detail="Sesi tidak valid")
    await db.config.update_one({"_id": "config"}, {"$set": {"active_session": payload.session_id}}, upsert=True)
    return {"active_session": payload.session_id}


@api_router.get("/admin/export")
async def export_orders(_: bool = Depends(require_admin)):
    status_label = {
        "pending_payment": "Belum Bayar",
        "waiting_verification": "Perlu Verifikasi",
        "verified": "Terverifikasi",
        "rejected": "Ditolak",
        "expired": "Kadaluarsa",
    }
    orders = await db.orders.find({}).sort([("session_id", 1), ("created_at", 1)]).to_list(5000)
    wb = Workbook()
    ws = wb.active
    ws.title = "Peserta"
    headers = ["No", "Kode Pesanan", "Nama", "No HP", "Sesi", "Jam", "Kursi",
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
    widths = [5, 12, 24, 16, 10, 12, 18, 9, 14, 9, 10, 16, 11, 18, 18]
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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
