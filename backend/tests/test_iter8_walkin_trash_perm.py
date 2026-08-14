"""Iter 8 tests: dual session switches (public/walkin), soft-delete+restore, can_delete permission."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")


def _hdr(tok):
    return {"X-Admin-Token": tok, "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def super_token():
    r = requests.post(f"{BASE_URL}/api/admin/login", json={"username": "admin1", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin2_token():
    r = requests.post(f"{BASE_URL}/api/admin/login", json={"username": "admin2", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def initial_state():
    # snapshot current config so we can restore
    r = requests.get(f"{BASE_URL}/api/event")
    assert r.status_code == 200
    d = r.json()
    return {
        "coming_soon": d["coming_soon"],
        "open": [s["id"] for s in d["sessions"] if s["status"] in ("open", "full")],
        "walkin": [s["id"] for s in d["sessions"] if s.get("walkin_open")],
    }


def test_event_exposes_walkin_open_flag():
    r = requests.get(f"{BASE_URL}/api/event")
    assert r.status_code == 200
    for s in r.json()["sessions"]:
        assert "walkin_open" in s
        assert isinstance(s["walkin_open"], bool)


def test_toggle_public_vs_walkin_are_independent(super_token, initial_state):
    # Ensure sess 4 starts fully closed on both sides
    requests.post(f"{BASE_URL}/api/admin/sessions/toggle",
                  headers=_hdr(super_token), json={"session_id": 4, "open": False, "target": "public"})
    requests.post(f"{BASE_URL}/api/admin/sessions/toggle",
                  headers=_hdr(super_token), json={"session_id": 4, "open": False, "target": "walkin"})

    # Open walkin ONLY
    r = requests.post(f"{BASE_URL}/api/admin/sessions/toggle",
                      headers=_hdr(super_token),
                      json={"session_id": 4, "open": True, "target": "walkin"})
    assert r.status_code == 200
    assert 4 in r.json()["walkin_sessions"]

    ev = requests.get(f"{BASE_URL}/api/event").json()
    s4 = next(s for s in ev["sessions"] if s["id"] == 4)
    assert s4["walkin_open"] is True
    assert s4["status"] == "closed", f"expected public closed, got {s4['status']}"

    # Restore
    requests.post(f"{BASE_URL}/api/admin/sessions/toggle",
                  headers=_hdr(super_token), json={"session_id": 4, "open": False, "target": "walkin"})


def test_walkin_requires_walkin_open(super_token):
    # Ensure sess 4 walkin closed
    requests.post(f"{BASE_URL}/api/admin/sessions/toggle",
                  headers=_hdr(super_token), json={"session_id": 4, "open": False, "target": "walkin"})
    r = requests.post(f"{BASE_URL}/api/admin/walkin", headers=_hdr(super_token), json={
        "name": "TEST_walkin_gate", "phone": "", "session_id": 4,
        "seats": ["M3"], "payment_method": "cash", "amount": 60000,
    })
    assert r.status_code == 400
    assert "belum dibuka" in r.json()["detail"].lower() or "panitia" in r.json()["detail"].lower()


def test_walkin_success_when_walkin_open(super_token):
    # Open walkin for sesi 4
    requests.post(f"{BASE_URL}/api/admin/sessions/toggle",
                  headers=_hdr(super_token), json={"session_id": 4, "open": True, "target": "walkin"})
    try:
        r = requests.post(f"{BASE_URL}/api/admin/walkin", headers=_hdr(super_token), json={
            "name": "TEST_iter8_walkin", "phone": "0811999888", "session_id": 4,
            "seats": ["M4"], "payment_method": "cash", "amount": 60000,
        })
        assert r.status_code == 200, r.text
        oid = r.json()["id"]

        # Soft delete
        d = requests.delete(f"{BASE_URL}/api/admin/orders/{oid}", headers=_hdr(super_token))
        assert d.status_code == 200 and d.json()["deleted"] is True

        # Order no longer in main list
        lst = requests.get(f"{BASE_URL}/api/admin/orders", headers=_hdr(super_token)).json()
        assert not any(o["id"] == oid for o in lst)

        # Appears in trash
        tr = requests.get(f"{BASE_URL}/api/admin/orders/deleted", headers=_hdr(super_token))
        assert tr.status_code == 200
        assert any(o["id"] == oid for o in tr.json())

        # Restore
        rr = requests.post(f"{BASE_URL}/api/admin/orders/{oid}/restore", headers=_hdr(super_token))
        assert rr.status_code == 200
        assert rr.json().get("deleted") in (False, None)

        # Back in main list
        lst2 = requests.get(f"{BASE_URL}/api/admin/orders", headers=_hdr(super_token)).json()
        assert any(o["id"] == oid for o in lst2)

        # Cleanup: delete again
        requests.delete(f"{BASE_URL}/api/admin/orders/{oid}", headers=_hdr(super_token))
    finally:
        requests.post(f"{BASE_URL}/api/admin/sessions/toggle",
                      headers=_hdr(super_token), json={"session_id": 4, "open": False, "target": "walkin"})


def test_deleted_list_forbidden_for_non_super(admin2_token):
    r = requests.get(f"{BASE_URL}/api/admin/orders/deleted", headers=_hdr(admin2_token))
    assert r.status_code == 403


def test_restore_forbidden_for_non_super(admin2_token):
    r = requests.post(f"{BASE_URL}/api/admin/orders/fake-id/restore", headers=_hdr(admin2_token))
    assert r.status_code == 403


def test_can_delete_permission_flow(super_token, admin2_token):
    # admin2 default cannot delete: create+delete attempt via walkin then delete
    requests.post(f"{BASE_URL}/api/admin/sessions/toggle",
                  headers=_hdr(super_token), json={"session_id": 4, "open": True, "target": "walkin"})
    r = requests.post(f"{BASE_URL}/api/admin/walkin", headers=_hdr(super_token), json={
        "name": "TEST_perm_flow", "phone": "", "session_id": 4,
        "seats": ["M6"], "payment_method": "cash", "amount": 60000,
    })
    assert r.status_code == 200, r.text
    oid = r.json()["id"]

    # admin2 should be forbidden
    d = requests.delete(f"{BASE_URL}/api/admin/orders/{oid}", headers=_hdr(admin2_token))
    assert d.status_code == 403

    # Grant permission via superadmin: find admin2 id
    users = requests.get(f"{BASE_URL}/api/admin/users", headers=_hdr(super_token)).json()
    admin2 = next(u for u in users if u["username"] == "admin2")
    p = requests.post(f"{BASE_URL}/api/admin/users/{admin2['id']}/permission",
                      headers=_hdr(super_token), json={"can_delete": True})
    assert p.status_code == 200
    assert p.json()["can_delete"] is True

    # Now admin2 can delete
    d2 = requests.delete(f"{BASE_URL}/api/admin/orders/{oid}", headers=_hdr(admin2_token))
    assert d2.status_code == 200

    # Revoke permission
    p2 = requests.post(f"{BASE_URL}/api/admin/users/{admin2['id']}/permission",
                       headers=_hdr(super_token), json={"can_delete": False})
    assert p2.status_code == 200
    assert p2.json()["can_delete"] is False

    # Cleanup: close walkin sess 4 again
    requests.post(f"{BASE_URL}/api/admin/sessions/toggle",
                  headers=_hdr(super_token), json={"session_id": 4, "open": False, "target": "walkin"})


def test_final_restore_state(super_token, initial_state):
    """Restore original state — coming_soon + open sessions + walkin sessions to initial snapshot."""
    ev = requests.get(f"{BASE_URL}/api/event").json()
    # coming_soon
    if ev["coming_soon"] != initial_state["coming_soon"]:
        requests.post(f"{BASE_URL}/api/admin/coming-soon", headers=_hdr(super_token),
                      json={"enabled": initial_state["coming_soon"]})
    # sessions
    for sid in [1, 2, 3, 4, 5]:
        cur_pub = sid in [s["id"] for s in ev["sessions"] if s["status"] in ("open", "full")]
        want_pub = sid in initial_state["open"]
        if cur_pub != want_pub:
            requests.post(f"{BASE_URL}/api/admin/sessions/toggle", headers=_hdr(super_token),
                          json={"session_id": sid, "open": want_pub, "target": "public"})
        cur_wi = sid in [s["id"] for s in ev["sessions"] if s.get("walkin_open")]
        want_wi = sid in initial_state["walkin"]
        if cur_wi != want_wi:
            requests.post(f"{BASE_URL}/api/admin/sessions/toggle", headers=_hdr(super_token),
                          json={"session_id": sid, "open": want_wi, "target": "walkin"})
    assert True
