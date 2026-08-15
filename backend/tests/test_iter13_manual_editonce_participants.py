"""Iteration 13 backend tests: Order Manual, verified-amount edit-once, masterlist export type=manual, participants channel."""
import os
import requests
import pytest
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")


def _login(username, password):
    r = requests.post(f"{BASE_URL}/api/admin/login",
                      json={"username": username, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {username} failed: {r.status_code} {r.text}"
    return r.json()["token"]


def _h(token):
    return {"X-Admin-Token": token, "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def tokens():
    return {
        "super": _login("admin1", "admin123"),      # superadmin
        "admin": _login("admin2", "admin123"),      # admin (no can_delete)
        "chelyn": _login("chelyn", "Chelyn123456"), # admin can_delete
        "checkin": _login("admin3", "admin123"),    # checkin only
    }


@pytest.fixture(scope="module")
def seller_token(tokens):
    """Create ephemeral seller user + login. Cleanup at end."""
    uname = "TEST_seller_iter13"
    # try to create; if exists, ignore
    r = requests.post(f"{BASE_URL}/api/admin/users",
                      json={"username": uname, "password": "seller123", "name": "TEST Seller",
                            "role": "seller", "can_delete": False},
                      headers=_h(tokens["super"]), timeout=15)
    # 200 create or 400 exists — either ok
    tok = _login(uname, "seller123")
    yield tok
    # cleanup
    users = requests.get(f"{BASE_URL}/api/admin/users", headers=_h(tokens["super"])).json()
    for u in users:
        if u.get("username") == uname:
            requests.delete(f"{BASE_URL}/api/admin/users/{u['id']}", headers=_h(tokens["super"]))


def _fetch_taken(session_id=1):
    r = requests.get(f"{BASE_URL}/api/sessions/{session_id}/seats", timeout=15)
    r.raise_for_status()
    data = r.json()
    taken = set()
    for row in data.get("rows", []):
        for blk in row.get("blocks", []):
            for s in blk:
                if s.get("status") == "booked":
                    taken.add(s.get("label"))
    return taken


@pytest.fixture(scope="module")
def available_seats():
    taken = _fetch_taken(1)
    reserved = {"A11", "A12"}
    disability = {"K10", "K8"}
    # Only use single seats (not couples). Rows E-J typically. Numbers valid per SEAT_LAYOUT.
    valid_nums_ehj = [21, 20, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 4, 3]
    pool = []
    for row in ["E", "F", "G", "H", "J", "D", "C"]:
        for i in valid_nums_ehj:
            s = f"{row}{i}"
            if s in taken or s in reserved or s in disability:
                continue
            pool.append(s)
    assert len(pool) >= 15, f"not enough free seats. pool={pool[:20]}"
    return pool


# =============== ORDER MANUAL ===============

class TestOrderManual:
    created_ids = []
    created_nos = []

    def test_create_unpaid_by_chelyn(self, tokens, available_seats):
        seats = available_seats[:2]
        r = requests.post(f"{BASE_URL}/api/admin/manual",
                          json={"name": "TEST_Manual_Unpaid", "phone": "0812", "session_id": 1,
                                "seats": seats, "amount": 100000, "paid": False},
                          headers=_h(tokens["chelyn"]), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "manual_unpaid"
        assert d["manual"] is True
        assert d["paid"] is False
        assert d["seats"] == seats
        assert d["total_amount"] == 100000  # order_amount stored as total_amount too when unpaid
        TestOrderManual.created_ids.append(d["id"])
        TestOrderManual.created_nos.append(d["order_no"])

    def test_unpaid_not_in_bendahara(self, tokens):
        r = requests.get(f"{BASE_URL}/api/admin/bendahara", headers=_h(tokens["super"]), timeout=15)
        assert r.status_code == 200
        orders = r.json().get("orders", [])
        ono = TestOrderManual.created_nos[0]
        assert not any(o.get("order_no") == ono for o in orders), "unpaid manual should NOT appear in bendahara"

    def test_seats_locked(self, tokens, available_seats):
        taken = _fetch_taken(1)
        for s in available_seats[:2]:
            assert s in taken, f"seat {s} should be locked after manual create"

    def test_list_manual_includes(self, tokens):
        r = requests.get(f"{BASE_URL}/api/admin/manual", headers=_h(tokens["admin"]), timeout=15)
        assert r.status_code == 200
        ids = [o["id"] for o in r.json()]
        assert TestOrderManual.created_ids[0] in ids

    def test_update_to_paid_uses_transfer_amount(self, tokens):
        oid = TestOrderManual.created_ids[0]
        r = requests.put(f"{BASE_URL}/api/admin/manual/{oid}",
                         json={"paid": True, "transfer_date": "2026-01-15", "transfer_amount": 98000},
                         headers=_h(tokens["chelyn"]), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "verified"
        assert d["paid"] is True
        assert d["transfer_amount"] == 98000
        assert d["total_amount"] == 98000

    def test_paid_counted_in_bendahara(self, tokens):
        r = requests.get(f"{BASE_URL}/api/admin/bendahara", headers=_h(tokens["super"]), timeout=15)
        orders = r.json().get("orders", [])
        ono = TestOrderManual.created_nos[0]
        found = next((o for o in orders if o.get("order_no") == ono), None)
        assert found is not None, "paid manual should appear in bendahara"
        assert found.get("channel") == "manual"
        assert found.get("amount") == 98000

    def test_participants_includes_manual_with_channel(self, tokens):
        r = requests.get(f"{BASE_URL}/api/admin/participants", headers=_h(tokens["super"]), timeout=15)
        assert r.status_code == 200
        parts = r.json()
        oid = TestOrderManual.created_ids[0]
        found = next((p for p in parts if p.get("id") == oid), None)
        assert found is not None, "paid manual should appear in participants"
        assert found.get("channel") == "manual"
        # Also assert at least one channel per each expected type field exists
        chans = {p.get("channel") for p in parts}
        # 'umum' should be present in most cases; not enforcing vip presence here
        assert "manual" in chans

    def test_seller_forbidden_manual(self, seller_token, available_seats):
        r = requests.post(f"{BASE_URL}/api/admin/manual",
                          json={"name": "X", "session_id": 1, "seats": [available_seats[5]], "amount": 50000},
                          headers=_h(seller_token), timeout=15)
        assert r.status_code == 403, r.text
        r2 = requests.get(f"{BASE_URL}/api/admin/manual", headers=_h(seller_token), timeout=15)
        assert r2.status_code == 403

    def test_checkin_forbidden_manual(self, tokens, available_seats):
        r = requests.post(f"{BASE_URL}/api/admin/manual",
                          json={"name": "X", "session_id": 1, "seats": [available_seats[5]], "amount": 50000},
                          headers=_h(tokens["checkin"]), timeout=15)
        assert r.status_code == 403

    def test_unlimited_seats_allowed(self, tokens):
        # Fetch fresh available seats since earlier seats are already locked
        taken = _fetch_taken(1)
        reserved = {"A11", "A12"}
        disability = {"K10", "K8"}
        valid_nums = [21, 20, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 4, 3]
        pool = []
        for row in ["J", "H", "G", "F", "E", "D", "C"]:
            for i in valid_nums:
                s = f"{row}{i}"
                if s in taken or s in reserved or s in disability:
                    continue
                pool.append(s)
                if len(pool) >= 8:
                    break
            if len(pool) >= 8:
                break
        seats = pool[:8]
        assert len(seats) == 8
        r = requests.post(f"{BASE_URL}/api/admin/manual",
                          json={"name": "TEST_Manual_Bulk", "session_id": 1, "seats": seats,
                                "amount": 400000, "paid": False},
                          headers=_h(tokens["chelyn"]), timeout=15)
        assert r.status_code == 200, r.text
        TestOrderManual.created_ids.append(r.json()["id"])
        TestOrderManual.created_nos.append(r.json()["order_no"])

    def test_delete_by_admin_no_perm_forbidden(self, tokens):
        oid = TestOrderManual.created_ids[-1]
        r = requests.delete(f"{BASE_URL}/api/admin/orders/{oid}",
                            headers=_h(tokens["admin"]), timeout=15)
        assert r.status_code == 403

    def test_delete_by_chelyn_ok_soft_deletes(self, tokens):
        # delete both created manual orders
        for oid in TestOrderManual.created_ids:
            r = requests.delete(f"{BASE_URL}/api/admin/orders/{oid}",
                                headers=_h(tokens["chelyn"]), timeout=15)
            assert r.status_code == 200, r.text
            assert r.json().get("deleted") is True
        # Verify not in list_manual
        r = requests.get(f"{BASE_URL}/api/admin/manual", headers=_h(tokens["super"]), timeout=15)
        ids = [o["id"] for o in r.json()]
        for oid in TestOrderManual.created_ids:
            assert oid not in ids


# =============== MASTERLIST EXPORT ===============

class TestMasterlistExport:
    def test_export_manual_ok(self, tokens):
        r = requests.get(f"{BASE_URL}/api/admin/masterlist/export?type=manual",
                         headers={"X-Admin-Token": tokens["super"]}, timeout=20)
        assert r.status_code == 200
        assert r.content[:2] == b"PK"

    def test_export_vip_ok(self, tokens):
        r = requests.get(f"{BASE_URL}/api/admin/masterlist/export?type=vip",
                         headers={"X-Admin-Token": tokens["super"]}, timeout=20)
        assert r.status_code == 200
        assert r.content[:2] == b"PK"

    def test_export_umum_ok(self, tokens):
        r = requests.get(f"{BASE_URL}/api/admin/masterlist/export?type=umum",
                         headers={"X-Admin-Token": tokens["super"]}, timeout=20)
        assert r.status_code == 200
        assert r.content[:2] == b"PK"

    def test_export_invalid_type(self, tokens):
        r = requests.get(f"{BASE_URL}/api/admin/masterlist/export?type=bogus",
                         headers={"X-Admin-Token": tokens["super"]}, timeout=15)
        assert r.status_code == 400


# =============== VERIFIED-AMOUNT EDIT ONCE ===============

class TestEditOnce:
    order_id = None
    order_id_2 = None

    def _create_order(self, amount=60000):
        taken = _fetch_taken(1)
        seat = None
        for row in ["M", "L", "J", "H", "G", "F", "E"]:
            for i in [21, 20, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 4, 3]:
                s = f"{row}{i}"
                if s not in taken and s not in {"A11", "A12", "K10", "K8"}:
                    seat = s
                    break
            if seat:
                break
        assert seat is not None
        r = requests.post(f"{BASE_URL}/api/orders",
                          json={"name": "TEST_EditOnce", "phone": "0813",
                                "session_id": 1, "seats": [seat], "amount": amount,
                                "payment_method": "transfer"}, timeout=15)
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def test_setup_verified_order(self, tokens):
        oid = self._create_order()
        TestEditOnce.order_id = oid
        # Verify by admin2 with same amount (no adjustment => should NOT consume flag)
        r = requests.post(f"{BASE_URL}/api/admin/orders/{oid}/verify",
                          json={}, headers=_h(tokens["admin"]), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "verified"
        assert d.get("verified_by")

    def test_admin_can_set_amount_once(self, tokens):
        oid = TestEditOnce.order_id
        r = requests.post(f"{BASE_URL}/api/admin/orders/{oid}/set-amount",
                          json={"amount": 55000}, headers=_h(tokens["admin"]), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["total_amount"] == 55000
        assert d.get("amount_edited_once") is True

    def test_admin_second_edit_blocked(self, tokens):
        oid = TestEditOnce.order_id
        r = requests.post(f"{BASE_URL}/api/admin/orders/{oid}/set-amount",
                          json={"amount": 50000}, headers=_h(tokens["admin"]), timeout=15)
        assert r.status_code == 403, r.text
        assert "Nominal sudah pernah diedit" in r.text

    def test_superadmin_unlimited(self, tokens):
        oid = TestEditOnce.order_id
        for amt in (52000, 51000, 50000):
            r = requests.post(f"{BASE_URL}/api/admin/orders/{oid}/set-amount",
                              json={"amount": amt}, headers=_h(tokens["super"]), timeout=15)
            assert r.status_code == 200, r.text
            assert r.json()["total_amount"] == amt

    def test_verify_with_adjustment_does_not_consume_flag(self, tokens):
        # New order, verified with amount adjustment. Then admin should still have edit-once available.
        oid = self._create_order(amount=70000)
        TestEditOnce.order_id_2 = oid
        r = requests.post(f"{BASE_URL}/api/admin/orders/{oid}/verify",
                          json={"amount": 68000}, headers=_h(tokens["admin"]), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["total_amount"] == 68000
        assert d.get("amount_adjusted") is True
        # admin still allowed to set-amount once
        r2 = requests.post(f"{BASE_URL}/api/admin/orders/{oid}/set-amount",
                           json={"amount": 66000}, headers=_h(tokens["admin"]), timeout=15)
        assert r2.status_code == 200, r2.text
        assert r2.json().get("amount_edited_once") is True

    def test_cleanup(self, tokens):
        for oid in (TestEditOnce.order_id, TestEditOnce.order_id_2):
            if oid:
                requests.delete(f"{BASE_URL}/api/admin/orders/{oid}",
                                headers=_h(tokens["super"]), timeout=15)


# =============== REGRESSION ===============

class TestRegression:
    def test_event(self):
        r = requests.get(f"{BASE_URL}/api/event", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "sessions" in d

    def test_duplicate_seat_409(self, tokens):
        # find a locked seat (any taken)
        r = requests.get(f"{BASE_URL}/api/sessions/1/seats", timeout=15)
        taken = r.json().get("taken", [])
        if not taken:
            # create one then test
            r2 = requests.get(f"{BASE_URL}/api/sessions/1/seats", timeout=15)
            free_seat = None
            for row in ["M", "L"]:
                for i in range(1, 22):
                    s = f"{row}{i}"
                    if s not in taken:
                        free_seat = s
                        break
                if free_seat:
                    break
            r3 = requests.post(f"{BASE_URL}/api/orders",
                               json={"name": "TEST_Dup", "phone": "0", "session_id": 1,
                                     "seats": [free_seat], "amount": 50000,
                                     "payment_method": "transfer"}, timeout=15)
            assert r3.status_code == 200
            dup_oid = r3.json()["id"]
            taken = [free_seat]
        else:
            dup_oid = None
        s = taken[0]
        r4 = requests.post(f"{BASE_URL}/api/orders",
                           json={"name": "TEST_Dup2", "phone": "0", "session_id": 1,
                                 "seats": [s], "amount": 50000,
                                 "payment_method": "transfer"}, timeout=15)
        assert r4.status_code == 409
        if dup_oid:
            requests.delete(f"{BASE_URL}/api/admin/orders/{dup_oid}", headers=_h(tokens["super"]))
