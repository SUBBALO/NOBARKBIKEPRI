"""Iteration 14 backend regression tests: channel labels, masterlist exports, participants."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://qris-payment-7.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/admin/login", json={"username": "admin1", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture
def admin_headers(admin_token):
    return {"X-Admin-Token": admin_token}


def test_bendahara_recap_channel_labels(admin_headers):
    r = requests.get(f"{BASE_URL}/api/admin/bendahara", headers=admin_headers)
    assert r.status_code == 200, r.text
    data = r.json()
    # find orders and inspect labels
    orders = data.get("orders", []) if isinstance(data, dict) else data
    labels = {o.get("channel_label") for o in orders if isinstance(o, dict) and o.get("channel_label")}
    print("channel_labels seen:", labels)
    allowed_prefixes = {"Website", "VIP", "Panitia", "Manual"}
    # every label present must match one of the allowed prefixes
    for lbl in labels:
        assert any(lbl == p or lbl.startswith(p) for p in allowed_prefixes), f"Unexpected label {lbl}"
    # Should NOT contain legacy 'Umum'
    for lbl in labels:
        assert "Umum" not in lbl, f"Legacy 'Umum' label found: {lbl}"


def test_masterlist_export_umum(admin_headers):
    r = requests.get(f"{BASE_URL}/api/admin/masterlist/export", params={"type": "umum"}, headers=admin_headers)
    assert r.status_code == 200, r.text
    assert "spreadsheet" in r.headers.get("content-type", "").lower() or r.headers.get("content-type", "").startswith("application/vnd.openxml")


def test_masterlist_export_manual(admin_headers):
    r = requests.get(f"{BASE_URL}/api/admin/masterlist/export", params={"type": "manual"}, headers=admin_headers)
    assert r.status_code == 200
    assert len(r.content) > 100


def test_masterlist_export_vip(admin_headers):
    r = requests.get(f"{BASE_URL}/api/admin/masterlist/export", params={"type": "vip"}, headers=admin_headers)
    assert r.status_code == 200
    assert len(r.content) > 100


def test_participants_returns_channel(admin_headers):
    r = requests.get(f"{BASE_URL}/api/admin/participants", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else data.get("participants") or data.get("items") or []
    assert len(items) > 0, "Expected participants"
    # find a verified order and check channel field exists
    channels_seen = {p.get("channel") for p in items if isinstance(p, dict)}
    print("channels:", channels_seen)
    assert any("channel" in p for p in items if isinstance(p, dict))


def test_event_endpoint():
    r = requests.get(f"{BASE_URL}/api/event")
    assert r.status_code == 200


def test_verified_order_available(admin_headers):
    """Fetch a verified order id for frontend testing."""
    r = requests.get(f"{BASE_URL}/api/admin/participants", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()
    if isinstance(items, dict):
        items = items.get("participants") or items.get("items") or []
    verified = [p for p in items if isinstance(p, dict) and (p.get("status") == "verified" or p.get("verified"))]
    print(f"Verified count: {len(verified)}")
    if verified:
        print("Sample verified order id:", verified[0].get("order_id") or verified[0].get("id"))
