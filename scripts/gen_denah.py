import os, requests
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, FancyBboxPatch
from matplotlib.lines import Line2D

API = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001") + "/api"

SESSIONS = [
    {"id": 1, "name": "SESI 1", "time": "09.30 – 11.30 WIB"},
    {"id": 2, "name": "SESI 2", "time": "12.00 – 14.00 WIB"},
    {"id": 3, "name": "SESI 3", "time": "14.30 – 16.30 WIB"},
    {"id": 4, "name": "SESI 4", "time": "17.00 – 19.00 WIB"},
]

# warna
C_AVAIL = "#FFFFFF"; C_AVAIL_BD = "#B0B7C3"
C_BOOKED = "#9CA3AF"; C_BOOKED_BD = "#6B7280"
C_OPER = "#1F2937"; C_OPER_BD = "#111827"
C_DIS = "#10B981"; C_DIS_BD = "#059669"
C_COUPLE = "#F9A8D4"; C_COUPLE_BD = "#DB2777"
MAROON = "#7A241F"


def seat_colors(s):
    if s["status"] == "reserved":
        return C_OPER, C_OPER_BD, "#FFFFFF"
    if s.get("disability"):
        return C_DIS, C_DIS_BD, "#FFFFFF"
    if s["status"] == "booked":
        return C_BOOKED, C_BOOKED_BD, "#FFFFFF"
    if s.get("couple"):
        return C_COUPLE, C_COUPLE_BD, "#831843"
    return C_AVAIL, C_AVAIL_BD, "#374151"


def draw(session, data, out):
    rows = data.get("rows", [])
    capacity = data.get("capacity", 0)
    booked = data.get("booked", 0)
    sisa = max(0, capacity - booked)

    # kolom global
    nums = [int(s["label"][len(r["row"]):]) for r in rows for b in r["blocks"] for s in b]
    maxN = max(nums); minN = min(nums)
    ncols = maxN - minN + 1
    nrows = len(rows)

    cw = 1.0  # cell width
    ch = 1.0
    gap = 0.12
    left_pad = 1.4

    fig_w = 15.5
    fig_h = 9.2
    fig, ax = plt.subplots(figsize=(fig_w, fig_h))
    ax.set_xlim(0, ncols * (cw) + left_pad * 2)
    total_rows_h = nrows + 3  # + aisle + layar
    ax.set_ylim(0, total_rows_h + 4)
    ax.axis("off")

    top = total_rows_h + 3.4

    # Judul besar
    ax.text(left_pad, top + 0.15, session["name"], fontsize=34, fontweight="bold", color=MAROON, va="center", ha="left")
    ax.text(left_pad, top - 0.85, session["time"], fontsize=20, fontweight="bold", color="#8A3A12", va="center", ha="left")
    # kanan: acara
    xr = ncols * cw + left_pad * 2 - 0.2
    ax.text(xr, top + 0.15, "FILM DOKUMENTER ASHIN JINARAKKHITA", fontsize=12, fontweight="bold", color=MAROON, va="center", ha="right")
    ax.text(xr, top - 0.7, "Minggu, 13 September 2026  •  CGV Grand Batam Mall", fontsize=10, color="#5B4636", va="center", ha="right")
    ax.text(xr, top - 1.5, f"Kapasitas: {capacity}    Terisi: {booked}    Kosong: {sisa}", fontsize=12, fontweight="bold", color="#255E33", va="center", ha="right")

    # garis pemisah
    ax.add_line(Line2D([left_pad, xr], [top - 2.0, top - 2.0], color=MAROON, lw=1.5))

    # LAYAR
    layar_y = top - 3.0
    ax.add_patch(FancyBboxPatch((ncols * cw / 2 + left_pad - 3, layar_y), 6, 0.28,
                 boxstyle="round,pad=0.02", fc="#E9C9C4", ec=MAROON, lw=0.8))
    ax.text(ncols * cw / 2 + left_pad, layar_y - 0.35, "L A Y A R", fontsize=11, color=MAROON, ha="center", va="center", fontweight="bold")

    # grid kursi
    y0 = layar_y - 1.4
    row_i = 0
    aisle_added = False
    for r in rows:
        # sisipkan lorong sebelum baris K
        if r["row"] == "K" and not aisle_added:
            ay = y0 - row_i * (ch + gap) + ch / 2
            ax.add_line(Line2D([left_pad, xr - 0.2], [ay, ay], color="#B26A1E", lw=0.8, ls=(0, (4, 4))))
            ax.text(ncols * cw / 2 + left_pad, ay, "  LORONG JALAN  ", fontsize=7, color="#B26A1E", ha="center", va="center",
                    bbox=dict(boxstyle="round,pad=0.15", fc="white", ec="none"))
            row_i += 1
            aisle_added = True
        y = y0 - row_i * (ch + gap)
        smap = {int(s["label"][len(r["row"]):]): s for b in r["blocks"] for s in b}
        # label baris kiri & kanan
        ax.text(left_pad - 0.5, y + ch / 2, r["row"], fontsize=11, fontweight="bold", color="#7A6A5E", ha="center", va="center")
        ax.text(left_pad + ncols * cw + 0.4, y + ch / 2, r["row"], fontsize=11, fontweight="bold", color="#7A6A5E", ha="center", va="center")
        for n in range(maxN, minN - 1, -1):
            col = maxN - n
            x = left_pad + col * cw
            s = smap.get(n)
            if not s:
                continue
            fc, ec, tc = seat_colors(s)
            ax.add_patch(FancyBboxPatch((x + 0.06, y + 0.06), cw - 0.16, ch - 0.16,
                         boxstyle="round,pad=0.02", fc=fc, ec=ec, lw=0.8))
            ax.text(x + cw / 2, y + ch / 2, str(n), fontsize=7.5, color=tc, ha="center", va="center", fontweight="bold")
        row_i += 1

    # Legend
    ly = y0 - row_i * (ch + gap) - 0.6
    items = [("Kosong (siap jual)", C_AVAIL, C_AVAIL_BD),
             ("Terisi", C_BOOKED, C_BOOKED_BD),
             ("Sweetbox/couple", C_COUPLE, C_COUPLE_BD),
             ("Disabilitas", C_DIS, C_DIS_BD),
             ("Operator", C_OPER, C_OPER_BD)]
    lx = left_pad
    for label, fc, ec in items:
        ax.add_patch(FancyBboxPatch((lx, ly), 0.7, 0.7, boxstyle="round,pad=0.02", fc=fc, ec=ec, lw=0.8))
        ax.text(lx + 0.95, ly + 0.35, label, fontsize=9.5, color="#5B4636", va="center", ha="left")
        lx += 0.95 + len(label) * 0.16 + 1.2

    fig.savefig(out, format="pdf", bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print("saved", out, "| terisi", booked, "kosong", sisa)


def main():
    outdir = "/app/frontend/public"
    os.makedirs(outdir, exist_ok=True)
    for s in SESSIONS:
        r = requests.get(f"{API}/sessions/{s['id']}/seats", timeout=30)
        data = r.json()
        draw(s, data, os.path.join(outdir, f"denah-sesi-{s['id']}.pdf"))


if __name__ == "__main__":
    main()
