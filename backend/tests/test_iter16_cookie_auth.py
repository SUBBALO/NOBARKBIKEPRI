"""Iteration 16: httpOnly cookie auth migration tests."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://qris-payment-7.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _login(username="admin1", password="admin123"):
    s = requests.Session()
    r = s.post(f"{API}/admin/login", json={"username": username, "password": password}, timeout=15)
    return s, r


# --- Cookie auth flow ---
def test_login_sets_httponly_cookie():
    s, r = _login()
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and "user" in data
    # cookie present
    assert "admin_token" in s.cookies, f"cookies={s.cookies.get_dict()}"
    # httpOnly attr check from raw Set-Cookie header
    set_cookie = r.headers.get("set-cookie", "").lower()
    assert "admin_token=" in set_cookie
    assert "httponly" in set_cookie
    assert "secure" in set_cookie


def test_me_and_stats_with_cookie_only():
    s, r = _login()
    assert r.status_code == 200
    # no header, cookie only
    me = s.get(f"{API}/admin/me", timeout=15)
    assert me.status_code == 200, me.text
    assert me.json().get("username") == "admin1"

    stats = s.get(f"{API}/admin/stats", timeout=15)
    assert stats.status_code == 200, stats.text
    assert isinstance(stats.json(), dict)


def test_logout_clears_cookie_and_401():
    s, r = _login()
    assert r.status_code == 200
    lo = s.post(f"{API}/admin/logout", timeout=15)
    assert lo.status_code == 200
    # After logout, cookie should be gone/expired; requests session may retain empty val
    me = s.get(f"{API}/admin/me", timeout=15)
    assert me.status_code == 401, me.text


def test_header_fallback_still_works():
    # login to get token but drop cookies, use header only
    _, r = _login()
    assert r.status_code == 200
    token = r.json()["token"]
    fresh = requests.Session()  # no cookies
    me = fresh.get(f"{API}/admin/me", headers={"X-Admin-Token": token}, timeout=15)
    assert me.status_code == 200, me.text


def test_no_credentials_returns_401():
    r = requests.get(f"{API}/admin/me", timeout=15)
    assert r.status_code == 401


def test_walkin_and_checkin_role_login():
    _, r1 = _login("chelyn", "Chelyn123456")
    assert r1.status_code == 200
    _, r2 = _login("admin3", "admin123")
    assert r2.status_code == 200


# --- Regression: authenticated admin endpoints work via cookie ---
def test_regression_admin_endpoints_via_cookie():
    s, r = _login()
    assert r.status_code == 200
    for path in ["/admin/orders", "/admin/stats", "/admin/users", "/admin/logs", "/admin/bendahara"]:
        resp = s.get(f"{API}{path}", timeout=15)
        assert resp.status_code == 200, f"{path} -> {resp.status_code} {resp.text[:200]}"
