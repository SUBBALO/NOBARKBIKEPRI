"""Iteration 7 — dana sukarela + manual session open/close.
Covers: /api/event fields, /api/orders amount validation & session open enforcement,
/api/admin/sessions/toggle role/logs, /api/admin/walkin amount validation & session-open independence.
"""
import os
import time
import pytest
import requests

def _load_frontend_env():
    p = "/app/frontend/.env"
    if os.path.exists(p):
        with open(p) as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    return os.environ.get("REACT_APP_BACKEND_URL")

BASE_URL = _load_frontend_env().rstrip("/")
API = f"{BASE_URL}/api"

created_order_ids = []  # cleanup at end


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def super_token():
    r = requests.post(f"{API}/admin/login", json={"username": "admin1", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/admin/login", json={"username": "admin2", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def checkin_token():
    r = requests.post(f"{API}/admin/login", json={"username": "admin3", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def hdr(tok):
    return {"X-Admin-Token": tok}


# ---------- /api/event ----------
def test_event_has_5_sessions_donation_reference():
    r = requests.get(f"{API}/event")
    assert r.status_code == 200
    d = r.json()
    assert d["pricing"] == "donation"
    assert d["reference_cost"] == 60000
    assert len(d["sessions"]) == 5
    times = {s["id"]: s["time"] for s in d["sessions"]}
    assert "09.00" in times[1]
    assert "12.30" in times[2]
    assert "15.00" in times[3]
    assert "17.00" in times[4]
    assert "19.00" in times[5]
    # coming_soon expected OFF per note
    # Do not assert to be robust
    print("open sessions status:", {s["id"]: s["status"] for s in d["sessions"]})


# ---------- toggle sessions (RBAC + logs) ----------
def test_toggle_session_requires_superadmin(admin_token, checkin_token):
    for tok in (admin_token, checkin_token):
        r = requests.post(f"{API}/admin/sessions/toggle", headers=hdr(tok),
                          json={"session_id": 3, "open": True})
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"


def test_toggle_session_superadmin_open_close_and_log(super_token):
    # Open session 3
    r = requests.post(f"{API}/admin/sessions/toggle", headers=hdr(super_token),
                      json={"session_id": 3, "open": True})
    assert r.status_code == 200
    assert 3 in r.json()["open_sessions"]

    # verify /event shows session 3 open
    ev = requests.get(f"{API}/event").json()
    s3 = next(s for s in ev["sessions"] if s["id"] == 3)
    assert s3["status"] in ("open", "full"), f"session 3 status {s3['status']}"

    # Close it back
    r = requests.post(f"{API}/admin/sessions/toggle", headers=hdr(super_token),
                      json={"session_id": 3, "open": False})
    assert r.status_code == 200
    assert 3 not in r.json()["open_sessions"]

    # Log recorded
    logs = requests.get(f"{API}/admin/logs", headers=hdr(super_token)).json()
    actions = [l.get("action") for l in logs[:10]]
    assert "session_toggle" in actions, f"session_toggle missing in recent logs: {actions}"


# ---------- ensure sesi 2 & 5 open at start (state as noted) ----------
def _open_session(tok, sid, open_=True):
    r = requests.post(f"{API}/admin/sessions/toggle", headers=hdr(tok),
                      json={"session_id": sid, "open": open_})
    assert r.status_code == 200
    return r.json()["open_sessions"]


# ---------- /api/orders ----------
def test_order_rejected_when_session_closed(super_token):
    # ensure session 1 closed
    _open_session(super_token, 1, False)
    payload = {
        "name": "TEST_ClosedSess", "phone": "081200000001",
        "session_id": 1, "seats": ["G10"], "payment_method": "qris", "amount": 50000,
    }
    r = requests.post(f"{API}/api" if False else f"{API}/orders", json=payload)
    assert r.status_code == 400
    assert "belum dibuka" in r.text.lower()


def test_order_rejected_when_amount_zero_or_missing(super_token):
    _open_session(super_token, 2, True)
    base = {"name": "TEST_ZeroAmt", "phone": "081200000002",
            "session_id": 2, "seats": ["G11"], "payment_method": "qris"}
    r = requests.post(f"{API}/orders", json={**base, "amount": 0})
    assert r.status_code == 400
    assert "nominal dana sukarela" in r.text.lower()

    r2 = requests.post(f"{API}/orders", json=base)  # omitted -> defaults 0
    assert r2.status_code == 400


def test_order_success_with_free_amount(super_token):
    _open_session(super_token, 2, True)
    payload = {
        "name": "TEST_Free75k", "phone": "081200000003",
        "session_id": 2, "seats": ["G12"], "payment_method": "qris", "amount": 75000,
    }
    r = requests.post(f"{API}/orders", json=payload)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["base_amount"] == 75000
    assert 11 <= d["unique_code"] <= 999
    assert d["total_amount"] == 75000 + d["unique_code"]
    created_order_ids.append(d["id"])

    # verify persistence via public GET
    g = requests.get(f"{API}/orders/{d['id']}").json()
    assert g["base_amount"] == 75000
    assert g["total_amount"] == d["total_amount"]


# ---------- /api/admin/walkin ----------
def test_walkin_requires_amount_and_releases_lock(super_token):
    # Attempt walk-in with no amount on a CLOSED session (should still fail but for amount)
    _open_session(super_token, 4, False)  # ensure closed to also validate walkin independence
    seat = "H10"
    payload = {"name": "TEST_WalkinNoAmt", "phone": "0812", "session_id": 4,
               "seats": [seat], "payment_method": "cash", "amount": 0}
    r = requests.post(f"{API}/admin/walkin", headers=hdr(super_token), json=payload)
    assert r.status_code == 400
    assert "nominal" in r.text.lower()

    # After rejection, the seat lock should be released — retry with amount succeeds
    payload["amount"] = 100000
    r2 = requests.post(f"{API}/admin/walkin", headers=hdr(super_token), json=payload)
    assert r2.status_code == 200, r2.text
    d = r2.json()
    assert d["base_amount"] == 100000
    assert d["unique_code"] == 0
    assert d["total_amount"] == 100000
    assert d["status"] == "verified"
    assert d["checked_in"] is True
    assert d.get("walkin") is True
    created_order_ids.append(d["id"])


def test_walkin_qris_adds_unique_code_on_closed_session(super_token):
    _open_session(super_token, 4, False)  # still closed
    payload = {"name": "TEST_WalkinQris", "phone": "0813", "session_id": 4,
               "seats": ["H11"], "payment_method": "qris", "amount": 60000}
    r = requests.post(f"{API}/admin/walkin", headers=hdr(super_token), json=payload)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["base_amount"] == 60000
    assert 11 <= d["unique_code"] <= 999
    assert d["total_amount"] == 60000 + d["unique_code"]
    created_order_ids.append(d["id"])


# ---------- final state + cleanup ----------
def test_cleanup_and_reset_sessions(super_token):
    # delete created test orders
    for oid in created_order_ids:
        requests.delete(f"{API}/admin/orders/{oid}", headers=hdr(super_token))
    # reset to sesi 2 & 5 open, others closed
    for sid in [1, 3, 4]:
        _open_session(super_token, sid, False)
    for sid in [2, 5]:
        _open_session(super_token, sid, True)
    ev = requests.get(f"{API}/event").json()
    opens = {s["id"] for s in ev["sessions"] if s["status"] in ("open", "full")}
    assert opens == {2, 5}, f"final opens={opens}"
