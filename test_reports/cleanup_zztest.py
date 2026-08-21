import os, requests
from dotenv import dotenv_values
BASE = (dotenv_values("/app/frontend/.env").get("REACT_APP_BACKEND_URL")).rstrip("/")
r = requests.post(f"{BASE}/api/admin/login", json={"username": "admin1", "password": "admin123"})
r.raise_for_status()
tok = r.json()["token"]
h = {"X-Admin-Token": tok}
res = requests.get(f"{BASE}/api/admin/orders", headers=h)
print("orders status", res.status_code)
data = res.json()
orders = data if isinstance(data, list) else data.get("orders", [])
print("total orders", len(orders))
targets = [o for o in orders if "ZZTEST" in (o.get("name") or "")]
print("zztest found", len(targets))
for o in targets:
    d = requests.delete(f"{BASE}/api/admin/manual/{o['id']}", headers=h)
    print(o.get("order_no"), o.get("name"), "->", d.status_code, d.text[:100])
res2 = requests.get(f"{BASE}/api/admin/orders", headers=h).json()
o2 = res2 if isinstance(res2, list) else res2.get("orders", [])
print("remaining zztest:", [x.get("order_no") for x in o2 if "ZZTEST" in (x.get("name") or "")])
