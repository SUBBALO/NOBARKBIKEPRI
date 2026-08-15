"""Iter15 backend tests: phone normalization on /api/orders + superadmin edit phone."""
import os
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE}/api"


def login(username, password):
    r = requests.post(f"{API}/admin/login", json={"username": username, "password": password}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def admin_headers(token):
    return {"X-Admin-Token": token, "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def super_token():
    return login("admin1", "admin123")


@pytest.fixture(scope="module")
def regular_token():
    return login("admin2", "admin123")


@pytest.fixture(scope="module")
def open_session():
    r = requests.get(f"{API}/event", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    for s in data["sessions"]:
        if s["status"] == "open":
            return s
    pytest.skip("No public-open session available")


def _find_free_seats(session_id, n=1, exclude=None):
    exclude = set(exclude or [])
    r = requests.get(f"{API}/sessions/{session_id}/seats", timeout=15).json()
    couples = r.get("couples", {}) or {}
    out = []
    for row in r["rows"]:
        for block in row.get("blocks", []):
            for cell in block:
                if (cell.get("status") == "available"
                        and not cell.get("couple")
                        and not cell.get("disability")
                        and cell["label"] not in couples
                        and cell["label"] not in exclude):
                    out.append(cell["label"])
                    if len(out) >= n:
                        return out
    return out


@pytest.fixture
def free_seat(open_session):
    seats = _find_free_seats(open_session["id"], 1)
    if not seats:
        pytest.skip("no free seat")
    return seats[0]


created_order_ids = []


def _cleanup():
    tok = login("admin1", "admin123")
    for oid in created_order_ids:
        try:
            requests.delete(f"{API}/admin/orders/{oid}", headers=admin_headers(tok), timeout=10)
        except Exception:
            pass


def test_phone_norm_starts_with_8(open_session, free_seat, super_token):
    payload = {
        "name": "TEST Phone8",
        "phone": "81275130165",
        "session_id": open_session["id"],
        "seats": [free_seat],
        "amount": 50000,
        "payment_method": "transfer",
    }
    r = requests.post(f"{API}/orders", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["phone"] == "081275130165"
    created_order_ids.append(data["id"])


def test_phone_norm_starts_with_62(open_session, super_token):
    seats = _find_free_seats(open_session["id"], 1)
    if not seats:
        pytest.skip("no free seat")
    payload = {
        "name": "TEST Phone62",
        "phone": "6281234567890",
        "session_id": open_session["id"],
        "seats": seats,
        "amount": 50000,
        "payment_method": "transfer",
    }
    r = requests.post(f"{API}/orders", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["phone"] == "081234567890"
    created_order_ids.append(data["id"])


def test_phone_invalid_400(open_session):
    payload = {
        "name": "TEST BadPhone",
        "phone": "12345",
        "session_id": open_session["id"],
        "seats": ["Z99"],
        "amount": 50000,
        "payment_method": "transfer",
    }
    r = requests.post(f"{API}/orders", json=payload, timeout=15)
    assert r.status_code == 400, r.text
    assert "08" in r.json().get("detail", "")


def test_super_edit_phone(super_token):
    # find an existing order to update
    r = requests.get(f"{API}/admin/orders", headers=admin_headers(super_token), timeout=15)
    assert r.status_code == 200
    orders = r.json()
    assert orders, "no orders in db"
    target = orders[0]
    original_phone = target["phone"]
    oid = target["id"]

    # Superadmin can edit + normalizes
    r = requests.put(f"{API}/admin/orders/{oid}/phone",
                     json={"phone": "81299887766"},
                     headers=admin_headers(super_token), timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["phone"] == "081299887766"

    # Invalid => 400
    r = requests.put(f"{API}/admin/orders/{oid}/phone",
                     json={"phone": "abc"},
                     headers=admin_headers(super_token), timeout=15)
    assert r.status_code == 400

    # Restore
    requests.put(f"{API}/admin/orders/{oid}/phone",
                 json={"phone": original_phone},
                 headers=admin_headers(super_token), timeout=15)


def test_non_super_edit_phone_403(super_token, regular_token):
    r = requests.get(f"{API}/admin/orders", headers=admin_headers(super_token), timeout=15)
    oid = r.json()[0]["id"]
    r = requests.put(f"{API}/admin/orders/{oid}/phone",
                     json={"phone": "081211112222"},
                     headers=admin_headers(regular_token), timeout=15)
    assert r.status_code == 403


def test_verify_activity_logged(super_token):
    r = requests.get(f"{API}/admin/logs", headers=admin_headers(super_token), timeout=15)
    assert r.status_code == 200
    logs = r.json()
    assert any(l.get("action") == "verify" and "No HP" in (l.get("detail") or "") for l in logs[:50])


def teardown_module(module):
    _cleanup()
