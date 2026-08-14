"""Iteration 11: Verify bug fix POST /api/admin/sessions/toggle (route decorator restored) + VIP + bendahara regression."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"


def _login(username, password):
    r = requests.post(f"{API}/admin/login", json={"username": username, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {username} failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def super_headers():
    return {"X-Admin-Token": _login("admin1", "admin123")}


@pytest.fixture(scope="module")
def admin_headers():
    return {"X-Admin-Token": _login("admin2", "admin123")}


# --- BUG FIX: /api/admin/sessions/toggle ---
class TestSessionToggle:
    def test_toggle_public_open_close_session1(self, super_headers):
        # Ensure closed first
        r = requests.post(f"{API}/admin/sessions/toggle",
                          json={"session_id": 1, "open": True, "target": "public"},
                          headers=super_headers, timeout=15)
        assert r.status_code == 200, f"expected 200 not 404, got {r.status_code} {r.text}"
        data = r.json()
        assert "open_sessions" in data
        assert 1 in data["open_sessions"]

        # Verify via GET /api/event
        ev = requests.get(f"{API}/event", timeout=15).json()
        s1 = next(s for s in ev["sessions"] if s["id"] == 1)
        assert s1.get("status") == "open" or s1.get("open") is True, f"session1 not open: {s1}"

        # Close again
        r2 = requests.post(f"{API}/admin/sessions/toggle",
                           json={"session_id": 1, "open": False, "target": "public"},
                           headers=super_headers, timeout=15)
        assert r2.status_code == 200
        assert 1 not in r2.json()["open_sessions"]
        ev2 = requests.get(f"{API}/event", timeout=15).json()
        s1b = next(s for s in ev2["sessions"] if s["id"] == 1)
        assert s1b.get("status") != "open"

    def test_toggle_walkin_session3(self, super_headers):
        r = requests.post(f"{API}/admin/sessions/toggle",
                          json={"session_id": 3, "open": True, "target": "walkin"},
                          headers=super_headers, timeout=15)
        assert r.status_code == 200
        assert 3 in r.json()["walkin_sessions"]

        ev = requests.get(f"{API}/event", timeout=15).json()
        s3 = next(s for s in ev["sessions"] if s["id"] == 3)
        assert s3.get("walkin_open") is True

        # Close
        r2 = requests.post(f"{API}/admin/sessions/toggle",
                           json={"session_id": 3, "open": False, "target": "walkin"},
                           headers=super_headers, timeout=15)
        assert r2.status_code == 200
        assert 3 not in r2.json()["walkin_sessions"]
        ev2 = requests.get(f"{API}/event", timeout=15).json()
        s3b = next(s for s in ev2["sessions"] if s["id"] == 3)
        assert s3b.get("walkin_open") is False

    def test_toggle_forbidden_for_admin(self, admin_headers):
        r = requests.post(f"{API}/admin/sessions/toggle",
                          json={"session_id": 1, "open": True, "target": "public"},
                          headers=admin_headers, timeout=15)
        assert r.status_code == 403, f"admin should be 403, got {r.status_code} {r.text}"


# --- Regression VIP ---
class TestVIP:
    created_ids = []

    def test_vip_missing_name(self, super_headers):
        r = requests.post(f"{API}/admin/vip",
                          json={"name": "", "session_id": 2, "seats": ["L2"]},
                          headers=super_headers, timeout=15)
        assert r.status_code == 400

    def test_vip_missing_seats(self, super_headers):
        r = requests.post(f"{API}/admin/vip",
                          json={"name": "TEST_VIP", "session_id": 2, "seats": []},
                          headers=super_headers, timeout=15)
        assert r.status_code == 400

    def test_vip_operator_seat_rejected(self, super_headers):
        r = requests.post(f"{API}/admin/vip",
                          json={"name": "TEST_VIP Op", "session_id": 2, "seats": ["A11"]},
                          headers=super_headers, timeout=15)
        assert r.status_code == 400

    def test_vip_create_success(self, super_headers):
        # Try L2, fallback L3..L8 in case already taken
        picked = None
        for seat in ["L2", "L3", "L4", "L5", "M2", "M3", "M4"]:
            r = requests.post(f"{API}/admin/vip",
                              json={"name": "TEST_VIP Test", "session_id": 2, "seats": [seat]},
                              headers=super_headers, timeout=15)
            if r.status_code in (200, 201):
                data = r.json()
                assert data["vip"] is True
                assert data["total_amount"] == 0
                assert data["checked_in"] is False
                assert data["status"] == "verified"
                assert seat in data["seats"]
                TestVIP.created_ids.append(data["id"])
                picked = seat
                break
        assert picked, "Could not create VIP: all fallback seats taken"

        # Verify seat is locked: cannot lock again
        r2 = requests.post(f"{API}/admin/vip",
                           json={"name": "TEST_VIP Dup", "session_id": 2, "seats": [picked]},
                           headers=super_headers, timeout=15)
        assert r2.status_code == 409


# --- Regression Bendahara ---
def test_bendahara_still_works(super_headers):
    r = requests.get(f"{API}/admin/bendahara", headers=super_headers, timeout=20)
    assert r.status_code == 200
    data = r.json()
    assert "grand_total" in data
    assert "by_date" in data
    assert "orders" in data
    # If VIP order exists in current session it should appear with channel 'vip'
    if TestVIP.created_ids:
        vip_orders = [o for o in data["orders"] if o.get("channel") == "vip"]
        assert len(vip_orders) >= 1, "No VIP channel order shown in bendahara"


# --- Cleanup: hard delete test VIP orders + restore preview state (coming_soon ON, all sessions closed) ---
def test_cleanup(super_headers):
    # Soft-delete then permanent purge of TEST_VIP orders
    for oid in TestVIP.created_ids:
        # soft delete
        requests.delete(f"{API}/admin/orders/{oid}", headers=super_headers, timeout=15)
    # try permanent purge (superadmin) if endpoint exists
    for oid in TestVIP.created_ids:
        requests.delete(f"{API}/admin/orders/{oid}/purge", headers=super_headers, timeout=15)

    # Ensure sessions all closed + coming_soon ON
    for sid in [1, 2, 3, 4]:
        for tgt in ["public", "walkin"]:
            requests.post(f"{API}/admin/sessions/toggle",
                          json={"session_id": sid, "open": False, "target": tgt},
                          headers=super_headers, timeout=15)
    requests.post(f"{API}/admin/coming-soon", json={"enabled": True}, headers=super_headers, timeout=15)

    ev = requests.get(f"{API}/event", timeout=15).json()
    for s in ev["sessions"]:
        assert s.get("status") != "open"
        assert s.get("walkin_open") is False
