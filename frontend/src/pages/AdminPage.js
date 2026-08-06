import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { adminApi, api, ADMIN_TOKEN_KEY, rupiah, LOGOS } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2, ShieldCheck, LogOut, CheckCircle2, XCircle, Printer,
  Eye, RefreshCw, Ticket, Clock, Wallet, Users, Search, UserCheck, Download, ScanLine, MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const fmtTime = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    }) + " WIB";
  } catch { return ""; }
};

const waPhone = (phone) => {
  let p = (phone || "").replace(/[^0-9]/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  else if (p.startsWith("8")) p = "62" + p;
  return p;
};

const sendWA = (o) => {
  const msg =
`Namo Buddhaya ${o.name} 🙏
Terima kasih, pembayaran Anda sudah kami *VERIFIKASI* ✅

🧾 No. Order: #${o.order_no}
👤 Nama: ${o.name}
📱 No HP: ${o.phone}

Berikut e-tiket Anda:
🎬 Nonton Bersama Film Dokumenter "Y.A. MNS. Ashin Jinarakkhita: Jejak Langkah Sang Pelopor di Nusantara"
🗓️ Minggu, 13 September 2026
📍 CGV Grand Batam
🎟️ ${o.session?.name || "Sesi"} (${o.session?.time || "-"})
💺 Kursi: ${o.seats.join(", ")}

Mohon tunjukkan pesan ini saat check-in di lokasi. Sampai jumpa! 🙏
— Sekretariat MBI Kepri`;
  window.open(`https://wa.me/${waPhone(o.phone)}?text=${encodeURIComponent(msg)}`, "_blank");
};

const orderProgress = (o) => {
  if (o.status === "pending_payment") return { t: "Belum Bayar", c: "bg-[#D56115]/15 text-[#B34F0F]" };
  if (o.status === "waiting_verification") return { t: "⚠ Belum cek payment", c: "bg-[#D56115]/20 text-[#B34F0F]" };
  if (o.status === "verified") return o.wa_sent
    ? { t: "✅ Complete", c: "bg-[#10B981]/15 text-[#0F7A57]" }
    : { t: "Belum kirim WhatsApp", c: "bg-[#1E3A5F]/15 text-[#1E3A5F]" };
  if (o.status === "rejected") return { t: "Ditolak", c: "bg-[#EF4444]/15 text-[#EF4444]" };
  if (o.status === "expired") return { t: "Kadaluarsa", c: "bg-[#6B7280]/15 text-[#6B7280]" };
  return { t: o.status, c: "bg-muted" };
};

const STATUS_META = {
  pending_payment: { t: "Belum Bayar", c: "bg-[#D56115]/15 text-[#B34F0F]" },
  waiting_verification: { t: "Perlu Verifikasi", c: "bg-[#1E3A5F]/15 text-[#1E3A5F]" },
  verified: { t: "Terverifikasi", c: "bg-[#10B981]/15 text-[#0F7A57]" },
  rejected: { t: "Ditolak", c: "bg-[#EF4444]/15 text-[#EF4444]" },
  expired: { t: "Kadaluarsa", c: "bg-[#6B7280]/15 text-[#6B7280]" },
};

const FILTERS = [
  { k: "all", t: "Semua" },
  { k: "waiting_verification", t: "Perlu Verifikasi" },
  { k: "verified", t: "Terverifikasi" },
  { k: "pending_payment", t: "Belum Bayar" },
  { k: "rejected", t: "Ditolak" },
];

function LoginView({ onLogin }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/admin/login", { password });
      localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
      onLogin();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login gagal");
    }
    setLoading(false);
  };
  return (
    <div className="max-w-md mx-auto px-4 py-24">
      <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        onSubmit={submit} className="rounded-2xl border border-border bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <div className="h-12 w-12 rounded-full bg-[#1E3A5F]/10 flex items-center justify-center mb-4">
          <ShieldCheck className="h-6 w-6 text-[#1E3A5F]" />
        </div>
        <h1 className="font-serif-display text-3xl text-[#1E3A5F]">Panel Admin</h1>
        <p className="text-sm text-[#6B7280] mb-6">Masukkan password untuk mengelola pesanan.</p>
        <Label htmlFor="pw">Password</Label>
        <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5" data-testid="admin-password" placeholder="••••••••" />
        <Button type="submit" disabled={loading} data-testid="admin-login-btn"
          className="w-full mt-5 bg-[#1E3A5F] hover:bg-[#16304f] rounded-full">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null} Masuk
        </Button>
      </motion.form>
    </div>
  );
}

