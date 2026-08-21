"""Iteration 22 — PRE-ORDER as manual order (/api/admin/preorder), buyer self-service
Dana Paramita (/api/orders/{id}/preorder-pay) and panitia verification."""
import os
import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"

TINY_PNG = (
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8"
    "DwHwAFAAH/q842iQAAAABJRU5ErkJggg=="
)


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin(client):
    r = client.post(f"{API}/admin/login", json={"username": "admin1", "password": "admin123"})
    if r.status_code != 200:
        pytest.fail(f"admin login failed {r.status_code}: {r.text[:300]}")
    token = r.json().get("token")
    assert token
    return {"X-Admin-Token": token}


@pytest.fixture(scope="module")
def created(client, admin):
    ids = []
    yield ids
    for oid in ids:
        for url in (f"{API}/admin/manual/{oid}", f"{API}/admin/walkin/{oid}", f"{API}/admin/orders/{oid}"):
            r = client.delete(url, headers=admin)
            if r.status_code in (200, 204):
                break


def free_seats(client, session_id, count=1):
    r = client.get(f"{API}/sessions/{session_id}/seats")
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    out = []
    for row in (data.get("rows") or []):
        for block in row.get("blocks", []):
            for seat in block:
                if seat.get("status") != "available":
                    continue
                if seat.get("couple") or seat.get("disability"):
                    continue
                out.append(seat["label"])
                if len(out) >= count:
                    return out
    if len(out) < count:
        pytest.fail(f"not enough free seats in session {session_id}: {out}")
    return out


class TestPreorderUnpaid:
    """BELUM BERDANA → manual_unpaid, no amount, seats locked permanently"""

    def test_create_unpaid_and_verify_persistence(self, client, admin, created):
        seats = free_seats(client, 1, 1)
        r = client.post(f"{API}/admin/preorder", headers=admin, json={
            "name": "ZZTEST Belum", "phone": "081200000001", "session_id": 1,
            "seats": seats, "paid": False,
        })
        assert r.status_code == 200, r.text[:400]
        o = r.json()
        created.append(o["id"])
        assert "_id" not in o
        assert o["status"] == "manual_unpaid"
        assert o["paid"] is False
        assert o["manual"] is True and o["preorder"] is True
        assert o["total_amount"] == 0
        assert o["checked_in"] is False
        assert o["seats"] == seats

        # public order status endpoint reflects it
        g = client.get(f"{API}/orders/{o['id']}")
        assert g.status_code == 200
        assert g.json()["status"] == "manual_unpaid"

        # appears in admin manual list
        m = client.get(f"{API}/admin/manual", headers=admin)
        assert m.status_code == 200
        assert any(x["id"] == o["id"] for x in m.json())

        # seat is now taken
        s2 = client.get(f"{API}/sessions/1/seats").json()
        booked = [x["label"] for row in s2["rows"] for blk in row["blocks"] for x in blk
                  if x["status"] != "available"]
        assert seats[0] in booked

    def test_reject_invalid_seat_and_missing_name(self, client, admin):
        r = client.post(f"{API}/admin/preorder", headers=admin, json={
            "name": "ZZTEST Bad", "session_id": 1, "seats": ["ZZ99"], "paid": False})
        assert r.status_code == 400
        r2 = client.post(f"{API}/admin/preorder", headers=admin, json={
            "name": "  ", "session_id": 1, "seats": ["M21"], "paid": False})
        assert r2.status_code == 400

    def test_requires_auth(self, client):
        anon = requests.Session()  # fresh session: no admin cookie/token
        seats = free_seats(client, 1, 1)
        r = anon.post(f"{API}/admin/preorder", json={
            "name": "ZZTEST NoAuth", "session_id": 1, "seats": seats, "paid": False})
        assert r.status_code in (401, 403), r.text[:300]


class TestPreorderPaid:
    """SUDAH BERDANA → verified + paid"""

    def test_create_paid(self, client, admin, created):
        seats = free_seats(client, 2, 1)
        r = client.post(f"{API}/admin/preorder", headers=admin, json={
            "name": "ZZTEST Sudah", "phone": "081200000002", "session_id": 2,
            "seats": seats, "paid": True, "amount": 100000, "payment_method": "transfer",
            "location": "ZZTEST Lokasi",
        })
        assert r.status_code == 200, r.text[:400]
        o = r.json()
        created.append(o["id"])
        assert o["status"] == "verified"
        assert o["paid"] is True
        assert o["total_amount"] == 100000
        assert o["transfer_amount"] == 100000
        assert o["payment_method"] == "transfer"

        g = client.get(f"{API}/orders/{o['id']}")
        assert g.status_code == 200 and g.json()["total_amount"] == 100000

    def test_paid_requires_amount(self, client, admin):
        seats = free_seats(client, 3, 1)
        r = client.post(f"{API}/admin/preorder", headers=admin, json={
            "name": "ZZTEST NoAmount", "session_id": 3, "seats": seats,
            "paid": True, "amount": 0, "payment_method": "qris"})
        assert r.status_code == 400, r.text[:300]


