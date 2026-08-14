"""Tests for new CINEMA 4 seat layout, couple pairs, reserved operator seats, and walk-in."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.strip().split("=", 1)[1].rstrip("/")

API = f"{BASE_URL}/api"

CREATED_ORDER_IDS = []


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/admin/login", json={"username": "admin1", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module", autouse=True)
def cleanup(admin_token):
    yield
    for oid in CREATED_ORDER_IDS:
        try:
            requests.delete(f"{API}/admin/orders/{oid}", headers={"X-Admin-Token": admin_token}, timeout=10)
        except Exception:
            pass


# ---------- Seat map structure ----------
class TestSeats:
    def test_seat_map_structure(self):
        r = requests.get(f"{API}/sessions/1/seats")
        assert r.status_code == 200
        d = r.json()
        assert d["capacity"] == 207, f"capacity={d['capacity']}"
        rows = d["rows"]
        row_labels = [r["row"] for r in rows]
        assert row_labels == ["M", "L", "K", "J", "H", "G", "F", "E", "D", "C", "B", "A"], row_labels

        for row in rows:
            assert "blocks" in row and isinstance(row["blocks"], list)
            assert len(row["blocks"]) >= 2

        # K row: no K9
        k_row = next(r for r in rows if r["row"] == "K")
        k_labels = [s["label"] for blk in k_row["blocks"] for s in blk]
        assert "K9" not in k_labels
        assert "K8" in k_labels and "K10" in k_labels

        # A11 and A12 reserved
        a_row = next(r for r in rows if r["row"] == "A")
        a_map = {s["label"]: s for blk in a_row["blocks"] for s in blk}
        assert a_map["A11"]["status"] == "reserved"
        assert a_map["A12"]["status"] == "reserved"

        # couples field
        couples = d["couples"]
        # 15 pairs -> 30 entries
        assert len(couples) == 30, f"couples entries={len(couples)}"
        # some known pairings
        assert couples.get("B16") == "B15"
        assert couples.get("A4") == "A3"
        assert couples.get("A12") == "A11"


# ---------- Order validation ----------
class TestOrderValidation:
    def test_single_couple_seat_rejected(self):
        r = requests.post(f"{API}/orders", json={
            "name": "TEST_couple_single", "phone": "081200000001",
            "session_id": 1, "seats": ["B12"], "payment_method": "qris",
        })
        assert r.status_code == 400
        assert "couple" in r.json()["detail"].lower() or "sepasang" in r.json()["detail"].lower()

    def test_reserved_seat_rejected(self):
        r = requests.post(f"{API}/orders", json={
            "name": "TEST_reserved", "phone": "081200000002",
            "session_id": 1, "seats": ["A11", "A12"], "payment_method": "qris",
        })
        assert r.status_code == 400
        assert "operator" in r.json()["detail"].lower()

    def test_invalid_k9_rejected(self):
        r = requests.post(f"{API}/orders", json={
            "name": "TEST_k9", "phone": "081200000003",
            "session_id": 1, "seats": ["K9"], "payment_method": "qris",
        })
        assert r.status_code == 400
        assert "tidak valid" in r.json()["detail"].lower() or "invalid" in r.json()["detail"].lower()

    def test_couple_pair_plus_regular_success(self):
        # Use B12, B11 (couple) + C10 (regular) - avoid taken seats B8/B7/A10 etc.
        r = requests.post(f"{API}/orders", json={
            "name": "TEST_couple_ok", "phone": "081200000004",
            "session_id": 1, "seats": ["B12", "B11", "C10"], "payment_method": "qris",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        CREATED_ORDER_IDS.append(d["id"])
        assert set(d["seats"]) == {"B12", "B11", "C10"}
        assert d["qty"] == 3
        assert d["status"] == "pending_payment"


# ---------- Walk-in tests ----------
class TestWalkin:
    def test_walkin_single_couple_rejected(self, admin_token):
        r = requests.post(f"{API}/admin/walkin",
            headers={"X-Admin-Token": admin_token},
            json={"name": "TEST_walkin_bad", "phone": "081200000010",
                  "session_id": 1, "seats": ["A6"], "payment_method": "cash"})
        assert r.status_code == 400
        assert "couple" in r.json()["detail"].lower() or "sepasang" in r.json()["detail"].lower()

    def test_walkin_couple_pair_success(self, admin_token):
        r = requests.post(f"{API}/admin/walkin",
            headers={"X-Admin-Token": admin_token},
            json={"name": "TEST_walkin_ok", "phone": "081200000011",
                  "session_id": 1, "seats": ["A6", "A5"], "payment_method": "cash"})
        assert r.status_code == 200, r.text
        d = r.json()
        CREATED_ORDER_IDS.append(d["id"])
        assert d["status"] == "verified"
        assert d["checked_in"] is True
        assert set(d["seats"]) == {"A6", "A5"}
