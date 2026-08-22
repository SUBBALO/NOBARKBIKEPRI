"""Iteration 26 — Manual order & Preorder with payment_method + unique_code (3-digit) logic."""
import os
import re
import random
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"

PNG = ("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8"
       "z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==")


@pytest.fixture(scope="module")
def creds():
    p = Path("/app/memory/test_credentials.md")
    if not p.exists():
        pytest.skip("missing test_credentials.md")
    txt = p.read_text()
    m = re.search(r"\|\s*admin1\s*\|\s*(\S+)\s*\|", txt)
    return {"username": "admin1", "password": m.group(1) if m else "admin123"}


@pytest.fixture(scope="module")
def client(creds):
    s = requests.Session()
    r = s.post(f"{API}/admin/login", json=creds, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"login failed {r.status_code}: {r.text[:300]}")
    data = r.json()
    assert "token" in data and data["user"]["role"] == "superadmin"
    s.headers.update({"X-Admin-Token": data["token"]})
    return s


@pytest.fixture(scope="module")
def created(client):
    ids = []
    yield ids
    for oid in ids:
        client.delete(f"{API}/admin/manual/{oid}")


def free_seats(client, session_id, n=1):
    r = client.get(f"{API}/sessions/{session_id}/seats")
    assert r.status_code == 200, r.text
    m = r.json()
    out = []
    for row in m.get("rows", []):
        for blk in row.get("blocks", []):
            for s in blk:
                if s.get("status") == "available" and not s.get("couple"):
                    out.append(s["label"])
    random.shuffle(out)
    assert len(out) >= n, "not enough free seats"
    return out[:n]


class TestManualOrder:
    def test_manual_unpaid(self, client, created):
        seats = free_seats(client, 1)
        r = client.post(f"{API}/admin/manual", json={
            "name": "ZZTEST MB", "phone": "081200000001", "session_id": 1,
            "seats": seats, "amount": 0, "paid": False, "payment_method": "cash"})
        assert r.status_code == 200, r.text
        o = r.json()
        created.append(o["id"])
        assert "_id" not in o
        assert o["status"] == "manual_unpaid" and o["paid"] is False
        assert o["total_amount"] == 0 and o["unique_code"] == 0

    def test_manual_cash_no_unique_code(self, client, created):
        seats = free_seats(client, 1)
        r = client.post(f"{API}/admin/manual", json={
            "name": "ZZTEST CASH", "phone": "081200000002", "session_id": 1,
            "seats": seats, "amount": 50000, "paid": True,
            "payment_method": "cash", "unique_code": 137})
        assert r.status_code == 200, r.text
        o = r.json()
        created.append(o["id"])
        assert o["unique_code"] == 0, "cash must not carry unique code"
        assert o["total_amount"] == 50000
        assert o["status"] == "verified" and o["paid"] is True

    def test_manual_transfer_unique_code_persisted(self, client, created):
        seats = free_seats(client, 2)
        r = client.post(f"{API}/admin/manual", json={
            "name": "ZZTEST TF", "phone": "081200000003", "session_id": 2,
            "seats": seats, "amount": 100000, "paid": True,
            "payment_method": "transfer", "unique_code": 137, "proof_image": PNG})
        assert r.status_code == 200, r.text
        o = r.json()
        created.append(o["id"])
        assert o["unique_code"] == 137
        assert o["total_amount"] == 100137
        assert o["base_amount"] == 100000
        assert o["status"] == "verified"
        # persistence via list
        lr = client.get(f"{API}/admin/manual")
        assert lr.status_code == 200
        found = [x for x in lr.json() if x["id"] == o["id"]]
        assert found and found[0]["total_amount"] == 100137
        assert found[0]["payment_method"] == "transfer"

    def test_manual_qris(self, client, created):
        seats = free_seats(client, 2)
        r = client.post(f"{API}/admin/manual", json={
            "name": "ZZTEST QR", "phone": "081200000004", "session_id": 2,
            "seats": seats, "amount": 200000, "paid": True,
            "payment_method": "qris", "unique_code": 245, "proof_image": PNG})
        assert r.status_code == 200, r.text
        o = r.json()
        created.append(o["id"])
        assert o["total_amount"] == 200245 and o["payment_method"] == "qris"

    def test_manual_invalid_seat(self, client):
        r = client.post(f"{API}/admin/manual", json={
            "name": "ZZTEST BAD", "session_id": 1, "seats": ["ZZ99"],
            "amount": 0, "paid": False})
        assert r.status_code == 400

    def test_manual_empty_name(self, client):
        r = client.post(f"{API}/admin/manual", json={
            "name": "  ", "session_id": 1, "seats": ["A1"], "amount": 0, "paid": False})
        assert r.status_code == 400