class TestBuyerDanaAndVerify:
    """Buyer self-service preorder-pay → waiting_verification → panitia verify → verified+paid"""

    def test_full_flow(self, client, admin, created):
        seats = free_seats(client, 4, 1)
        r = client.post(f"{API}/admin/preorder", headers=admin, json={
            "name": "ZZTEST Dana", "phone": "081200000003", "session_id": 4,
            "seats": seats, "paid": False})
        assert r.status_code == 200, r.text[:400]
        oid = r.json()["id"]
        created.append(oid)

        # invalid: no amount
        bad = client.post(f"{API}/orders/{oid}/preorder-pay", json={
            "amount": 0, "payment_method": "qris", "proof_image": TINY_PNG})
        assert bad.status_code == 400
        # invalid: non-image proof
        bad2 = client.post(f"{API}/orders/{oid}/preorder-pay", json={
            "amount": 50000, "payment_method": "qris", "proof_image": "notanimage"})
        assert bad2.status_code == 400

        ok = client.post(f"{API}/orders/{oid}/preorder-pay", json={
            "amount": 75000, "payment_method": "qris", "proof_image": TINY_PNG})
        assert ok.status_code == 200, ok.text[:400]
        d = ok.json()
        assert d["status"] == "waiting_verification"
        assert d["total_amount"] == 75000
        assert d["payment_method"] == "qris"
        assert d.get("paid") is False

        # shows up in pending verification queue
        pend = client.get(f"{API}/admin/orders?status=waiting_verification", headers=admin)
        assert pend.status_code == 200, pend.text[:300]
        items = pend.json()
        items = items.get("orders", items) if isinstance(items, dict) else items
        assert any(x["id"] == oid for x in items)

        # verify
        v = client.post(f"{API}/admin/orders/{oid}/verify", headers=admin, json={})
        assert v.status_code == 200, v.text[:400]
        vo = v.json()
        assert vo["status"] == "verified"
        assert vo["paid"] is True
        assert vo["transfer_amount"] == 75000

        g = client.get(f"{API}/orders/{oid}")
        assert g.json()["status"] == "verified"

        # double pay now rejected
        again = client.post(f"{API}/orders/{oid}/preorder-pay", json={
            "amount": 10000, "payment_method": "transfer", "proof_image": TINY_PNG})
        assert again.status_code == 400

    def test_preorder_pay_rejects_non_preorder(self, client):
        r = client.post(f"{API}/orders/does-not-exist/preorder-pay", json={
            "amount": 1000, "payment_method": "qris", "proof_image": TINY_PNG})
        assert r.status_code == 404


class TestWalkinRegression:
    """/api/admin/walkin still works (cash, auto check-in)"""

    def test_walkin_cash_autocheckin(self, client, admin, created):
        cfg = client.get(f"{API}/config").json()
        wsessions = cfg.get("walkin_sessions") or []
        session_id = wsessions[0] if wsessions else 1
        if not wsessions:
            client.post(f"{API}/admin/sessions/toggle", headers=admin,
                        json={"session_id": session_id, "open": True, "target": "walkin"})
        seats = free_seats(client, session_id, 1)
        r = client.post(f"{API}/admin/walkin", headers=admin, json={
            "name": "ZZTEST Walkin", "phone": "081200000004", "session_id": session_id,
            "seats": seats, "payment_method": "cash", "amount": 50000,
            "location": "ZZTEST Lokasi"})
        assert r.status_code == 200, r.text[:400]
        o = r.json()
        created.append(o["id"])
        assert o["status"] == "verified"
        assert o["checked_in"] is True
        assert o.get("preorder") in (False, None)
        if not wsessions:
            client.post(f"{API}/admin/sessions/toggle", headers=admin,
                        json={"session_id": session_id, "open": False, "target": "walkin"})


def test_cleanup_no_zztest_left(client, admin):
    """runs last-ish: report any leftover ZZTEST manual orders"""
    m = client.get(f"{API}/admin/manual", headers=admin)
    assert m.status_code == 200
    leftovers = [x for x in m.json() if str(x.get("name", "")).startswith("ZZTEST")]
    print("leftover ZZTEST at this point:", [x.get("name") for x in leftovers])