const StatCard = ({ icon: Icon, label, value, color }) => (
  <div className="rounded-xl border border-border bg-white p-4 flex items-center gap-3">
    <span className={cn("h-10 w-10 rounded-lg flex items-center justify-center", color)}><Icon className="h-5 w-5" /></span>
    <div>
      <p className="text-xs text-[#6B7280]">{label}</p>
      <p className="font-semibold text-lg text-[#1E3A5F]">{value}</p>
    </div>
  </div>
);

function CheckinPanel({ orders, query, setQuery, onCheckin, busyId }) {
  const q = query.trim().toLowerCase();
  const nq = q.replace(/\s/g, "");
  const results = q.length === 0 ? [] : orders.filter(
    (o) => o.status === "verified" &&
      (o.name.toLowerCase().includes(q) || o.phone.replace(/\s/g, "").includes(nq))
  );
  return (
    <div className="rounded-2xl border border-border bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] no-print">
      <h2 className="font-serif-display text-2xl text-[#1E3A5F] mb-1">Check-in Peserta</h2>
      <p className="text-sm text-[#6B7280] mb-4">Cari peserta dengan nama atau nomor HP, tandai kehadiran, lalu serahkan tiket kursinya.</p>
      <a href="/checkin" target="_blank" rel="noreferrer" data-testid="open-mobile-checkin"
        className="inline-flex items-center gap-1.5 text-sm text-[#D56115] hover:underline font-medium mb-4">
        <ScanLine className="h-4 w-4" /> Buka halaman Check-in khusus HP (mobile) → /checkin
      </a>
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7280]" />
        <Input data-testid="checkin-search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Ketik nama atau nomor HP peserta..." className="pl-9" />
      </div>
      <div className="mt-5 space-y-3">
        {q.length > 0 && results.length === 0 && (
          <p className="text-sm text-[#6B7280]" data-testid="checkin-empty">Tidak ada peserta terverifikasi yang cocok. (Hanya pesanan Terverifikasi yang tampil)</p>
        )}
        {results.map((o) => (
          <div key={o.id} data-testid={`checkin-result-${o.id.slice(0, 8)}`}
            className="rounded-xl border border-border p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-[#1A1A1A]">{o.name}</p>
              <p className="text-xs text-[#6B7280]">{o.phone} · {o.session?.name} · {o.session?.time}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {o.seats.map((s) => (
                  <span key={s} className="px-2.5 py-1 rounded-md bg-[#D56115]/10 text-[#B34F0F] text-sm font-semibold">{s}</span>
                ))}
              </div>
            </div>
            <div className="text-right">
              {o.checked_in ? (
                <div className="text-right">
                  <span className="inline-flex items-center gap-1.5 text-sm text-[#10B981] font-medium"><CheckCircle2 className="h-4 w-4" /> Sudah Hadir</span>
                  {o.checked_in_at && <p className="text-[11px] text-[#6B7280] mt-0.5">Check-in: {fmtTime(o.checked_in_at)}</p>}
                </div>
              ) : (
                <Button onClick={() => onCheckin(o)} disabled={busyId === o.id} data-testid={`checkin-btn-${o.id.slice(0, 8)}`}
                  className="bg-[#1E3A5F] hover:bg-[#16304f]">
                  {busyId === o.id ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <UserCheck className="h-4 w-4 mr-1.5" />}
                  Tandai Sudah Datang
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(!!localStorage.getItem(ADMIN_TOKEN_KEY));
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [proofView, setProofView] = useState(null);
  const [proofImage, setProofImage] = useState(null);
  const [proofLoading, setProofLoading] = useState(false);
  const [dialogVerified, setDialogVerified] = useState(false);
  const [printOrder, setPrintOrder] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [tab, setTab] = useState("payment");
  const [checkinQuery, setCheckinQuery] = useState("");
  const [checkinPopup, setCheckinPopup] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [sessionFilter, setSessionFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, s, e] = await Promise.all([
        adminApi.get("/admin/orders"),
        adminApi.get("/admin/stats"),
        api.get("/event"),
      ]);
      setOrders(o.data); setStats(s.data); setEvent(e.data);
    } catch (err) {
      if (err?.response?.status === 401) { localStorage.removeItem(ADMIN_TOKEN_KEY); setAuthed(false); }
      else toast.error("Gagal memuat data");
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (authed) load(); }, [authed, load]);

  const act = async (id, action) => {
    setBusyId(id);
    try {
      await adminApi.post(`/admin/orders/${id}/${action}`);
      toast.success(action === "verify" ? "Pesanan diverifikasi" : action === "reject" ? "Pesanan ditolak" : "Check-in tersimpan");
      await load();
    } catch (err) { toast.error("Aksi gagal"); }
    setBusyId(null);
  };

  const setActiveSession = async (sid) => {
    try { await adminApi.post("/admin/active-session", { session_id: sid }); toast.success(`Sesi aktif: ${sid}`); await load(); }
    catch { toast.error("Gagal ubah sesi"); }
  };

  const logout = () => { localStorage.removeItem(ADMIN_TOKEN_KEY); setAuthed(false); };

  const sendAndMarkWA = async (o) => {
    sendWA(o);
    try { await adminApi.post(`/admin/orders/${o.id}/wa-sent`); await load(); }
    catch { /* ignore */ }
  };

  const openProof = async (o) => {
    setProofView(o); setProofImage(null); setProofLoading(true); setDialogVerified(false);
    try {
      const { data } = await adminApi.get(`/admin/orders/${o.id}/proof-image`);
      setProofImage(data.proof_image);
    } catch { toast.error("Gagal memuat bukti"); }
    setProofLoading(false);
  };

  const verifyInDialog = async () => {
    if (!proofView) return;
    setBusyId(proofView.id);
    try {
      await adminApi.post(`/admin/orders/${proofView.id}/verify`);
      toast.success("Pesanan diverifikasi");
      setDialogVerified(true);
      await load();
    } catch { toast.error("Gagal verifikasi"); }
    setBusyId(null);
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const res = await adminApi.get("/admin/export", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `peserta_nonton_mbi.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("File Excel berhasil diunduh");
    } catch (err) {
      toast.error("Gagal mengunduh Excel");
    }
    setExporting(false);
  };

  const doPrint = (o) => {
    setPrintOrder(o);
    setTimeout(() => window.print(), 250);
  };

  if (!authed) return <LoginView onLogin={() => setAuthed(true)} />;

  const sq = searchQuery.trim().toLowerCase();
  const nsq = sq.replace(/[\s-]/g, "");
  const filtered = orders.filter((o) =>
    (filter === "all" || o.status === filter) &&
    (sessionFilter === "all" || o.session_id === sessionFilter) &&
    (sq === "" || o.name.toLowerCase().includes(sq) || o.phone.replace(/[\s-]/g, "").includes(nsq) || String(o.order_no || "").includes(searchQuery.trim()))
  );

  const selectableIds = filtered.filter((o) => o.status === "waiting_verification").map((o) => o.id);
  const toggleSelect = (id) => setSelectedIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id));
  const toggleSelectAll = () => setSelectedIds(allSelected ? [] : selectableIds);
  const bulkAct = async (action) => {
    if (selectedIds.length === 0) return;
    setBulkBusy(true);
    try {
      const { data } = await adminApi.post("/admin/orders/bulk", { ids: selectedIds, action });
      toast.success(`${data.updated} pesanan ${action === "verify" ? "diverifikasi" : "ditolak"}`);
      setSelectedIds([]);
      await load();
    } catch { toast.error("Aksi massal gagal"); }
    setBulkBusy(false);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8">
      <div className="flex items-center justify-between mb-6 no-print">
        <div>
          <h1 className="font-serif-display text-3xl text-[#1E3A5F]">Panel Admin</h1>
          <p className="text-sm text-[#6B7280]">Kelola pesanan & verifikasi pembayaran.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportExcel} disabled={exporting} data-testid="btn-export">
            {exporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />} Export Excel
          </Button>
          <Button variant="outline" onClick={load} data-testid="btn-refresh"><RefreshCw className="h-4 w-4 mr-1.5" /> Muat Ulang</Button>
          <Button variant="ghost" onClick={logout} data-testid="btn-logout" className="text-[#EF4444]"><LogOut className="h-4 w-4 mr-1.5" /> Keluar</Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 no-print">
          <StatCard icon={Clock} label="Perlu Verifikasi" value={stats.waiting_verification} color="bg-[#1E3A5F]/10 text-[#1E3A5F]" />
          <StatCard icon={CheckCircle2} label="Terverifikasi" value={stats.verified} color="bg-[#10B981]/10 text-[#10B981]" />
          <StatCard icon={Ticket} label="Tiket Terjual" value={stats.tickets_verified} color="bg-[#D56115]/10 text-[#D56115]" />
          <StatCard icon={Wallet} label="Pendapatan" value={rupiah(stats.revenue_verified)} color="bg-[#10B981]/10 text-[#10B981]" />
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex flex-wrap gap-2 mb-6 no-print">
        <button data-testid="admin-tab-payment" onClick={() => setTab("payment")}
          className={cn("px-4 py-2 rounded-full text-sm font-medium border transition-colors inline-flex items-center gap-1.5",
            tab === "payment" ? "bg-[#D56115] text-white border-[#D56115]" : "bg-white text-[#6B7280] border-border hover:border-[#D56115]/50")}>
          <Wallet className="h-4 w-4" /> Verifikasi Pembayaran
        </button>
        <button data-testid="admin-tab-checkin" onClick={() => setTab("checkin")}
          className={cn("px-4 py-2 rounded-full text-sm font-medium border transition-colors inline-flex items-center gap-1.5",
            tab === "checkin" ? "bg-[#1E3A5F] text-white border-[#1E3A5F]" : "bg-white text-[#6B7280] border-border hover:border-[#1E3A5F]/50")}>
          <UserCheck className="h-4 w-4" /> Check-in Peserta
        </button>
      </div>

      {tab === "payment" && (<>
      {/* Session control */}
      {event && (
        <div className="rounded-xl border border-border bg-white p-4 mb-6 no-print">
          <p className="text-sm font-medium text-[#1E3A5F] mb-2 flex items-center gap-2"><Users className="h-4 w-4" /> Kontrol Sesi (aktif: Sesi {event.active_session})</p>
          <div className="flex flex-wrap gap-2">
            {event.sessions.map((s) => (
              <button key={s.id} data-testid={`admin-session-${s.id}`} onClick={() => setActiveSession(s.id)}
                className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                  event.active_session === s.id ? "bg-[#D56115] text-white border-[#D56115]" : "bg-white text-[#6B7280] border-border hover:border-[#D56115]/50")}>
                {s.name} · {s.booked}/{s.capacity}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filter per sesi */}
      <div className="flex flex-wrap items-center gap-2 mb-3 no-print">
        <span className="text-xs text-[#6B7280] mr-1">Filter sesi:</span>
        <button data-testid="session-filter-all" onClick={() => setSessionFilter("all")}
          className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
            sessionFilter === "all" ? "bg-[#D56115] text-white border-[#D56115]" : "bg-white text-[#6B7280] border-border hover:border-[#D56115]/40")}>
          Semua Sesi
        </button>
        {[1, 2, 3, 4].map((sid) => (
          <button key={sid} data-testid={`session-filter-${sid}`} onClick={() => setSessionFilter(sid)}
            className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              sessionFilter === sid ? "bg-[#D56115] text-white border-[#D56115]" : "bg-white text-[#6B7280] border-border hover:border-[#D56115]/40")}>
            Sesi {sid} ({orders.filter((o) => o.session_id === sid).length})
          </button>
        ))}
      </div>

      {/* Filters status */}
      <div className="flex flex-wrap gap-2 mb-4 no-print">
        {FILTERS.map((f) => (
          <button key={f.k} data-testid={`filter-${f.k}`} onClick={() => setFilter(f.k)}
            className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              filter === f.k ? "bg-[#1E3A5F] text-white border-[#1E3A5F]" : "bg-white text-[#6B7280] border-border hover:border-[#1E3A5F]/40")}>
            {f.t}
          </button>
        ))}
      </div>

      {/* Search + bulk actions */}
      <div className="flex flex-wrap items-center gap-3 mb-4 no-print">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7280]" />
          <Input data-testid="orders-search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama, no HP, atau no order..." className="pl-9" />
        </div>
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2 rounded-full bg-[#1E3A5F]/5 border border-[#1E3A5F]/20 px-3 py-1.5">
            <span className="text-sm text-[#1E3A5F] font-medium" data-testid="bulk-count">{selectedIds.length} dipilih</span>
            <Button size="sm" onClick={() => bulkAct("verify")} disabled={bulkBusy} data-testid="bulk-verify"
              className="h-8 bg-[#10B981] hover:bg-[#0F7A57]">
              {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />} Verifikasi
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkAct("reject")} disabled={bulkBusy} data-testid="bulk-reject"
              className="h-8 text-[#EF4444] border-[#EF4444]/40">
              <XCircle className="h-3.5 w-3.5 mr-1" /> Tolak
            </Button>
            <button onClick={() => setSelectedIds([])} className="text-xs text-[#6B7280] underline">bersihkan</button>
          </div>
        )}
      </div>

      {/* Orders table */}
      <div className="flex items-center justify-between mb-2 no-print">
        <h2 className="font-serif-display text-xl text-[#1E3A5F] flex items-center gap-2">
          <Wallet className="h-5 w-5 text-[#D56115]" /> Daftar Pesanan — Verifikasi Pembayaran
        </h2>
        <span className="text-xs text-[#6B7280]">{filtered.length} pesanan</span>
      </div>
      <p className="text-xs text-[#6B7280] mb-3 no-print">Klik <b>Lihat</b> pada kolom Bukti untuk melihat bukti transfer & memverifikasi.</p>
      <div className="rounded-2xl border border-border bg-white overflow-hidden no-print">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[#D56115]" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#6B7280]">Tidak ada pesanan yang cocok.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="orders-table">
              <thead className="bg-muted/50 text-left text-xs text-[#6B7280]">
                <tr>
                  <th className="px-3 py-3 font-medium">
                    <input type="checkbox" data-testid="select-all" checked={allSelected} onChange={toggleSelectAll}
                      disabled={selectableIds.length === 0} className="accent-[#1E3A5F] h-4 w-4 align-middle" />
                  </th>
                  <th className="px-4 py-3 font-medium">Pemesan</th>
                  <th className="px-4 py-3 font-medium">Sesi / Kursi</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-center">Verifikasi</th>
                  <th className="px-4 py-3 font-medium text-center">Kirim Pesan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((o) => {
                  const dstat = orderProgress(o);
                  return (
                    <tr key={o.id} data-testid={`order-row-${o.id.slice(0, 8)}`} className="hover:bg-muted/30">
                      <td className="px-3 py-3">
                        {o.status === "waiting_verification" && (
                          <input type="checkbox" data-testid={`select-${o.id.slice(0, 8)}`}
                            checked={selectedIds.includes(o.id)} onChange={() => toggleSelect(o.id)}
                            className="accent-[#1E3A5F] h-4 w-4 align-middle" />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-[#1A1A1A]">{o.name} <span className="font-mono text-[10px] text-[#6B7280]">#{o.order_no}</span></p>
                        <p className="text-xs text-[#6B7280]">{o.phone}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p>{o.session?.name}</p>
                        <p className="text-xs text-[#6B7280]">{o.seats.join(", ")}</p>
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#1E3A5F]">{rupiah(o.total_amount)}</td>
                      <td className="px-4 py-3">
                        <span data-testid={`status-${o.id.slice(0, 8)}`} className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium inline-block", dstat.c)}>{dstat.t}</span>
                      </td>
                      {/* Verifikasi */}
                      <td className="px-4 py-3 text-center">
                        {o.status === "waiting_verification" ? (
                          <Button size="sm" onClick={() => openProof(o)} data-testid={`verify-open-${o.id.slice(0, 8)}`}
                            className="h-8 bg-[#D56115] hover:bg-[#B34F0F] text-xs">
                            <Eye className="h-3.5 w-3.5 mr-1" /> Cek Bukti
                          </Button>
                        ) : o.status === "verified" ? (
                          <button onClick={() => o.has_proof && openProof(o)} data-testid={`verify-done-${o.id.slice(0, 8)}`}
                            className="inline-flex items-center gap-1 text-[#0F7A57] text-xs font-medium">
                            <CheckCircle2 className="h-4 w-4" /> Payment OK
                          </button>
                        ) : o.status === "pending_payment" ? (
                          <span className="text-xs text-[#6B7280]">Belum upload</span>
                        ) : (
                          <span className="text-xs text-[#6B7280]">—</span>
                        )}
                      </td>
                      {/* Kirim Pesan */}
                      <td className="px-4 py-3 text-center">
                        {o.status === "verified" ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <Button size="sm" onClick={() => sendAndMarkWA(o)} data-testid={`wa-${o.id.slice(0, 8)}`}
                              className={cn("h-8 text-xs", o.wa_sent ? "bg-white text-[#0F7A57] border border-[#10B981]/50 hover:bg-[#10B981]/10" : "bg-[#10B981] hover:bg-[#0F7A57]")}>
                              <MessageCircle className="h-3.5 w-3.5 mr-1" /> {o.wa_sent ? "Kirim Ulang" : "Kirim Pesan"}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-[#6B7280]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>)}

      {tab === "checkin" && (
        <CheckinPanel orders={orders} query={checkinQuery} setQuery={setCheckinQuery} busyId={busyId}
          onCheckin={async (o) => { await act(o.id, "checkin"); setCheckinPopup(o); }} />
      )}

      {/* Proof viewer */}
      <Dialog open={!!proofView} onOpenChange={() => setProofView(null)}>
        <DialogContent data-testid="proof-dialog">
          <DialogHeader>
            <DialogTitle className="font-serif-display text-2xl text-[#1E3A5F]">
              {dialogVerified ? "Terverifikasi ✅" : "Verifikasi Pembayaran"}
            </DialogTitle>
          </DialogHeader>
          {proofView && (
            <div>
              <div className="text-sm mb-3 space-y-0.5">
                <p><b>{proofView.name}</b> <span className="font-mono text-xs text-[#6B7280]">#{proofView.order_no}</span></p>
                <p className="text-[#6B7280]">{proofView.phone} · {proofView.session?.name} · Kursi {proofView.seats.join(", ")}</p>
                <p>Nominal: <b className="text-[#D56115]">{rupiah(proofView.total_amount)}</b> (kode unik {proofView.unique_code})</p>
              </div>

              {!dialogVerified && (
                proofLoading ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#D56115]" /></div>
                ) : proofImage ? (
                  <img src={proofImage} alt="Bukti" className="w-full rounded-lg border border-border max-h-[45vh] object-contain bg-muted/30" />
                ) : (
                  <p className="text-sm text-[#6B7280] py-4 text-center">Bukti tidak tersedia.</p>
                )
              )}

              {dialogVerified ? (
                <div className="mt-4">
                  <div className="rounded-lg bg-[#10B981]/10 p-4 text-center mb-3">
                    <CheckCircle2 className="h-8 w-8 text-[#10B981] mx-auto mb-1" />
                    <p className="text-sm text-[#0F7A57] font-medium">Pembayaran diverifikasi. Kirim tiket ke pembeli via WhatsApp.</p>
                  </div>
                  <Button onClick={() => { sendAndMarkWA(proofView); }} data-testid="dialog-send-wa"
                    className="w-full bg-[#10B981] hover:bg-[#0F7A57]">
                    <MessageCircle className="h-4 w-4 mr-1.5" /> Kirim Tiket via WhatsApp
                  </Button>
                  <Button variant="ghost" onClick={() => setProofView(null)} className="w-full mt-1 text-[#6B7280]" data-testid="dialog-close">
                    Selesai
                  </Button>
                </div>
              ) : proofView.status === "waiting_verification" ? (
                <div className="flex gap-2 mt-4">
                  <Button onClick={verifyInDialog} disabled={busyId === proofView.id} data-testid="dialog-verify"
                    className="flex-1 bg-[#10B981] hover:bg-[#0F7A57]">
                    {busyId === proofView.id ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />} Payment Masuk
                  </Button>
                  <Button variant="outline" onClick={() => { act(proofView.id, "reject"); setProofView(null); }}
                    data-testid="dialog-reject" className="flex-1 text-[#EF4444] border-[#EF4444]/40">
                    <XCircle className="h-4 w-4 mr-1.5" /> Tolak
                  </Button>
                </div>
              ) : proofView.status === "verified" ? (
                <Button onClick={() => sendAndMarkWA(proofView)} data-testid="dialog-send-wa-2"
                  className="w-full mt-4 bg-[#10B981] hover:bg-[#0F7A57]">
                  <MessageCircle className="h-4 w-4 mr-1.5" /> Kirim Tiket via WhatsApp
                </Button>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Check-in reminder popup */}
      <Dialog open={!!checkinPopup} onOpenChange={() => setCheckinPopup(null)}>
        <DialogContent data-testid="checkin-popup">
          <DialogHeader>
            <div className="h-11 w-11 rounded-full bg-[#10B981]/15 flex items-center justify-center mb-2">
              <Ticket className="h-5 w-5 text-[#10B981]" />
            </div>
            <DialogTitle className="font-serif-display text-2xl text-[#1E3A5F]">Peserta Sudah Datang</DialogTitle>
          </DialogHeader>
          {checkinPopup && (
            <div className="text-sm space-y-3">
              <p><b>{checkinPopup.name}</b> ({checkinPopup.phone}) — {checkinPopup.session?.name} · {checkinPopup.session?.time}</p>
              <p className="text-xs text-[#10B981] font-medium">✓ Check-in tercatat: {fmtTime(new Date().toISOString())}</p>
              <div className="rounded-lg bg-[#D56115]/10 p-4">
                <p className="text-[#B34F0F] font-medium mb-2">Pastikan sudah serahkan tiket untuk kursi:</p>
                <div className="flex flex-wrap gap-2">
                  {checkinPopup.seats.map((s) => (
                    <span key={s} className="px-3 py-1.5 rounded-md bg-white text-[#B34F0F] font-bold text-base border border-[#D56115]/30">{s}</span>
                  ))}
                </div>
              </div>
              <p className="text-[#6B7280] text-xs">Jangan lupa memberikan tiket kursi di atas kepada peserta ini agar tidak terjadi double.</p>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button onClick={() => setCheckinPopup(null)} className="bg-[#1E3A5F] hover:bg-[#16304f] w-full" data-testid="checkin-popup-ok">
              Sudah Saya Berikan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Printable ticket */}
      {printOrder && (
        <div id="print-area" className="hidden print:block p-8">
          <div className="border-2 border-[#1E3A5F] rounded-xl p-6 max-w-md">
            <div className="flex items-center gap-3 border-b border-dashed border-gray-300 pb-3 mb-3">
              <img src={LOGOS.kbi} alt="KBI" className="h-10" />
              <img src={LOGOS.mbi} alt="MBI" className="h-10" />
            </div>
            <p className="text-xs text-gray-500">TIKET NONTON BERSAMA · Minggu, 13 September 2026 · CGV Grand Batam</p>
            <p className="font-serif-display text-xl text-[#1E3A5F] leading-tight mt-1">
              Y.A. MNS. Ashin Jinarakkhita: Jejak Langkah Sang Pelopor di Nusantara
            </p>
            <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
              <div><p className="text-gray-500 text-xs">Nama</p><p className="font-semibold">{printOrder.name}</p></div>
              <div><p className="text-gray-500 text-xs">No. HP</p><p className="font-semibold">{printOrder.phone}</p></div>
              <div><p className="text-gray-500 text-xs">Sesi</p><p className="font-semibold">{printOrder.session?.name} · {printOrder.session?.time}</p></div>
              <div><p className="text-gray-500 text-xs">Kursi</p><p className="font-semibold">{printOrder.seats.join(", ")}</p></div>
            </div>
            <div className="mt-4 pt-3 border-t border-dashed border-gray-300 flex justify-between items-center">
              <div><p className="text-gray-500 text-xs">No. Order</p><p className="font-mono font-bold">#{printOrder.order_no}</p></div>
              <div className="text-right"><p className="text-gray-500 text-xs">Total</p><p className="font-bold">{rupiah(printOrder.total_amount)}</p></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
