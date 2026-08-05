"""Backend API tests for Nonton Bareng MBI ticketing app."""
import os
import base64
import uuid as _uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to frontend/.env
    from pathlib import Path
    envp = Path("/app/frontend/.env")
    for ln in envp.read_text().splitlines():
        if ln.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = ln.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def admin_token(s):
    r = s.post(f"{API}/admin/login", json={"password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"X-Admin-Token": admin_token, "Content-Type": "application/json"}


# ---------------- Reset via ensuring active session = 1 ----------------
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


def test_set_active_session_1(s, admin_headers):
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


# ---------------- Seats ----------------
def test_seats_session1_rowA_available_rowB_locked(s):
    r = s.get(f"{API}/sessions/1/seats")
    assert r.status_code == 200
    d = r.json()
    rows = {row["row"]: row for row in d["rows"]}
    # Row A should be unlocked (available unless booked)
    assert rows["A"]["unlocked"] is True
    # Row B should be locked until A is full
    # only guaranteed if row A not full
    if any(s["status"] == "available" for s in rows["A"]["seats"]):
        assert rows["B"]["unlocked"] is False
        assert all(s["status"] == "locked" for s in rows["B"]["seats"])


def test_seats_invalid_session(s):
    r = s.get(f"{API}/sessions/99/seats")
    assert r.status_code == 404


# ---------------- Create order ----------------
_uniq = _uuid.uuid4().hex[:4]


def _pick_available_row_a(s):
    r = s.get(f"{API}/sessions/1/seats").json()
    rowA = next(row for row in r["rows"] if row["row"] == "A")
    return [x["label"] for x in rowA["seats"] if x["status"] == "available"]


@pytest.fixture(scope="module")
def created_order(s):
    avail = _pick_available_row_a(s)
    assert len(avail) >= 2, f"need 2 avail seats in row A, got {avail}"
    seats = avail[:2]
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
    assert d["status"] == "pending_payment"
    assert d["seats"] == seats
    return d


def test_order_created(created_order):
    assert "id" in created_order


def test_locked_session_cannot_book(s):
    # session 2 is locked when active=1
    avail = _pick_available_row_a(s)
    seat = avail[0] if avail else "A1"
    r = s.post(f"{API}/orders", json={
        "name": "TEST_lock", "phone": "0812", "session_id": 2,
        "seats": [seat], "payment_method": "qris"
    })
    assert r.status_code == 400


def test_double_booking_returns_409(s, created_order):
    seat = created_order["seats"][0]
    r = s.post(f"{API}/orders", json={
        "name": "TEST_dup", "phone": "0812", "session_id": 1,
        "seats": [seat], "payment_method": "qris"
    })
    assert r.status_code == 409


def test_locked_seat_returns_400(s):
    # row B still locked because A is not full
    r = s.post(f"{API}/orders", json={
        "name": "TEST_lockseat", "phone": "0812", "session_id": 1,
        "seats": ["B1"], "payment_method": "qris"
    })
    assert r.status_code == 400


# ---------------- Get order + proof upload ----------------
def test_get_order(s, created_order):
    r = s.get(f"{API}/orders/{created_order['id']}")
    assert r.status_code == 200
    d = r.json()
    assert d["session"]["id"] == 1
    assert d["transfer"]["bank"] == "BCA"


def test_upload_proof_sets_waiting(s, created_order):
    tiny_png = base64.b64encode(bytes.fromhex(
        "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C63000100000500010D0A2DB40000000049454E44AE426082"
    )).decode()
    payload = {"proof_image": f"data:image/png;base64,{tiny_png}"}
    r = s.post(f"{API}/orders/{created_order['id']}/proof", json=payload)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "waiting_verification"


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


def test_admin_reject_frees_seat(s, admin_headers):
    # Create a new order then reject and verify seat becomes available
    avail = _pick_available_row_a(s)
    assert len(avail) >= 1
    seat = avail[0]
    r = s.post(f"{API}/orders", json={
        "name": "TEST_reject", "phone": "0812", "session_id": 1,
        "seats": [seat], "payment_method": "transfer"
    })
    assert r.status_code == 200
    oid = r.json()["id"]

    r = requests.post(f"{API}/admin/orders/{oid}/reject", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "rejected"

    # verify seat is available again
    r = s.get(f"{API}/sessions/1/seats").json()
    rowA = next(row for row in r["rows"] if row["row"] == "A")
    seat_status = {x["label"]: x["status"] for x in rowA["seats"]}
    assert seat_status[seat] == "available", f"expected available, got {seat_status[seat]}"


def test_admin_checkin(admin_headers, created_order):
    r = requests.post(f"{API}/admin/orders/{created_order['id']}/checkin", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["checked_in"] is True


def test_admin_set_active_session(admin_headers):
    r = requests.post(f"{API}/admin/active-session", json={"session_id": 2}, headers=admin_headers)
    assert r.status_code == 200
    # restore
    r = requests.post(f"{API}/admin/active-session", json={"session_id": 1}, headers=admin_headers)
    assert r.status_code == 200


def test_admin_set_active_session_invalid(admin_headers):
    r = requests.post(f"{API}/admin/active-session", json={"session_id": 99}, headers=admin_headers)
    assert r.status_code == 400
