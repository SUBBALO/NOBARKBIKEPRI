import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { adminApi, api, ADMIN_TOKEN_KEY, getAdminUser, setAdminSession, clearAdminSession, rupiah, LOGOS } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2, ShieldCheck, LogOut, CheckCircle2, XCircle, Printer,
  Eye, RefreshCw, Ticket, Clock, Wallet, Users, Search, UserCheck, Download, ScanLine, MessageCircle, UploadCloud,
  Trash2, AlertTriangle, UserPlus, History,
  Store, Banknote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

const compressImage = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const max = 1400;
        let { width, height } = img;
        if (width > max || height > max) {
          const r = Math.min(max / width, max / height);
          width = Math.round(width * r); height = Math.round(height * r);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

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
`Namo Buddhaya, ${o.name}
Terima kasih, pembayaran Anda sudah kami *VERIFIKASI*.

No. Order: #${o.order_no}
Nama: ${o.name}
No HP: ${o.phone}

Berikut e-tiket Anda:
Film: "Y.A. MNS. Ashin Jinarakkhita: Jejak Langkah Sang Pelopor di Nusantara"
Hari/Tanggal: Minggu, 13 September 2026
Tempat: CGV Grand Batam
${o.session?.name || "Sesi"} (${o.session?.time || "-"})
Kursi: ${o.seats.join(", ")}

Mohon tunjukkan pesan ini saat check-in di lokasi. Sampai jumpa!
— Sekretariat MBI Kepri`;
  window.open(`https://wa.me/${waPhone(o.phone)}?text=${encodeURIComponent(msg)}`, "_blank");
};

const sendReminderWA = (o) => {
  const link = `${window.location.origin}/order/${o.id}`;
  const msg =
`Namo Buddhaya, ${o.name}
Terima kasih sudah memesan tiket Nonton Bersama Film Dokumenter "Y.A. MNS. Ashin Jinarakkhita: Jejak Langkah Sang Pelopor di Nusantara".

Namun kami *BELUM menerima bukti pembayaran* Anda untuk:
No. Order: #${o.order_no}
${o.session?.name || "Sesi"} - Kursi ${o.seats.join(", ")}
Total: ${rupiah(o.total_amount)} (mohon bayar PAS termasuk kode unik)

Mohon segera lakukan pembayaran & *upload bukti transfer* melalui link berikut:
${link}

Atau Anda cukup *kirim foto bukti transfer ke chat WhatsApp ini*, nanti kami bantu upload-kan.

Jika sudah membayar, mohon abaikan pesan ini. Terima kasih.
— Sekretariat MBI Kepri`;
  window.open(`https://wa.me/${waPhone(o.phone)}?text=${encodeURIComponent(msg)}`, "_blank");
};

const orderProgress = (o) => {
  if (o.status === "pending_payment") return { t: "Belum Bayar", c: "bg-[#B26A1E]/15 text-[#8A3A12]" };
  if (o.status === "waiting_verification") return { t: "⚠ Belum cek payment", c: "bg-[#B26A1E]/20 text-[#8A3A12]" };
  if (o.status === "verified") return o.wa_sent
    ? { t: "✅ Complete", c: "bg-[#2F703E]/15 text-[#255E33]" }
    : { t: "Belum kirim WhatsApp", c: "bg-[#7A241F]/15 text-[#7A241F]" };
  if (o.status === "rejected") return { t: "Ditolak", c: "bg-[#EF4444]/15 text-[#EF4444]" };
  if (o.status === "expired") return { t: "Kadaluarsa", c: "bg-[#7A6A5E]/15 text-[#7A6A5E]" };
  return { t: o.status, c: "bg-muted" };
};

const STATUS_META = {
  pending_payment: { t: "Belum Bayar", c: "bg-[#B26A1E]/15 text-[#8A3A12]" },
  waiting_verification: { t: "Perlu Verifikasi", c: "bg-[#7A241F]/15 text-[#7A241F]" },
  verified: { t: "Terverifikasi", c: "bg-[#2F703E]/15 text-[#255E33]" },
  rejected: { t: "Ditolak", c: "bg-[#EF4444]/15 text-[#EF4444]" },
  expired: { t: "Kadaluarsa", c: "bg-[#7A6A5E]/15 text-[#7A6A5E]" },
};

const FILTERS = [
  { k: "all", t: "Semua" },
  { k: "waiting_verification", t: "Perlu Verifikasi" },
  { k: "verified", t: "Terverifikasi" },
  { k: "pending_payment", t: "Belum Bayar" },
  { k: "rejected", t: "Ditolak" },
];

function LoginView({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/admin/login", { username, password });
      setAdminSession(data.token, data.user);
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
        <div className="h-12 w-12 rounded-full bg-[#7A241F]/10 flex items-center justify-center mb-4">
          <ShieldCheck className="h-6 w-6 text-[#7A241F]" />
        </div>
        <h1 className="font-serif-display text-3xl text-[#7A241F]">Panel Admin</h1>
        <p className="text-sm text-[#7A6A5E] mb-6">Masuk dengan akun Anda.</p>
        <Label htmlFor="uname">Username</Label>
        <Input id="uname" value={username} onChange={(e) => setUsername(e.target.value)}
          className="mt-1.5 mb-4" data-testid="admin-username" placeholder="username" autoCapitalize="none" />
        <Label htmlFor="pw">Password</Label>
        <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5" data-testid="admin-password" placeholder="••••••••" />
        <Button type="submit" disabled={loading} data-testid="admin-login-btn"
          className="w-full mt-5 bg-[#7A241F] hover:bg-[#5E1B17] rounded-full">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null} Masuk
        </Button>
      </motion.form>
    </div>
  );
}

const ROLE_BADGE = {
  superadmin: { t: "Super Admin", c: "bg-[#B26A1E]/15 text-[#8A3A12]" },
  admin: { t: "Admin", c: "bg-[#7A241F]/15 text-[#7A241F]" },
  checkin: { t: "Petugas Check-in", c: "bg-[#2F703E]/15 text-[#255E33]" },
};

