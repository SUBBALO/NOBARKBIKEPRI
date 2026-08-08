"""Iteration 3 tests: auth login, role gating, user mgmt, activity logs, delete order,
lookup privacy masking, active session order."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def _hdr(token):
    return {"X-Admin-Token": token, "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def tokens():
    out = {}
    for u in ("admin1", "admin2", "admin3"):
        r = requests.post(f"{API}/admin/login", json={"username": u, "password": "admin123"}, timeout=15)
        assert r.status_code == 200, f"login {u} failed: {r.status_code} {r.text}"
        j = r.json()
        assert "token" in j and "user" in j
        out[u] = j
    return out


# ---------- AUTH LOGIN ----------
def test_login_superadmin_shape(tokens):
    j = tokens["admin1"]
    assert j["user"]["username"] == "admin1"
    assert j["user"]["role"] == "superadmin"
    assert "role_label" in j["user"]
    assert isinstance(j["token"], str) and len(j["token"]) > 20


def test_login_wrong_password():
    r = requests.post(f"{API}/admin/login", json={"username": "admin1", "password": "wrong"}, timeout=15)
    assert r.status_code == 401


def test_admin_me(tokens):
    r = requests.get(f"{API}/admin/me", headers=_hdr(tokens["admin1"]["token"]), timeout=15)
    assert r.status_code == 200
    assert r.json()["role"] == "superadmin"


# ---------- ROLE GATING ----------
def test_checkin_role_forbidden_users(tokens):
    r = requests.get(f"{API}/admin/users", headers=_hdr(tokens["admin3"]["token"]), timeout=15)
    assert r.status_code == 403


def test_checkin_role_forbidden_orders(tokens):
    r = requests.get(f"{API}/admin/orders", headers=_hdr(tokens["admin3"]["token"]), timeout=15)
    assert r.status_code == 403


def test_checkin_role_allowed_participants(tokens):
    r = requests.get(f"{API}/admin/participants", headers=_hdr(tokens["admin3"]["token"]), timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_admin_role_forbidden_users(tokens):
    r = requests.get(f"{API}/admin/users", headers=_hdr(tokens["admin2"]["token"]), timeout=15)
    assert r.status_code == 403


def test_superadmin_users_ok(tokens):
    r = requests.get(f"{API}/admin/users", headers=_hdr(tokens["admin1"]["token"]), timeout=15)
    assert r.status_code == 200
    unames = [u["username"] for u in r.json()]
    for u in ("admin1", "admin2", "admin3"):
        assert u in unames


def test_no_token_401():
    r = requests.get(f"{API}/admin/users", timeout=15)
    assert r.status_code == 401


# ---------- USER MANAGEMENT ----------
def test_user_create_and_delete(tokens):
    tk = tokens["admin1"]["token"]
    uname = f"test_{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{API}/admin/users", headers=_hdr(tk),
                      json={"username": uname, "password": "test1234", "name": "Test User", "role": "checkin"},
                      timeout=15)
    assert r.status_code == 200, r.text
    new_id = r.json()["id"]
    assert r.json()["username"] == uname
    assert r.json()["role"] == "checkin"

    # Verify list
    r2 = requests.get(f"{API}/admin/users", headers=_hdr(tk), timeout=15)
    assert any(u["id"] == new_id for u in r2.json())

    # Login as new user works
    rl = requests.post(f"{API}/admin/login", json={"username": uname, "password": "test1234"}, timeout=15)
    assert rl.status_code == 200

    # Delete
    rd = requests.delete(f"{API}/admin/users/{new_id}", headers=_hdr(tk), timeout=15)
    assert rd.status_code == 200

    # Verify gone
    r3 = requests.get(f"{API}/admin/users", headers=_hdr(tk), timeout=15)
    assert not any(u["id"] == new_id for u in r3.json())


def test_user_create_duplicate(tokens):
    tk = tokens["admin1"]["token"]
    r = requests.post(f"{API}/admin/users", headers=_hdr(tk),
                      json={"username": "admin1", "password": "abcd1234", "role": "checkin"}, timeout=15)
    assert r.status_code == 409


def test_admin_cannot_create_user(tokens):
    r = requests.post(f"{API}/admin/users", headers=_hdr(tokens["admin2"]["token"]),
                      json={"username": "shouldfail", "password": "abcd", "role": "checkin"}, timeout=15)
    assert r.status_code == 403


# ---------- ACTIVITY LOGS ----------
def test_logs_accessible_by_staff(tokens):
    r1 = requests.get(f"{API}/admin/logs", headers=_hdr(tokens["admin1"]["token"]), timeout=15)
    assert r1.status_code == 200
    assert isinstance(r1.json(), list)
    r2 = requests.get(f"{API}/admin/logs", headers=_hdr(tokens["admin2"]["token"]), timeout=15)
    assert r2.status_code == 200


def test_logs_forbidden_checkin(tokens):
    r = requests.get(f"{API}/admin/logs", headers=_hdr(tokens["admin3"]["token"]), timeout=15)
    assert r.status_code == 403


def test_logs_records_user_actions(tokens):
    tk = tokens["admin1"]["token"]
    uname = f"logtest_{uuid.uuid4().hex[:5]}"
    rc = requests.post(f"{API}/admin/users", headers=_hdr(tk),
                       json={"username": uname, "password": "test1234", "role": "checkin"}, timeout=15)
    uid = rc.json()["id"]
    requests.delete(f"{API}/admin/users/{uid}", headers=_hdr(tk), timeout=15)
    logs = requests.get(f"{API}/admin/logs", headers=_hdr(tk), timeout=15).json()
    actions = [(l["actor_username"], l["action"], l.get("detail", "")) for l in logs[:30]]
    assert any(a[1] == "user_create" and uname in a[2] for a in actions), f"missing user_create log: {actions[:5]}"
    assert any(a[1] == "user_delete" and uname in a[2] for a in actions), f"missing user_delete log"


# ---------- ACTIVE SESSION ORDER ----------
def test_event_active_session_is_1_when_not_full():
    r = requests.get(f"{API}/event", timeout=15)
    assert r.status_code == 200
    j = r.json()
    # Sesi 1 must be active as long as it has any free seat
    s1 = next(s for s in j["sessions"] if s["id"] == 1)
    if s1["booked"] < s1["capacity"]:
        assert j["active_session"] == 1, f"Expected active_session=1 but got {j['active_session']}, s1 booked={s1['booked']}"
        assert s1["status"] == "open"
        for other in j["sessions"]:
            if other["id"] > 1 and s1["booked"] < s1["capacity"]:
                assert other["status"] == "locked"


# ---------- DELETE ORDER ----------
def test_delete_order_flow(tokens):
    tk = tokens["admin1"]["token"]
    # Create test order
    ev = requests.get(f"{API}/event", timeout=15).json()
    active = ev["active_session"]
    seats_resp = requests.get(f"{API}/sessions/{active}/seats", timeout=15).json()
    free = []
    for row in seats_resp["rows"]:
        for s in row["seats"]:
            if s["status"] == "available":
                free.append(s["label"])
        if free:
            break
    assert free, "no free seats to test delete"
    chosen = [free[0]]
    payload = {"name": "TEST_delete_me", "phone": f"0812{uuid.uuid4().hex[:8]}",
               "session_id": active, "seats": chosen, "payment_method": "transfer"}
    rc = requests.post(f"{API}/orders", json=payload, timeout=15)
    assert rc.status_code == 200, rc.text
    oid = rc.json()["id"]

    # Delete
    rd = requests.delete(f"{API}/admin/orders/{oid}", headers=_hdr(tk), timeout=15)
    assert rd.status_code == 200
    assert rd.json()["deleted"] is True

    # Verify gone
    rget = requests.get(f"{API}/orders/{oid}", timeout=15)
    assert rget.status_code == 404

    # Verify log entry
    logs = requests.get(f"{API}/admin/logs", headers=_hdr(tk), timeout=15).json()
    assert any(l["action"] == "delete" and oid == l.get("target_id") for l in logs[:30])


def test_delete_order_forbidden_checkin(tokens):
    # attempt as checkin role
    r = requests.delete(f"{API}/admin/orders/nonexistent", headers=_hdr(tokens["admin3"]["token"]), timeout=15)
    assert r.status_code == 403


# ---------- UPLOAD PROOF PRIVACY (LOOKUP MASKING) ----------
def test_lookup_masks_name_and_no_seats(tokens):
    tk = tokens["admin1"]["token"]
    # Create test order with distinctive name
    ev = requests.get(f"{API}/event", timeout=15).json()
    active = ev["active_session"]
    seats_resp = requests.get(f"{API}/sessions/{active}/seats", timeout=15).json()
    free = None
    for row in seats_resp["rows"]:
        for s in row["seats"]:
            if s["status"] == "available":
                free = s["label"]; break
        if free: break
    assert free
    phone = f"0899{uuid.uuid4().hex[:8]}"
    payload = {"name": "Sutrisno Wibowo", "phone": phone,
               "session_id": active, "seats": [free], "payment_method": "qris"}
    rc = requests.post(f"{API}/orders", json=payload, timeout=15)
    assert rc.status_code == 200
    oid = rc.json()["id"]

    r = requests.get(f"{API}/orders/lookup", params={"phone": phone}, timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert len(j["orders"]) >= 1
    o = j["orders"][0]
    assert "seats" not in o, f"lookup must not expose seats, got: {list(o.keys())}"
    # name should be masked: 'S*******o W*****o' or similar - not equal to original
    assert o["name"] != "Sutrisno Wibowo"
    assert o["name"].startswith("S") and "*" in o["name"]
    assert "qty" in o
    assert "order_no" in o

    # cleanup
    requests.delete(f"{API}/admin/orders/{oid}", headers=_hdr(tk), timeout=15)
