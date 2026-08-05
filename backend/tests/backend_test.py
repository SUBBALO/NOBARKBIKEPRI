"""Backend API tests for Nonton Bareng MBI ticketing app (iteration 2).

Iteration 2 changes:
- Row locking removed: all seats appear as 'available' or 'booked' only.
- POST /api/orders/{id}/proof must include 'session' and 'transfer' in response.
- TRANSFER_INFO.short_name == 'PD MBI Kepri'.
- Admin check-in endpoint POST /api/admin/orders/{id}/checkin sets checked_in=true.
"""
import os
import base64
import uuid as _uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    from pathlib import Path
    envp = Path("/app/frontend/.env")
    for ln in envp.read_text().splitlines():
        if ln.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = ln.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"
ADMIN_PASSWORD = "admin123"


# ---------------- Fixtures ----------------
@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def admin_headers(s):
    r = s.post(f"{API}/admin/login", json={"password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return {"X-Admin-Token": r.json()["token"], "Content-Type": "application/json"}


def _pick_available(s, session_id=1, count=1, prefer_row=None):
    r = s.get(f"{API}/sessions/{session_id}/seats").json()
    if prefer_row:
        row = next((row for row in r["rows"] if row["row"] == prefer_row), None)
        if row:
            avail = [x["label"] for x in row["seats"] if x["status"] == "available"]
            if len(avail) >= count:
                return avail[:count]
    # fallback: any row
    avail = [x["label"] for row in r["rows"] for x in row["seats"] if x["status"] == "available"]
    return avail[:count]


# ---------------- Admin login / auth ----------------
def test_admin_login_wrong(s):
    r = s.post(f"{API}/admin/login", json={"password": "wrong"})
    assert r.status_code == 401


def test_admin_login_right(s):
    r = s.post(f"{API}/admin/login", json={"password": ADMIN_PASSWORD})
    assert r.status_code == 200
    assert "token" in r.json()


def test_admin_protected_requires_header(s):
    r = s.get(f"{API}/admin/orders")
    assert r.status_code == 401


def test_reset_active_to_1(s, admin_headers):
    r = requests.post(f"{API}/admin/active-session", json={"session_id": 1}, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["active_session"] == 1


# ---------------- Event ----------------
def test_event(s):
    r = s.get(f"{API}/event")
    assert r.status_code == 200
    d = r.json()
    assert d["ticket_price"] == 50000
    assert len(d["sessions"]) == 4
    assert d["transfer"]["bank"] == "BCA"
    assert d["transfer"]["short_name"] == "PD MBI Kepri"
    assert d["date"] == "Minggu, 13 September 2026"


# ---------------- Seats (no locking) ----------------
def test_seats_no_locked_status(s):
    """Regression: seats should only be 'available' or 'booked' (no 'locked')."""
    r = s.get(f"{API}/sessions/1/seats")
    assert r.status_code == 200
    d = r.json()
    for row in d["rows"]:
        assert row["unlocked"] is True, f"row {row['row']} not unlocked"
        for st in row["seats"]:
            assert st["status"] in ("available", "booked"), f"unexpected status {st['status']} for {st['label']}"


def test_seats_invalid_session(s):
    r = s.get(f"{API}/sessions/99/seats")
    assert r.status_code == 404


# ---------------- Booking non-front-row seat directly (iteration 2 new) ----------------
_uniq = _uuid.uuid4().hex[:4]


def test_can_book_non_front_row_seat_directly(s):
    """B5 (a non-front-row seat) must be bookable without row A being full."""
    # ensure B5 is available
    r = s.get(f"{API}/sessions/1/seats").json()
    rowB = next(row for row in r["rows"] if row["row"] == "B")
    b5 = next((x for x in rowB["seats"] if x["label"] == "B5"), None)
    assert b5 is not None
    if b5["status"] == "booked":
        pytest.skip("B5 already booked from previous run")
    payload = {
        "name": f"TEST_B5_{_uniq}",
        "phone": "081234500005",
        "session_id": 1,
        "seats": ["B5"],
        "payment_method": "qris",
    }
    r = s.post(f"{API}/orders", json=payload)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["seats"] == ["B5"]
    assert d["status"] == "pending_payment"


@pytest.fixture(scope="module")
def created_order(s):
    seats = _pick_available(s, count=2, prefer_row="A")
    assert len(seats) == 2, f"need 2 avail seats, got {seats}"
    payload = {
        "name": f"TEST_User_{_uniq}",
        "phone": "081234567890",
        "session_id": 1,
        "seats": seats,
        "payment_method": "qris",
    }
    r = s.post(f"{API}/orders", json=payload)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["base_amount"] == 100000
    assert 11 <= d["unique_code"] <= 999
    assert d["total_amount"] == 100000 + d["unique_code"]
    assert d["seats"] == seats
    return d


def test_order_created(created_order):
    assert "id" in created_order


def test_locked_session_cannot_book(s):
    # session 2 is locked when active=1
    seat = _pick_available(s, count=1)
    assert seat, "no available seats to attempt"
    r = s.post(f"{API}/orders", json={
        "name": "TEST_lock", "phone": "0812", "session_id": 2,
        "seats": seat, "payment_method": "qris"
    })
    assert r.status_code == 400


def test_double_booking_returns_409(s, created_order):
    seat = created_order["seats"][0]
    r = s.post(f"{API}/orders", json={
        "name": "TEST_dup", "phone": "0812", "session_id": 1,
        "seats": [seat], "payment_method": "qris"
    })
    assert r.status_code == 409


# ---------------- Get order + proof upload ----------------
def test_get_order(s, created_order):
    r = s.get(f"{API}/orders/{created_order['id']}")
    assert r.status_code == 200
    d = r.json()
    assert d["session"]["id"] == 1
    assert d["transfer"]["bank"] == "BCA"
    assert d["transfer"]["short_name"] == "PD MBI Kepri"


def test_upload_proof_response_has_session_and_transfer(s, created_order):
    """Iteration 2 fix: upload_proof must attach session + transfer."""
    tiny_png = base64.b64encode(bytes.fromhex(
        "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C63000100000500010D0A2DB40000000049454E44AE426082"
    )).decode()
    payload = {"proof_image": f"data:image/png;base64,{tiny_png}"}
    r = s.post(f"{API}/orders/{created_order['id']}/proof", json=payload)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "waiting_verification"
    assert "session" in d, "response missing 'session' key"
    assert d["session"] is not None and d["session"]["id"] == 1
    assert "transfer" in d, "response missing 'transfer' key"
    assert d["transfer"]["bank"] == "BCA"
    assert d["transfer"]["short_name"] == "PD MBI Kepri"


def test_upload_proof_non_image_400(s, created_order):
    r = s.post(f"{API}/orders/{created_order['id']}/proof", json={"proof_image": "not-an-image"})
    assert r.status_code == 400


# ---------------- Admin flows ----------------
def test_admin_orders_lists(admin_headers, created_order):
    r = requests.get(f"{API}/admin/orders", headers=admin_headers)
    assert r.status_code == 200
    ids = [o["id"] for o in r.json()]
    assert created_order["id"] in ids


def test_admin_stats(admin_headers):
    r = requests.get(f"{API}/admin/stats", headers=admin_headers)
    assert r.status_code == 200
    d = r.json()
    assert d["total_orders"] >= 1
    assert "waiting_verification" in d


def test_admin_verify(admin_headers, created_order):
    r = requests.post(f"{API}/admin/orders/{created_order['id']}/verify", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "verified"


def test_admin_checkin_sets_checked_in(admin_headers, created_order):
    """Iteration 2: checkin endpoint sets checked_in=true, requires X-Admin-Token."""
    # missing header -> 401
    r_no = requests.post(f"{API}/admin/orders/{created_order['id']}/checkin")
    assert r_no.status_code == 401
    # with header
    r = requests.post(f"{API}/admin/orders/{created_order['id']}/checkin", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["checked_in"] is True


def test_admin_reject_frees_seat(s, admin_headers):
    seat = _pick_available(s, count=1)
    assert seat
    r = s.post(f"{API}/orders", json={
        "name": "TEST_reject", "phone": "0812", "session_id": 1,
        "seats": seat, "payment_method": "transfer"
    })
    assert r.status_code == 200
    oid = r.json()["id"]

    r = requests.post(f"{API}/admin/orders/{oid}/reject", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "rejected"

    # verify seat is available again
    r = s.get(f"{API}/sessions/1/seats").json()
    flat = {x["label"]: x["status"] for row in r["rows"] for x in row["seats"]}
    assert flat[seat[0]] == "available"


def test_admin_set_active_session_invalid(admin_headers):
    r = requests.post(f"{API}/admin/active-session", json={"session_id": 99}, headers=admin_headers)
    assert r.status_code == 400