const StatCard = ({ icon: Icon, label, value, color }) => (
  <div className="rounded-xl border border-border bg-white p-4 flex items-center gap-3">
    <span className={cn("h-10 w-10 rounded-lg flex items-center justify-center", color)}><Icon className="h-5 w-5" /></span>
    <div>
      <p className="text-xs text-[#7A6A5E]">{label}</p>
      <p className="font-semibold text-lg text-[#7A241F]">{value}</p>
    </div>
  </div>
);

function DailySalesChart({ stats }) {
  const daily = stats?.daily || [];
  if (daily.length === 0) return null;
  const fmtDate = (d) => {
    const [y, m, day] = d.split("-");
    const bulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    return `${parseInt(day, 10)} ${bulan[parseInt(m, 10) - 1]}`;
  };
  const data = daily.map((d) => ({
    ...d,
    label: fmtDate(d.date),
    pending: Math.max(0, (d.tickets || 0) - (d.tickets_verified || 0)),
  }));
  const totalTickets = data.reduce((a, d) => a + (d.tickets || 0), 0);
  return (
    <div className="rounded-2xl border border-border bg-white p-4 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] mb-6 no-print" data-testid="daily-sales-chart">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="font-serif-display text-xl text-[#7A241F] flex items-center gap-2">
          <History className="h-5 w-5 text-[#B26A1E]" /> Pembelian Tiket per Hari
        </h2>
        <span className="text-xs text-[#7A6A5E]">{data.length} hari · total <b className="text-[#7A241F]">{totalTickets}</b> tiket</span>
      </div>
      <div className="h-56 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EDE5D8" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#7A6A5E" }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#7A6A5E" }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: "rgba(178,106,30,0.06)" }}
              contentStyle={{ borderRadius: 12, border: "1px solid #EDE5D8", fontSize: 12 }}
              formatter={(v, nm) => [`${v} tiket`, nm]}
              labelFormatter={(l, p) => {
                const row = p?.[0]?.payload;
                return row ? `${l} · ${row.orders} pesanan · ${rupiah(row.revenue_verified)}` : l;
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="tickets_verified" name="Terverifikasi" stackId="a" fill="#2F703E" radius={[0, 0, 0, 0]} />
            <Bar dataKey="pending" name="Belum verifikasi" stackId="a" fill="#E4C57E" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm min-w-[440px]" data-testid="daily-sales-table">
          <thead>
            <tr className="text-left text-xs text-[#7A6A5E] border-b border-border">
              <th className="py-2 pr-3 font-medium">Tanggal</th>
              <th className="py-2 pr-3 font-medium text-right">Pesanan</th>
              <th className="py-2 pr-3 font-medium text-right">Tiket</th>
              <th className="py-2 pr-3 font-medium text-right">Terverifikasi</th>
              <th className="py-2 font-medium text-right">Pendapatan</th>
            </tr>
          </thead>
          <tbody>
            {[...data].reverse().map((d) => (
              <tr key={d.date} className="border-b border-dashed border-border/70 last:border-0">
                <td className="py-1.5 pr-3 font-medium text-[#2C1E16]">{d.label}</td>
                <td className="py-1.5 pr-3 text-right">{d.orders}</td>
                <td className="py-1.5 pr-3 text-right font-semibold text-[#7A241F]">{d.tickets}</td>
                <td className="py-1.5 pr-3 text-right text-[#255E33]">{d.tickets_verified}</td>
                <td className="py-1.5 text-right text-[#255E33]">{rupiah(d.revenue_verified)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function SalesSummary({ stats }) {
  const b = stats?.breakdown;
  if (!b) return null;
  const w = b.walkin, on = b.online;
  const Row = ({ label, data, accent }) => (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className={cn("text-[#7A6A5E]", accent && "font-medium text-[#2C1E16]")}>{label}</span>
      <span className="text-right">
        <b className="text-[#7A241F]">{data.tickets}</b> <span className="text-xs text-[#7A6A5E]">tiket</span>
        <span className="mx-1 text-[#D1D5DB]">·</span>
        <b className="text-[#255E33]">{rupiah(data.revenue)}</b>
      </span>
    </div>
  );
  return (
    <div className="rounded-2xl border border-border bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] mb-6 no-print" data-testid="sales-summary">
      <h2 className="font-serif-display text-xl text-[#7A241F] flex items-center gap-2 mb-4"><Wallet className="h-5 w-5 text-[#B26A1E]" /> Ringkasan Penjualan (terverifikasi)</h2>
      <div className="grid sm:grid-cols-2 gap-5">
        <div className="rounded-xl border border-border p-4">
          <p className="text-sm font-semibold text-[#7A241F] mb-1">Online (web)</p>
          <Row label="Total" data={on} accent />
        </div>
        <div className="rounded-xl border border-border p-4">
          <p className="text-sm font-semibold text-[#7A241F] mb-1">Jual di Tempat (walk-in)</p>
          <Row label="Total" data={w} accent />
          <div className="mt-1 border-t border-dashed border-border pt-1">
            <Row label="• Cash" data={w.cash} />
            <Row label="• QRIS" data={w.qris} />
            <Row label="• Transfer" data={w.transfer} />
          </div>
        </div>
      </div>
      <div className="mt-4 rounded-xl bg-[#2F703E]/[0.07] border border-[#2F703E]/20 p-4 flex items-center justify-between" data-testid="cash-recap">
        <div>
          <p className="text-sm font-semibold text-[#255E33] flex items-center gap-1.5"><Banknote className="h-4 w-4" /> Rekap Kas Cash (walk-in)</p>
          <p className="text-xs text-[#7A6A5E]">Total uang tunai yang harus ada di tangan bendahara</p>
        </div>
        <span className="font-serif-display text-3xl text-[#255E33]" data-testid="cash-total">{rupiah(stats.cash_total || 0)}</span>
      </div>
    </div>
  );
}


function CheckinPanel({ orders, query, setQuery, onCheckin, busyId }) {
  const q = query.trim().toLowerCase();
  const nq = q.replace(/\s/g, "");
  const results = q.length === 0 ? [] : orders.filter(
    (o) => o.status === "verified" &&
      (o.name.toLowerCase().includes(q) || o.phone.replace(/\s/g, "").includes(nq))
  );
  return (
    <div className="rounded-2xl border border-border bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] no-print">
      <h2 className="font-serif-display text-2xl text-[#7A241F] mb-1">Check-in Peserta</h2>
      <p className="text-sm text-[#7A6A5E] mb-4">Cari peserta dengan nama atau nomor HP, tandai kehadiran, lalu serahkan tiket kursinya.</p>
      <a href="/checkin" target="_blank" rel="noreferrer" data-testid="open-mobile-checkin"
        className="inline-flex items-center gap-1.5 text-sm text-[#B26A1E] hover:underline font-medium mb-4">
        <ScanLine className="h-4 w-4" /> Buka halaman Check-in khusus HP (mobile) → /checkin
      </a>
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7A6A5E]" />
        <Input data-testid="checkin-search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Ketik nama atau nomor HP peserta..." className="pl-9" />
      </div>
      <div className="mt-5 space-y-3">
        {q.length > 0 && results.length === 0 && (
          <p className="text-sm text-[#7A6A5E]" data-testid="checkin-empty">Tidak ada peserta terverifikasi yang cocok. (Hanya pesanan Terverifikasi yang tampil)</p>
        )}
        {results.map((o) => (
          <div key={o.id} data-testid={`checkin-result-${o.id.slice(0, 8)}`}
            className="rounded-xl border border-border p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-[#2C1E16]">{o.name}</p>
              <p className="text-xs text-[#7A6A5E]">{o.phone} · {o.session?.name} · {o.session?.time}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {o.seats.map((s) => (
                  <span key={s} className="px-2.5 py-1 rounded-md bg-[#B26A1E]/10 text-[#8A3A12] text-sm font-semibold">{s}</span>
                ))}
              </div>
            </div>
            <div className="text-right">
              {o.checked_in ? (
                <div className="text-right">
                  <span className="inline-flex items-center gap-1.5 text-sm text-[#2F703E] font-medium"><CheckCircle2 className="h-4 w-4" /> Sudah Hadir</span>
                  {o.checked_in_at && <p className="text-[11px] text-[#7A6A5E] mt-0.5">Check-in: {fmtTime(o.checked_in_at)}</p>}
                  {o.checked_in_by && <p className="text-[11px] text-[#7A6A5E]">oleh <b className="text-[#255E33]">{o.checked_in_by}</b></p>}
                </div>
              ) : (
                <Button onClick={() => onCheckin(o)} disabled={busyId === o.id} data-testid={`checkin-btn-${o.id.slice(0, 8)}`}
                  className="bg-[#7A241F] hover:bg-[#5E1B17]">
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

const ACTION_META = {
  delete: { label: "Hapus", c: "bg-[#EF4444]/15 text-[#EF4444]" },
  verify: { label: "Verifikasi", c: "bg-[#2F703E]/15 text-[#255E33]" },
  reject: { label: "Tolak", c: "bg-[#B26A1E]/15 text-[#8A3A12]" },
  bulk_verify: { label: "Verifikasi Massal", c: "bg-[#2F703E]/15 text-[#255E33]" },
  bulk_reject: { label: "Tolak Massal", c: "bg-[#B26A1E]/15 text-[#8A3A12]" },
  checkin: { label: "Check-in", c: "bg-[#7A241F]/15 text-[#7A241F]" },
  user_create: { label: "Buat User", c: "bg-[#7A241F]/15 text-[#7A241F]" },
  user_delete: { label: "Hapus User", c: "bg-[#EF4444]/15 text-[#EF4444]" },
  walkin: { label: "Jual di Tempat", c: "bg-[#B26A1E]/15 text-[#8A3A12]" },
};

function LogsPanel() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await adminApi.get("/admin/logs"); setLogs(data); }
    catch { toast.error("Gagal memuat log"); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  const exportLogs = async () => {
    setExporting(true);
    try {
      const res = await adminApi.get("/admin/logs/export", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url; a.download = "log_aktivitas.xlsx";
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Log berhasil diunduh");
    } catch { toast.error("Gagal mengunduh log"); }
    setExporting(false);
  };
  return (
    <div className="rounded-2xl border border-border bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] no-print">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="font-serif-display text-2xl text-[#7A241F] flex items-center gap-2"><History className="h-5 w-5 text-[#B26A1E]" /> Log Aktivitas</h2>
          <p className="text-sm text-[#7A6A5E]">Catatan siapa melakukan aksi apa & kapan.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportLogs} disabled={exporting || logs.length === 0} data-testid="logs-export">
            {exporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />} Export Excel
          </Button>
          <Button variant="outline" onClick={load} data-testid="logs-refresh"><RefreshCw className="h-4 w-4 mr-1.5" /> Muat Ulang</Button>
        </div>
      </div>
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[#B26A1E]" /></div>
      ) : logs.length === 0 ? (
        <p className="text-center text-sm text-[#7A6A5E] py-12" data-testid="logs-empty">Belum ada aktivitas tercatat.</p>
      ) : (
        <div className="space-y-2" data-testid="logs-list">
          {logs.map((l) => {
            const m = ACTION_META[l.action] || { label: l.action, c: "bg-muted text-[#7A6A5E]" };
            return (
              <div key={l.id} className="flex items-start gap-3 rounded-xl border border-border p-3">
                <span className={cn("shrink-0 text-[11px] px-2 py-0.5 rounded-full font-medium", m.c)}>{m.label}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[#2C1E16]">{l.detail}</p>
                  <p className="text-xs text-[#7A6A5E] mt-0.5">
                    oleh <b>{l.actor_name || l.actor_username}</b> (@{l.actor_username}) · {fmtTime(l.created_at)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UsersPanel({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ username: "", name: "", password: "", role: "checkin" });
  const [busy, setBusy] = useState(false);
  const [delTarget, setDelTarget] = useState(null);
  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await adminApi.get("/admin/users"); setUsers(data); }
    catch { toast.error("Gagal memuat user"); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await adminApi.post("/admin/users", form);
      toast.success(`User "${form.username}" dibuat`);
      setForm({ username: "", name: "", password: "", role: "checkin" });
      await load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Gagal membuat user"); }
    setBusy(false);
  };
  const doDelete = async () => {
    if (!delTarget) return;
    setBusy(true);
    try {
      await adminApi.delete(`/admin/users/${delTarget.id}`);
      toast.success(`User "${delTarget.username}" dihapus`);
      setDelTarget(null);
      await load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Gagal menghapus user"); }
    setBusy(false);
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6 no-print">
      {/* Create form */}
      <div className="rounded-2xl border border-border bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] h-fit">
        <h2 className="font-serif-display text-2xl text-[#7A241F] flex items-center gap-2 mb-1"><UserPlus className="h-5 w-5 text-[#B26A1E]" /> Tambah User</h2>
        <p className="text-sm text-[#7A6A5E] mb-4">Buat akun login baru untuk panitia.</p>
        <form onSubmit={create} className="space-y-3">
          <div>
            <Label htmlFor="nu">Username</Label>
            <Input id="nu" data-testid="user-username" value={form.username} autoCapitalize="none"
              onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="mis. panitia1" className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="nn">Nama Lengkap</Label>
            <Input id="nn" data-testid="user-name" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="mis. Budi" className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="np">Password</Label>
            <Input id="np" data-testid="user-password" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="min. 4 karakter" className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="nr">Peran</Label>
            <select id="nr" data-testid="user-role" value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="mt-1.5 w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="checkin">Petugas Check-in (hanya check-in)</option>
              <option value="admin">Admin (verifikasi + hapus + check-in)</option>
              <option value="superadmin">Super Admin (semua + kelola user)</option>
            </select>
          </div>
          <Button type="submit" disabled={busy} data-testid="user-create-btn" className="w-full bg-[#7A241F] hover:bg-[#5E1B17]">
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <UserPlus className="h-4 w-4 mr-1.5" />} Buat User
          </Button>
        </form>
      </div>

      {/* List */}
      <div className="rounded-2xl border border-border bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif-display text-2xl text-[#7A241F] flex items-center gap-2"><Users className="h-5 w-5 text-[#B26A1E]" /> Daftar User</h2>
          <Button variant="outline" size="sm" onClick={load} data-testid="users-refresh"><RefreshCw className="h-4 w-4" /></Button>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#B26A1E]" /></div>
        ) : (
          <div className="space-y-2" data-testid="users-list">
            {users.map((u) => {
              const rb = ROLE_BADGE[u.role] || { t: u.role, c: "bg-muted" };
              return (
                <div key={u.id} data-testid={`user-row-${u.username}`} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#2C1E16] truncate">{u.name} <span className="text-xs text-[#7A6A5E] font-normal">@{u.username}</span></p>
                    <span className={cn("inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full font-medium", rb.c)}>{rb.t}</span>
                  </div>
                  {u.id === currentUser?.id ? (
                    <span className="text-[11px] text-[#7A6A5E]">Anda</span>
                  ) : (
                    <button onClick={() => setDelTarget(u)} data-testid={`user-delete-${u.username}`}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-[#EF4444] hover:bg-[#EF4444]/10">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!delTarget} onOpenChange={() => !busy && setDelTarget(null)}>
        <DialogContent data-testid="user-delete-dialog" className="max-w-sm rounded-2xl">
          <DialogHeader>
            <div className="h-11 w-11 rounded-full bg-[#EF4444]/15 flex items-center justify-center mb-2"><AlertTriangle className="h-5 w-5 text-[#EF4444]" /></div>
            <DialogTitle className="font-serif-display text-2xl text-[#7A241F]">Hapus user ini?</DialogTitle>
          </DialogHeader>
          {delTarget && (
            <p className="text-sm text-[#7A6A5E]">User <b className="text-[#2C1E16]">{delTarget.name} (@{delTarget.username})</b> tidak akan bisa login lagi. Tindakan ini tidak bisa dibatalkan.</p>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDelTarget(null)} disabled={busy} className="flex-1" data-testid="user-delete-cancel">Batal</Button>
            <Button onClick={doDelete} disabled={busy} className="flex-1 bg-[#EF4444] hover:bg-[#DC2626]" data-testid="user-delete-confirm">
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Trash2 className="h-4 w-4 mr-1.5" />} Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function WalkinPanel() {
  return (
    <div className="max-w-xl mx-auto no-print">
      <div className="rounded-2xl border border-border bg-white p-8 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <div className="h-14 w-14 rounded-full bg-[#B26A1E]/10 flex items-center justify-center mb-4 mx-auto">
          <Store className="h-7 w-7 text-[#B26A1E]" />
        </div>
        <h2 className="font-serif-display text-2xl text-[#7A241F]">Jual Tiket di Tempat</h2>
        <p className="text-sm text-[#7A6A5E] mt-1 mb-5 max-w-md mx-auto">
          Halaman khusus layar monitor: pembeli melihat peta kursi, petugas memilih kursi, langsung lunas & check-in. Ketersediaan kursi mengikuti sistem secara real-time.
        </p>
        <a href="/walkin" target="_blank" rel="noreferrer" data-testid="open-walkin"
          className="inline-flex items-center gap-2 bg-[#7A241F] hover:bg-[#5E1B17] text-white rounded-full px-6 py-3 text-sm font-medium">
          <Store className="h-4 w-4" /> Buka Halaman Jual di Tempat &rarr; /walkin
        </a>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(!!localStorage.getItem(ADMIN_TOKEN_KEY));
  const [currentUser, setCurrentUser] = useState(getAdminUser());
  const isSuper = currentUser?.role === "superadmin";
  const isStaff = currentUser?.role === "superadmin" || currentUser?.role === "admin";
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
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isStaff) { setLoading(false); return; }
    setLoading(true);
    try {
      const [o, s, e] = await Promise.all([
        adminApi.get("/admin/orders"),
        adminApi.get("/admin/stats"),
        api.get("/event"),
      ]);
      setOrders(o.data); setStats(s.data); setEvent(e.data);
    } catch (err) {
      if (err?.response?.status === 401) { clearAdminSession(); setCurrentUser(null); setAuthed(false); }
      else toast.error("Gagal memuat data");
    }
    setLoading(false);
  }, [isStaff]);

  useEffect(() => { if (authed) load(); }, [authed, load]);

  const onLoggedIn = () => { setCurrentUser(getAdminUser()); setAuthed(true); };

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

  const toggleComingSoon = async () => {
    const enable = !event?.coming_soon;
    try {
      await adminApi.post("/admin/coming-soon", { enabled: enable });
      toast.success(enable ? "Mode Coming Soon AKTIF — halaman depan menampilkan 'Tiket Segera Dibuka'" : "Penjualan tiket DIBUKA — pembeli sudah bisa memesan!");
      await load();
    } catch { toast.error("Gagal mengubah mode"); }
  };

  const logout = () => { clearAdminSession(); setCurrentUser(null); setAuthed(false); };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await adminApi.delete(`/admin/orders/${deleteTarget.id}`);
      toast.success(`Pesanan #${deleteTarget.order_no} dihapus permanen`);
      setDeleteTarget(null);
      setSelectedIds((p) => p.filter((x) => x !== deleteTarget.id));
      await load();
    } catch { toast.error("Gagal menghapus pesanan"); }
    setDeleteBusy(false);
  };

  const sendAndMarkWA = async (o) => {
    sendWA(o);
    try { await adminApi.post(`/admin/orders/${o.id}/wa-sent`); await load(); }
    catch { /* ignore */ }
  };

  const adminUpload = (o) => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*";
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setBusyId(o.id);
      try {
        const dataUrl = await compressImage(file);
        await api.post(`/orders/${o.id}/proof`, { proof_image: dataUrl });
        toast.success(`Bukti untuk ${o.name} berhasil diupload`);
        await load();
      } catch (err) { toast.error(err?.response?.data?.detail || "Gagal upload bukti"); }
      setBusyId(null);
    };
    input.click();
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

  if (!authed) return <LoginView onLogin={onLoggedIn} />;

  // Petugas Check-in tidak boleh akses panel verifikasi
  if (!isStaff) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center">
        <div className="rounded-2xl border border-border bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="h-12 w-12 rounded-full bg-[#2F703E]/10 flex items-center justify-center mb-4 mx-auto">
            <ScanLine className="h-6 w-6 text-[#2F703E]" />
          </div>
          <h1 className="font-serif-display text-2xl text-[#7A241F]">Halo, {currentUser?.name}</h1>
          <p className="text-sm text-[#7A6A5E] mt-1 mb-5">Akun Anda adalah <b>Petugas Check-in</b>, jadi hanya bisa mengakses halaman check-in peserta.</p>
          <a href="/checkin" data-testid="goto-checkin"
            className="inline-flex items-center gap-2 bg-[#7A241F] hover:bg-[#5E1B17] text-white rounded-full px-6 py-3 text-sm font-medium">
            <UserCheck className="h-4 w-4" /> Buka Halaman Check-in
          </a>
          <button onClick={logout} data-testid="checkin-role-logout" className="block mx-auto mt-5 text-xs text-[#EF4444] underline">Keluar</button>
        </div>
      </div>
    );
  }

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
          <h1 className="font-serif-display text-3xl text-[#7A241F]">Panel Admin</h1>
          <p className="text-sm text-[#7A6A5E] flex items-center gap-2">
            <span>Masuk sebagai <b className="text-[#2C1E16]">{currentUser?.name}</b></span>
            {currentUser?.role && (
              <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", (ROLE_BADGE[currentUser.role] || {}).c)}>
                {(ROLE_BADGE[currentUser.role] || {}).t}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportExcel} disabled={exporting} data-testid="btn-export">
            {exporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />} Export Excel
          </Button>
          <Button variant="outline" onClick={load} data-testid="btn-refresh"><RefreshCw className="h-4 w-4 mr-1.5" /> Muat Ulang</Button>
          <Button variant="ghost" onClick={logout} data-testid="btn-logout" className="text-[#EF4444]"><LogOut className="h-4 w-4 mr-1.5" /> Keluar</Button>
        </div>
      </div>

      {isSuper && event && (
        <div className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 sm:p-5 mb-6 no-print transition-colors",
          event.coming_soon ? "border-[#B26A1E]/50 bg-[#E8D8B6]/40" : "border-[#2F703E]/40 bg-[#2F703E]/[0.06]"
        )} data-testid="coming-soon-toggle-card">
          <div className="flex items-center gap-3 min-w-0">
            <span className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
              event.coming_soon ? "bg-[#B26A1E]/15 text-[#8A3A12]" : "bg-[#2F703E]/15 text-[#255E33]")}>
              {event.coming_soon ? <Clock className="h-5 w-5" /> : <Ticket className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-sm sm:text-base text-[#2C1E16]" data-testid="coming-soon-status">
                {event.coming_soon ? "Mode Coming Soon AKTIF — penjualan tiket ditutup" : "Penjualan tiket DIBUKA"}
              </p>
              <p className="text-xs text-[#7A6A5E]">
                {event.coming_soon
                  ? "Halaman depan menampilkan \"Tiket Segera Dibuka\". Geser untuk membuka penjualan."
                  : "Pembeli dapat memesan tiket di halaman depan. Geser untuk kembali ke Coming Soon."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className={cn("text-xs font-semibold", event.coming_soon ? "text-[#8A3A12]" : "text-[#255E33]")}>
              {event.coming_soon ? "Coming Soon" : "Penjualan Buka"}
            </span>
            <Switch checked={!event.coming_soon} onCheckedChange={toggleComingSoon}
              data-testid="coming-soon-switch" />
          </div>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 no-print">
          <StatCard icon={Clock} label="Perlu Verifikasi" value={stats.waiting_verification} color="bg-[#7A241F]/10 text-[#7A241F]" />
          <StatCard icon={CheckCircle2} label="Terverifikasi" value={stats.verified} color="bg-[#2F703E]/10 text-[#2F703E]" />
          <StatCard icon={Ticket} label="Tiket Terjual" value={stats.tickets_verified} color="bg-[#B26A1E]/10 text-[#B26A1E]" />
          <StatCard icon={Wallet} label="Pendapatan" value={rupiah(stats.revenue_verified)} color="bg-[#2F703E]/10 text-[#2F703E]" />
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex flex-wrap gap-2 mb-6 no-print">
        <button data-testid="admin-tab-payment" onClick={() => setTab("payment")}
          className={cn("px-4 py-2 rounded-full text-sm font-medium border transition-colors inline-flex items-center gap-1.5",
            tab === "payment" ? "bg-[#B26A1E] text-white border-[#B26A1E]" : "bg-white text-[#7A6A5E] border-border hover:border-[#B26A1E]/50")}>
          <Wallet className="h-4 w-4" /> Verifikasi Pembayaran
        </button>
        <button data-testid="admin-tab-checkin" onClick={() => setTab("checkin")}
          className={cn("px-4 py-2 rounded-full text-sm font-medium border transition-colors inline-flex items-center gap-1.5",
            tab === "checkin" ? "bg-[#7A241F] text-white border-[#7A241F]" : "bg-white text-[#7A6A5E] border-border hover:border-[#7A241F]/50")}>
          <UserCheck className="h-4 w-4" /> Check-in Peserta
        </button>
        <button data-testid="admin-tab-walkin" onClick={() => setTab("walkin")}
          className={cn("px-4 py-2 rounded-full text-sm font-medium border transition-colors inline-flex items-center gap-1.5",
            tab === "walkin" ? "bg-[#B26A1E] text-white border-[#B26A1E]" : "bg-white text-[#7A6A5E] border-border hover:border-[#B26A1E]/50")}>
          <Store className="h-4 w-4" /> Jual di Tempat
        </button>
        <button data-testid="admin-tab-logs" onClick={() => setTab("logs")}
          className={cn("px-4 py-2 rounded-full text-sm font-medium border transition-colors inline-flex items-center gap-1.5",
            tab === "logs" ? "bg-[#7A241F] text-white border-[#7A241F]" : "bg-white text-[#7A6A5E] border-border hover:border-[#7A241F]/50")}>
          <History className="h-4 w-4" /> Log Aktivitas
        </button>
        {isSuper && (
          <button data-testid="admin-tab-users" onClick={() => setTab("users")}
            className={cn("px-4 py-2 rounded-full text-sm font-medium border transition-colors inline-flex items-center gap-1.5",
              tab === "users" ? "bg-[#7A241F] text-white border-[#7A241F]" : "bg-white text-[#7A6A5E] border-border hover:border-[#7A241F]/50")}>
            <Users className="h-4 w-4" /> Kelola User
          </button>
        )}
      </div>

      {tab === "payment" && (<>
      {stats && <SalesSummary stats={stats} />}
      {stats && <DailySalesChart stats={stats} />}
      {/* Session control */}
      {event && (
        <div className="rounded-xl border border-border bg-white p-4 mb-6 no-print">
          <p className="text-sm font-medium text-[#7A241F] mb-2 flex items-center gap-2"><Users className="h-4 w-4" /> Kontrol Sesi (aktif: Sesi {event.active_session})</p>
          <div className="flex flex-wrap gap-2">
            {event.sessions.map((s) => (
              <button key={s.id} data-testid={`admin-session-${s.id}`} onClick={() => setActiveSession(s.id)}
                className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                  event.active_session === s.id ? "bg-[#B26A1E] text-white border-[#B26A1E]" : "bg-white text-[#7A6A5E] border-border hover:border-[#B26A1E]/50")}>
                {s.name} · {s.booked}/{s.capacity}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filter per sesi */}
      <div className="flex flex-wrap items-center gap-2 mb-3 no-print">
        <span className="text-xs text-[#7A6A5E] mr-1">Filter sesi:</span>
        <button data-testid="session-filter-all" onClick={() => setSessionFilter("all")}
          className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
            sessionFilter === "all" ? "bg-[#B26A1E] text-white border-[#B26A1E]" : "bg-white text-[#7A6A5E] border-border hover:border-[#B26A1E]/40")}>
          Semua Sesi
        </button>
        {[1, 2, 3, 4].map((sid) => (
          <button key={sid} data-testid={`session-filter-${sid}`} onClick={() => setSessionFilter(sid)}
            className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              sessionFilter === sid ? "bg-[#B26A1E] text-white border-[#B26A1E]" : "bg-white text-[#7A6A5E] border-border hover:border-[#B26A1E]/40")}>
            Sesi {sid} ({orders.filter((o) => o.session_id === sid).length})
          </button>
        ))}
      </div>

      {/* Filters status */}
      <div className="flex flex-wrap gap-2 mb-4 no-print">
        {FILTERS.map((f) => (
          <button key={f.k} data-testid={`filter-${f.k}`} onClick={() => setFilter(f.k)}
            className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              filter === f.k ? "bg-[#7A241F] text-white border-[#7A241F]" : "bg-white text-[#7A6A5E] border-border hover:border-[#7A241F]/40")}>
            {f.t}
          </button>
        ))}
      </div>

      {/* Search + bulk actions */}
      <div className="flex flex-wrap items-center gap-3 mb-4 no-print">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7A6A5E]" />
          <Input data-testid="orders-search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama, no HP, atau no order..." className="pl-9" />
        </div>
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2 rounded-full bg-[#7A241F]/5 border border-[#7A241F]/20 px-3 py-1.5">
            <span className="text-sm text-[#7A241F] font-medium" data-testid="bulk-count">{selectedIds.length} dipilih</span>
            <Button size="sm" onClick={() => bulkAct("verify")} disabled={bulkBusy} data-testid="bulk-verify"
              className="h-8 bg-[#2F703E] hover:bg-[#255E33]">
              {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />} Verifikasi
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkAct("reject")} disabled={bulkBusy} data-testid="bulk-reject"
              className="h-8 text-[#EF4444] border-[#EF4444]/40">
              <XCircle className="h-3.5 w-3.5 mr-1" /> Tolak
            </Button>
            <button onClick={() => setSelectedIds([])} className="text-xs text-[#7A6A5E] underline">bersihkan</button>
          </div>
        )}
      </div>

      {/* Orders table */}
      <div className="flex items-center justify-between mb-2 no-print">
        <h2 className="font-serif-display text-xl text-[#7A241F] flex items-center gap-2">
          <Wallet className="h-5 w-5 text-[#B26A1E]" /> Daftar Pesanan — Verifikasi Pembayaran
        </h2>
        <span className="text-xs text-[#7A6A5E]">{filtered.length} pesanan</span>
      </div>
      <p className="text-xs text-[#7A6A5E] mb-3 no-print">Klik <b>Lihat</b> pada kolom Bukti untuk melihat bukti transfer & memverifikasi.</p>
      <div className="rounded-2xl border border-border bg-white overflow-hidden no-print">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[#B26A1E]" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#7A6A5E]">Tidak ada pesanan yang cocok.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="orders-table">
              <thead className="bg-muted/50 text-left text-xs text-[#7A6A5E]">
                <tr>
                  <th className="px-3 py-3 font-medium">
                    <input type="checkbox" data-testid="select-all" checked={allSelected} onChange={toggleSelectAll}
                      disabled={selectableIds.length === 0} className="accent-[#7A241F] h-4 w-4 align-middle" />
                  </th>
                  <th className="px-4 py-3 font-medium">Pemesan</th>
                  <th className="px-4 py-3 font-medium">Waktu Pesan</th>
                  <th className="px-4 py-3 font-medium">Sesi / Kursi</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-center">Verifikasi</th>
                  <th className="px-4 py-3 font-medium text-center">Kirim Pesan</th>
                  <th className="px-4 py-3 font-medium text-center">Hapus</th>
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
                            className="accent-[#7A241F] h-4 w-4 align-middle" />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-[#2C1E16]">{o.name} <span className="font-mono text-[10px] text-[#7A6A5E]">#{o.order_no}</span></p>
                        <p className="text-xs text-[#7A6A5E]">{o.phone}</p>
                      </td>
                      <td className="px-4 py-3" data-testid={`order-time-${o.id.slice(0, 8)}`}>
                        <p className="text-xs text-[#7A6A5E] whitespace-nowrap">{fmtTime(o.created_at)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p>{o.session?.name}</p>
                        <p className="text-xs text-[#7A6A5E]">{o.seats.join(", ")}</p>
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#7A241F]">{rupiah(o.total_amount)}</td>
                      <td className="px-4 py-3">
                        <span data-testid={`status-${o.id.slice(0, 8)}`} className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium inline-block", dstat.c)}>{dstat.t}</span>
                      </td>
                      {/* Verifikasi */}
                      <td className="px-4 py-3 text-center">
                        {o.status === "waiting_verification" ? (
                          <Button size="sm" onClick={() => openProof(o)} data-testid={`verify-open-${o.id.slice(0, 8)}`}
                            className="h-8 bg-[#B26A1E] hover:bg-[#8A3A12] text-xs">
                            <Eye className="h-3.5 w-3.5 mr-1" /> Cek Bukti
                          </Button>
                        ) : o.status === "verified" ? (
                          <button onClick={() => o.has_proof && openProof(o)} data-testid={`verify-done-${o.id.slice(0, 8)}`}
                            className="inline-flex items-center gap-1 text-[#255E33] text-xs font-medium">
                            <CheckCircle2 className="h-4 w-4" /> Payment OK
                          </button>
                        ) : o.status === "pending_payment" ? (
                          <Button size="sm" variant="outline" onClick={() => adminUpload(o)} disabled={busyId === o.id}
                            data-testid={`admin-upload-${o.id.slice(0, 8)}`} className="h-8 text-xs border-[#7A241F]/40 text-[#7A241F]">
                            {busyId === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <UploadCloud className="h-3.5 w-3.5 mr-1" />} Upload Bukti
                          </Button>
                        ) : o.status === "expired" ? (
                          <Button size="sm" variant="outline" onClick={() => adminUpload(o)} disabled={busyId === o.id}
                            data-testid={`admin-upload-${o.id.slice(0, 8)}`} className="h-8 text-xs border-[#7A241F]/40 text-[#7A241F]">
                            {busyId === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <UploadCloud className="h-3.5 w-3.5 mr-1" />} Upload Bukti
                          </Button>
                        ) : (
                          <span className="text-xs text-[#7A6A5E]">—</span>
                        )}
                      </td>
                      {/* Kirim Pesan */}
                      <td className="px-4 py-3 text-center">
                        {o.status === "verified" ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <Button size="sm" onClick={() => sendAndMarkWA(o)} data-testid={`wa-${o.id.slice(0, 8)}`}
                              className={cn("h-8 text-xs", o.wa_sent ? "bg-white text-[#255E33] border border-[#2F703E]/50 hover:bg-[#2F703E]/10" : "bg-[#2F703E] hover:bg-[#255E33]")}>
                              <MessageCircle className="h-3.5 w-3.5 mr-1" /> {o.wa_sent ? "Kirim Ulang" : "Kirim Pesan"}
                            </Button>
                          </div>
                        ) : (o.status === "pending_payment" || o.status === "expired") ? (
                          <Button size="sm" onClick={() => sendReminderWA(o)} data-testid={`remind-${o.id.slice(0, 8)}`}
                            className="h-8 text-xs bg-[#B26A1E] hover:bg-[#8A3A12]">
                            <MessageCircle className="h-3.5 w-3.5 mr-1" /> Ingatkan Upload
                          </Button>
                        ) : (
                          <span className="text-xs text-[#7A6A5E]">—</span>
                        )}
                      </td>
                      {/* Hapus */}
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => setDeleteTarget(o)} data-testid={`delete-open-${o.id.slice(0, 8)}`}
                          title="Hapus pesanan"
                          className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
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

      {tab === "logs" && <LogsPanel />}

      {tab === "walkin" && <WalkinPanel />}

      {tab === "users" && isSuper && <UsersPanel currentUser={currentUser} />}

      {/* Proof viewer */}
      <Dialog open={!!proofView} onOpenChange={() => setProofView(null)}>
        <DialogContent data-testid="proof-dialog">
          <DialogHeader>
            <DialogTitle className="font-serif-display text-2xl text-[#7A241F]">
              {dialogVerified ? "Terverifikasi ✅" : "Verifikasi Pembayaran"}
            </DialogTitle>
          </DialogHeader>
          {proofView && (
            <div>
              <div className="text-sm mb-3 space-y-0.5">
                <p><b>{proofView.name}</b> <span className="font-mono text-xs text-[#7A6A5E]">#{proofView.order_no}</span></p>
                <p className="text-[#7A6A5E]">{proofView.phone} · {proofView.session?.name} · Kursi {proofView.seats.join(", ")}</p>
                <p>Nominal: <b className="text-[#B26A1E]">{rupiah(proofView.total_amount)}</b> (kode unik {proofView.unique_code})</p>
              </div>

              {!dialogVerified && (
                proofLoading ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#B26A1E]" /></div>
                ) : proofImage ? (
                  <img src={proofImage} alt="Bukti" className="w-full rounded-lg border border-border max-h-[45vh] object-contain bg-muted/30" />
                ) : (
                  <p className="text-sm text-[#7A6A5E] py-4 text-center">Bukti tidak tersedia.</p>
                )
              )}

              {dialogVerified ? (
                <div className="mt-4">
                  <div className="rounded-lg bg-[#2F703E]/10 p-4 text-center mb-3">
                    <CheckCircle2 className="h-8 w-8 text-[#2F703E] mx-auto mb-1" />
                    <p className="text-sm text-[#255E33] font-medium">Pembayaran diverifikasi. Kirim tiket ke pembeli via WhatsApp.</p>
                  </div>
                  <Button onClick={() => { sendAndMarkWA(proofView); }} data-testid="dialog-send-wa"
                    className="w-full bg-[#2F703E] hover:bg-[#255E33]">
                    <MessageCircle className="h-4 w-4 mr-1.5" /> Kirim Tiket via WhatsApp
                  </Button>
                  <Button variant="ghost" onClick={() => setProofView(null)} className="w-full mt-1 text-[#7A6A5E]" data-testid="dialog-close">
                    Selesai
                  </Button>
                </div>
              ) : proofView.status === "waiting_verification" ? (
                <div className="flex gap-2 mt-4">
                  <Button onClick={verifyInDialog} disabled={busyId === proofView.id} data-testid="dialog-verify"
                    className="flex-1 bg-[#2F703E] hover:bg-[#255E33]">
                    {busyId === proofView.id ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />} Payment Masuk
                  </Button>
                  <Button variant="outline" onClick={() => { act(proofView.id, "reject"); setProofView(null); }}
                    data-testid="dialog-reject" className="flex-1 text-[#EF4444] border-[#EF4444]/40">
                    <XCircle className="h-4 w-4 mr-1.5" /> Tolak
                  </Button>
                </div>
              ) : proofView.status === "verified" ? (
                <Button onClick={() => sendAndMarkWA(proofView)} data-testid="dialog-send-wa-2"
                  className="w-full mt-4 bg-[#2F703E] hover:bg-[#255E33]">
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
            <div className="h-11 w-11 rounded-full bg-[#2F703E]/15 flex items-center justify-center mb-2">
              <Ticket className="h-5 w-5 text-[#2F703E]" />
            </div>
            <DialogTitle className="font-serif-display text-2xl text-[#7A241F]">Peserta Sudah Datang</DialogTitle>
          </DialogHeader>
          {checkinPopup && (
            <div className="text-sm space-y-3">
              <p><b>{checkinPopup.name}</b> ({checkinPopup.phone}) — {checkinPopup.session?.name} · {checkinPopup.session?.time}</p>
              <p className="text-xs text-[#2F703E] font-medium">✓ Check-in tercatat: {fmtTime(new Date().toISOString())}</p>
              <div className="rounded-lg bg-[#B26A1E]/10 p-4">
                <p className="text-[#8A3A12] font-medium mb-2">Pastikan sudah serahkan tiket:</p>
                <p className="font-serif-display text-2xl text-[#7A241F] mb-2" data-testid="checkin-popup-session">{checkinPopup.session?.name?.toUpperCase()} · {checkinPopup.session?.time}</p>
                <p className="text-xs text-[#7A6A5E] mb-1">Nomor kursi <b className="text-[#8A3A12]">({checkinPopup.seats.length} tiket)</b>:</p>
                <div className="flex flex-wrap gap-2">
                  {checkinPopup.seats.map((s) => (
                    <span key={s} className="px-3 py-1.5 rounded-md bg-white text-[#8A3A12] font-bold text-base border border-[#B26A1E]/30">{s}</span>
                  ))}
                </div>
              </div>
              <p className="text-[#7A6A5E] text-xs">Jangan lupa memberikan tiket kursi di atas kepada peserta ini agar tidak terjadi double.</p>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button onClick={() => setCheckinPopup(null)} className="bg-[#7A241F] hover:bg-[#5E1B17] w-full" data-testid="checkin-popup-ok">
              Sudah Saya Berikan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => !deleteBusy && setDeleteTarget(null)}>
        <DialogContent data-testid="delete-dialog" className="max-w-sm rounded-2xl">
          <DialogHeader>
            <div className="h-11 w-11 rounded-full bg-[#EF4444]/15 flex items-center justify-center mb-2">
              <AlertTriangle className="h-5 w-5 text-[#EF4444]" />
            </div>
            <DialogTitle className="font-serif-display text-2xl text-[#7A241F]">Anda yakin hapus?</DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <div className="text-sm space-y-3">
              <p className="text-[#7A6A5E]">
                Pesanan berikut akan <b className="text-[#EF4444]">dihapus permanen</b> dan
                <b> tidak bisa dikembalikan</b>.
              </p>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="font-semibold text-[#2C1E16]">{deleteTarget.name} <span className="font-mono text-xs text-[#7A6A5E]">#{deleteTarget.order_no}</span></p>
                <p className="text-xs text-[#7A6A5E]">{deleteTarget.phone} · {deleteTarget.session?.name} · {rupiah(deleteTarget.total_amount)}</p>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteBusy}
              data-testid="delete-cancel" className="flex-1">
              Batal
            </Button>
            <Button onClick={doDelete} disabled={deleteBusy} data-testid="delete-confirm"
              className="flex-1 bg-[#EF4444] hover:bg-[#DC2626]">
              {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Trash2 className="h-4 w-4 mr-1.5" />} Ya, Hapus Permanen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Printable ticket */}
      {printOrder && (
        <div id="print-area" className="hidden print:block p-8">
          <div className="border-2 border-[#7A241F] rounded-xl p-6 max-w-md">
            <div className="flex items-center gap-3 border-b border-dashed border-gray-300 pb-3 mb-3">
              <img src={LOGOS.kbi} alt="KBI" className="h-10" />
              <img src={LOGOS.mbi} alt="MBI" className="h-10" />
            </div>
            <p className="text-xs text-gray-500">TIKET NONTON BERSAMA · Minggu, 13 September 2026 · CGV Grand Batam</p>
            <p className="font-serif-display text-xl text-[#7A241F] leading-tight mt-1">
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
