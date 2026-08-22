"""Iteration 26 — auth hardening checks: bcrypt format, httpOnly cookie, brute-force lockout."""
import os
import asyncio

import pytest
import requests
from dotenv import dotenv_values

fe = dotenv_values("/app/frontend/.env")
BASE = (os.environ.get("REACT_APP_BACKEND_URL") or fe.get("REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE}/api"


def test_login_sets_httponly_cookie():
    s = requests.Session()
    r = s.post(f"{API}/admin/login", json={"username": "admin1", "password": "admin123"}, timeout=30)
    assert r.status_code == 200, r.text
    raw = r.headers.get("set-cookie", "")
    assert "admin_token" in raw, f"no admin_token cookie: {raw}"
    low = raw.lower()
    assert "httponly" in low, f"cookie not HttpOnly: {raw}"
    assert "secure" in low, f"cookie not Secure: {raw}"


def test_cookie_only_auth_works():
    s = requests.Session()
    r = s.post(f"{API}/admin/login", json={"username": "admin1", "password": "admin123"}, timeout=30)
    assert r.status_code == 200
    # no X-Admin-Token header, rely on cookie jar
    r2 = s.get(f"{API}/admin/orders", timeout=30)
    assert r2.status_code == 200, f"cookie auth failed: {r2.status_code} {r2.text[:200]}"


def test_bcrypt_hash_format_in_db():
    from motor.motor_asyncio import AsyncIOMotorClient
    env = dotenv_values("/app/backend/.env")
    async def main():
        c = AsyncIOMotorClient(env["MONGO_URL"])
        db = c[env["DB_NAME"]]
        u = await db.admin_users.find_one({"username": "admin1"})
        return u
    u = asyncio.run(main())
    assert u, "admin1 not seeded"
    h = u.get("password_hash") or u.get("password")
    assert isinstance(h, str) and h.startswith("$2b$"), f"unexpected hash prefix: {str(h)[:6]}"


def test_bruteforce_lockout():
    uname = "zzlockuser"
    codes = []
    for _ in range(7):
        r = requests.post(f"{API}/admin/login", json={"username": uname, "password": "bad"}, timeout=30)
        codes.append(r.status_code)
    assert 429 in codes, f"no lockout after repeated failures: {codes}"
    # admin1 must remain usable (lock is per IP+username)
    ok = requests.post(f"{API}/admin/login", json={"username": "admin1", "password": "admin123"}, timeout=30)
    assert ok.status_code == 200, f"valid login broken after lockout test: {ok.status_code}"