class TestPreorder:
    def test_preorder_unpaid(self, client, created):
        seats = free_seats(client, 3)
        r = client.post(f"{API}/admin/preorder", json={
            "name": "ZZTEST PO BELUM", "phone": "081200000005", "session_id": 3,
            "seats": seats, "paid": False})
        assert r.status_code == 200, r.text
        o = r.json()
        created.append(o["id"])
        assert o["preorder"] is True and o["status"] == "manual_unpaid"
        assert o["total_amount"] == 0 and o["checked_in"] is False

    def test_preorder_transfer_unique_code(self, client, created):
        seats = free_seats(client, 3)
        r = client.post(f"{API}/admin/preorder", json={
            "name": "ZZTEST PO TF", "phone": "081200000006", "session_id": 3,
            "seats": seats, "paid": True, "amount": 150000,
            "payment_method": "transfer", "unique_code": 321, "proof_image": PNG})
        assert r.status_code == 200, r.text
        o = r.json()
        created.append(o["id"])
        assert o["unique_code"] == 321 and o["total_amount"] == 150321
        assert o["status"] == "verified" and o["paid"] is True
        assert o["proof_image"].startswith("data:image")

    def test_preorder_cash_no_code(self, client, created):
        seats = free_seats(client, 4)
        r = client.post(f"{API}/admin/preorder", json={
            "name": "ZZTEST PO CASH", "phone": "081200000007", "session_id": 4,
            "seats": seats, "paid": True, "amount": 60000,
            "payment_method": "cash", "unique_code": 999})
        assert r.status_code == 200, r.text
        o = r.json()
        created.append(o["id"])
        assert o["unique_code"] == 0 and o["total_amount"] == 60000

    def test_preorder_paid_without_amount_rejected(self, client):
        r = client.post(f"{API}/admin/preorder", json={
            "name": "ZZTEST PO BAD", "session_id": 4, "seats": ["A1"],
            "paid": True, "amount": 0, "payment_method": "qris"})
        assert r.status_code == 400

    def test_preorder_bad_proof_format(self, client):
        seats = free_seats(client, 4)
        r = client.post(f"{API}/admin/preorder", json={
            "name": "ZZTEST PO BAD2", "session_id": 4, "seats": seats,
            "paid": True, "amount": 1000, "payment_method": "qris", "proof_image": "notanimage"})
        assert r.status_code == 400


class TestAuthSecurity:
    def test_manual_requires_auth(self):
        r = requests.post(f"{API}/admin/manual", json={
            "name": "ZZTEST NOAUTH", "session_id": 1, "seats": ["A1"],
            "amount": 0, "paid": False}, timeout=30)
        assert r.status_code in (401, 403)

    def test_preorder_requires_auth(self):
        r = requests.post(f"{API}/admin/preorder", json={
            "name": "ZZTEST NOAUTH", "session_id": 1, "seats": ["A1"], "paid": False}, timeout=30)
        assert r.status_code in (401, 403)

    def test_login_bad_password(self):
        r = requests.post(f"{API}/admin/login", json={
            "username": "zznotauser", "password": "wrong"}, timeout=30)
        assert r.status_code in (401, 429)


class TestBendaharaIncludesPreorder:
    def test_stats_ok(self, client):
        r = client.get(f"{API}/admin/stats")
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d, dict)
