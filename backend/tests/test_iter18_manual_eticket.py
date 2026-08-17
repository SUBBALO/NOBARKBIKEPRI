"""Iteration 18 — Order Manual + E-Ticket flow.

Verifies:
- POST /api/admin/manual creates order with amount=0, paid=false (no nominal / paid in create form)
- Seats are held (409 on duplicate seat)
- PUT /api/admin/manual/{id} updates paid + nominal + transfer_date + transfer_amount
- After paid, total_amount reflects transfer_amount (basis for e-ticket 'Status Pembayaran' line)
- DELETE /api/admin/manual/{id} releases seats
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"

TEST_NAME = f"ZZ ETIKET TEST {int(time.time())}"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/admin/login", json={"username": "admin1", "password": "admin123"}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def hdr(admin_token):
    return {"X-Admin-Token": admin_token, "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def pick_seats(hdr):
    # Find a session with >=2 available non-reserved, non-couple seats.
    for sid in (1, 2, 3, 4):
        r = requests.get(f"{API}/sessions/{sid}/seats", timeout=15)
        assert r.status_code == 200, f"seats {sid}: {r.status_code}"
        data = r.json()
        picked = []
        # rows is a list of {row, blocks:[{seat, status, ...}]}
        for row in data.get("rows", []):
            for blk in row.get("blocks", []):
                for cell in blk:
                    lbl = cell.get("label") or f"{row['row']}{cell.get('num','')}"
                    status = cell.get("status")
                    if status == "available" and not cell.get("couple") and not cell.get("reserved"):
                        picked.append(lbl)
                        if len(picked) >= 2:
                            return sid, picked
        if len(picked) >= 2:
            return sid, picked
    pytest.skip("Cannot find available seats in any session")


created_ids = []


def test_create_manual_without_amount_or_paid(hdr, pick_seats):
    """Frontend now sends amount:0, paid:false — server should accept and persist unpaid, amount=0."""
    sid, seats = pick_seats
    payload = {
        "name": TEST_NAME,
        "phone": "",
        "session_id": sid,
        "seats": seats,
        "amount": 0,
        "paid": False,
    }
    r = requests.post(f"{API}/admin/manual", headers=hdr, json=payload, timeout=20)
    assert r.status_code == 200, f"create failed: {r.status_code} {r.text}"
    o = r.json()
    created_ids.append(o["id"])
    assert o["name"] == TEST_NAME
    assert o["paid"] is False
    assert o["manual"] is True
    assert o["qty"] == len(seats)
    assert set(o["seats"]) == set(seats)
    assert o.get("total_amount", 0) == 0
    assert o.get("order_amount", 0) == 0
    assert o.get("status") == "manual_unpaid"

    # Verify persisted via list
    r2 = requests.get(f"{API}/admin/manual", headers=hdr, timeout=15)
    assert r2.status_code == 200
    got = next((x for x in r2.json() if x["id"] == o["id"]), None)
    assert got is not None
    assert got["paid"] is False
    assert got.get("total_amount", 0) == 0


def test_seats_are_held(hdr, pick_seats):
    """Attempting to POST same seats again returns 409."""
    sid, seats = pick_seats
    r = requests.post(f"{API}/admin/manual", headers=hdr, json={
        "name": TEST_NAME + " DUP", "session_id": sid, "seats": seats[:1],
        "amount": 0, "paid": False,
    }, timeout=20)
    assert r.status_code == 409, f"expected 409, got {r.status_code} {r.text}"


def test_update_paid_with_transfer_amount(hdr):
    """PUT updates paid + transfer date/amount; total_amount picks up transfer_amount."""
    oid = created_ids[0]
    payload = {
        "paid": True,
        "transfer_date": "2026-01-15",
        "transfer_amount": 250000,
        "amount": 250000,
    }
    r = requests.put(f"{API}/admin/manual/{oid}", headers=hdr, json=payload, timeout=20)
    assert r.status_code == 200, f"update failed: {r.status_code} {r.text}"
    o = r.json()
    assert o["paid"] is True
    assert o["transfer_amount"] == 250000
    assert o["total_amount"] == 250000
    assert o["status"] == "verified"
    assert o.get("transfer_date") == "2026-01-15"


def test_delete_releases_seat(hdr, pick_seats):
    sid, seats = pick_seats
    oid = created_ids[0]
    r = requests.delete(f"{API}/admin/manual/{oid}", headers=hdr, timeout=15)
    assert r.status_code in (200, 204)
    # Now the seat should be free again — creating a fresh manual on same seats should work
    payload = {
        "name": TEST_NAME + " RECREATE",
        "session_id": sid,
        "seats": seats,
        "amount": 0,
        "paid": False,
    }
    r2 = requests.post(f"{API}/admin/manual", headers=hdr, json=payload, timeout=20)
    assert r2.status_code == 200, f"recreate after delete failed: {r2.status_code} {r2.text}"
    # cleanup
    requests.delete(f"{API}/admin/manual/{r2.json()['id']}", headers=hdr, timeout=15)
