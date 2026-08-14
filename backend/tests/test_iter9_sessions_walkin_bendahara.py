"""Iteration 9 tests: 4 sessions, walk-in location & proof requirements, bendahara recap."""
import os
import pytest
import requests
from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

# 1x1 PNG base64
PNG_B64 = (
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


def _login(username, password):
    r = requests.post(f"{API}/admin/login", json={"username": username, "password": password}, timeout=10)
    assert r.status_code == 200, f"login failed {username}: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def tokens():
    return {
        "super": _login("admin1", "admin123"),
        "admin": _login("admin2", "admin123"),
        "checkin": _login("admin3", "admin123"),
        "chelyn": _login("chelyn", "Chelyn123456"),
    }


def _hdr(tok):
    return {"X-Admin-Token": tok}


@pytest.fixture(scope="module", autouse=True)
def _cleanup(tokens):
    """Track created walk-in order ids and soft-delete after tests."""
    created_ids = []
    yield created_ids
    # cleanup: soft-delete
    for oid in created_ids:
        try:
            requests.delete(f"{API}/admin/orders/{oid}", headers=_hdr(tokens["super"]), timeout=10)
        except Exception:
            pass
    # Close everything and restore coming_soon
    for sid in range(1, 5):
        for target in ("public", "walkin"):
            try:
                requests.post(f"{API}/admin/sessions/toggle",
                              json={"session_id": sid, "open": False, "target": target},
                              headers=_hdr(tokens["super"]), timeout=10)
            except Exception:
                pass
    try:
        requests.post(f"{API}/admin/coming-soon", json={"enabled": True},
                      headers=_hdr(tokens["super"]), timeout=10)
    except Exception:
        pass


# --- (A) 4 sessions ---
def test_event_returns_exactly_4_sessions_with_new_times():
    r = requests.get(f"{API}/event", timeout=10)
    assert r.status_code == 200
    data = r.json()
    sessions = data["sessions"]
    assert len(sessions) == 4
    expected = {
        1: "09.30–11.30 WIB",
        2: "12.00–14.00 WIB",
        3: "14.30–16.30 WIB",
        4: "17.00–19.00 WIB",
    }
    for s in sessions:
        assert s["time"] == expected[s["id"]], f"session {s['id']} time mismatch: {s['time']}"
        assert "walkin_open" in s and isinstance(s["walkin_open"], bool)
    assert not any(s["id"] == 5 for s in sessions)


# --- (B) Walk-in gating + location + proof ---
def _open_walkin(tokens, sid):
    r = requests.post(f"{API}/admin/sessions/toggle",
                      json={"session_id": sid, "open": True, "target": "walkin"},
                      headers=_hdr(tokens["super"]), timeout=10)
    assert r.status_code == 200


def _close_walkin(tokens, sid):
    requests.post(f"{API}/admin/sessions/toggle",
                  json={"session_id": sid, "open": False, "target": "walkin"},
                  headers=_hdr(tokens["super"]), timeout=10)


def test_walkin_gating_closed_returns_400(tokens):
    _close_walkin(tokens, 2)
    r = requests.post(f"{API}/admin/walkin", json={
        "name": "TEST_gate", "phone": "080000", "session_id": 2,
        "seats": ["L2"], "payment_method": "cash", "amount": 60000,
        "location": "Vihara A",
    }, headers=_hdr(tokens["admin"]), timeout=10)
    assert r.status_code == 400


def test_walkin_missing_location_returns_400(tokens):
    _open_walkin(tokens, 2)
    r = requests.post(f"{API}/admin/walkin", json={
        "name": "TEST_noloc", "phone": "080000", "session_id": 2,
        "seats": ["L2"], "payment_method": "cash", "amount": 60000,
        "location": "",
    }, headers=_hdr(tokens["admin"]), timeout=10)
    assert r.status_code == 400
    assert "Lokasi" in r.text or "lokasi" in r.text


def test_walkin_qris_missing_proof_returns_400(tokens, _cleanup):
    _open_walkin(tokens, 2)
    r = requests.post(f"{API}/admin/walkin", json={
        "name": "TEST_noproof", "phone": "080000", "session_id": 2,
        "seats": ["L3"], "payment_method": "qris", "amount": 60000,
        "location": "Vihara B",
    }, headers=_hdr(tokens["admin"]), timeout=10)
    assert r.status_code == 400


def test_walkin_cash_success(tokens, _cleanup):
    _open_walkin(tokens, 2)
    r = requests.post(f"{API}/admin/walkin", json={
        "name": "TEST_cash", "phone": "081111", "session_id": 2,
        "seats": ["L2"], "payment_method": "cash", "amount": 60000,
        "location": "Vihara Utama",
    }, headers=_hdr(tokens["admin"]), timeout=10)
    assert r.status_code == 200, r.text
    o = r.json()
    _cleanup.append(o["id"])
    assert o["payment_method"] == "cash"
    assert o["unique_code"] == 0
    assert o["total_amount"] == 60000
    assert o["location"] == "Vihara Utama"
    assert o["sold_by"] == "Admin 2"
    assert o["status"] == "verified"


def test_walkin_qris_with_proof_success(tokens, _cleanup):
    _open_walkin(tokens, 2)
    r = requests.post(f"{API}/admin/walkin", json={
        "name": "TEST_qris", "phone": "082222", "session_id": 2,
        "seats": ["L4"], "payment_method": "qris", "amount": 60000,
        "location": "Booth Mall",
        "proof_image": PNG_B64,
    }, headers=_hdr(tokens["chelyn"]), timeout=10)
    assert r.status_code == 200, r.text
    o = r.json()
    _cleanup.append(o["id"])
    assert o["unique_code"] > 0
    assert o["total_amount"] == 60000 + o["unique_code"]
    assert o["location"] == "Booth Mall"
    assert o["sold_by"] == "Chelyn"


def test_walkin_transfer_with_proof_success(tokens, _cleanup):
    _open_walkin(tokens, 2)
    r = requests.post(f"{API}/admin/walkin", json={
        "name": "TEST_tf", "phone": "083333", "session_id": 2,
        "seats": ["L6"], "payment_method": "transfer", "amount": 60000,
        "location": "Vihara Utama",
        "proof_image": PNG_B64,
    }, headers=_hdr(tokens["admin"]), timeout=10)
    assert r.status_code == 200, r.text
    o = r.json()
    _cleanup.append(o["id"])
    assert o["unique_code"] > 0
    assert o["total_amount"] == 60000 + o["unique_code"]


# --- (C) Bendahara recap ---
def test_bendahara_forbidden_for_checkin(tokens):
    r = requests.get(f"{API}/admin/bendahara", headers=_hdr(tokens["checkin"]), timeout=10)
    assert r.status_code == 403


def test_bendahara_allowed_for_super_and_admin(tokens, _cleanup):
    # ensure we have at least the created orders above
    for who in ("super", "admin"):
        r = requests.get(f"{API}/admin/bendahara", headers=_hdr(tokens[who]), timeout=10)
        assert r.status_code == 200, f"{who}: {r.text}"
        data = r.json()
        assert isinstance(data, list)


def test_bendahara_totals_and_breakdown(tokens, _cleanup):
    r = requests.get(f"{API}/admin/bendahara", headers=_hdr(tokens["super"]), timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 1
    # Find day containing our created orders (they were made today UTC->WIB)
    # Sum cash + qris + transfer across all days for TEST_ orders
    found_cash = found_qris = found_tf = False
    for day in data:
        total = day["total"]
        assert total["amount"] == total["cash"] + total["qris"] + total["transfer"]
        assert "by_seller" in day and isinstance(day["by_seller"], list)
        assert "by_location" in day and isinstance(day["by_location"], list)
        assert "orders" in day and isinstance(day["orders"], list)
        for o in day["orders"]:
            if o.get("name") == "TEST_cash":
                found_cash = True
                assert o["method"] == "cash"
                assert o["amount"] == 60000
                assert o["location"] == "Vihara Utama"
                assert o["seller"] == "Admin 2"
            if o.get("name") == "TEST_qris":
                found_qris = True
                assert o["method"] == "qris"
                assert o["location"] == "Booth Mall"
            if o.get("name") == "TEST_tf":
                found_tf = True
                assert o["method"] == "transfer"
    assert found_cash and found_qris and found_tf, "created TEST orders should appear in bendahara"


def test_bendahara_excludes_soft_deleted(tokens, _cleanup):
    # create then delete an order, ensure it's not in bendahara
    _open_walkin(tokens, 3)
    r = requests.post(f"{API}/admin/walkin", json={
        "name": "TEST_delete_me", "phone": "089999", "session_id": 3,
        "seats": ["L2"], "payment_method": "cash", "amount": 60000,
        "location": "Vihara Del",
    }, headers=_hdr(tokens["super"]), timeout=10)
    assert r.status_code == 200, r.text
    oid = r.json()["id"]
    # soft-delete
    d = requests.delete(f"{API}/admin/orders/{oid}", headers=_hdr(tokens["super"]), timeout=10)
    assert d.status_code == 200
    # verify not in bendahara
    r2 = requests.get(f"{API}/admin/bendahara", headers=_hdr(tokens["super"]), timeout=10)
    assert r2.status_code == 200
    for day in r2.json():
        for o in day["orders"]:
            assert o.get("name") != "TEST_delete_me", "soft-deleted order must not appear"
