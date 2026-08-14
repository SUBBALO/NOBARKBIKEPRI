import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { adminApi, api, ADMIN_TOKEN_KEY, getAdminUser, setAdminSession, clearAdminSession, rupiah, LOGOS } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SeatMap } from "@/components/SeatMap";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Store, Banknote, QrCode, Landmark, Ticket, CheckCircle2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const SESSIONS = [
  { id: 1, name: "Sesi 1", time: "13:00 WIB" },
  { id: 2, name: "Sesi 2", time: "15:00 WIB" },
  { id: 3, name: "Sesi 3", time: "17:00 WIB" },
  { id: 4, name: "Sesi 4", time: "19:00 WIB" },
];
const PAY = [
  { k: "cash", t: "Cash", icon: Banknote },
  { k: "qris", t: "QRIS", icon: QrCode },
  { k: "transfer", t: "Transfer", icon: Landmark },
];
const PRICE = 50000;

function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/admin/login", { username, password });
      if (data.user.role !== "admin" && data.user.role !== "superadmin") {
        toast.error("Akun ini tidak boleh menjual tiket di tempat");
        setLoading(false);
        return;
      }
      setAdminSession(data.token, data.user);
      onLogin();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login gagal");
    }
    setLoading(false);
  };
  return (
    <div className="min-h-screen bg-[#7A241F] flex flex-col items-center justify-center px-6">
      <img src={LOGOS.kbi} alt="KBI" className="h-14 mb-6 bg-white/95 rounded-lg p-2" />
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-7 shadow-xl">
        <div className="h-12 w-12 rounded-full bg-[#B26A1E]/10 flex items-center justify-center mb-3">
          <Store className="h-6 w-6 text-[#B26A1E]" />
        </div>
        <h1 className="font-serif-display text-2xl text-[#7A241F]">Jual Tiket di Tempat</h1>
        <p className="text-sm text-[#7A6A5E] mb-5">Masuk dengan akun panitia (Admin).</p>
        <Label htmlFor="u">Username</Label>
        <Input id="u" value={username} autoCapitalize="none" onChange={(e) => setUsername(e.target.value)}
          className="mt-1.5 mb-3" data-testid="walkin-login-username" placeholder="username" />
        <Label htmlFor="p">Password</Label>
        <Input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5" data-testid="walkin-login-password" placeholder="••••••••" />
        <Button type="submit" disabled={loading} data-testid="walkin-login-btn"
          className="w-full mt-5 bg-[#B26A1E] hover:bg-[#8A3A12] rounded-full h-11">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null} Masuk
        </Button>
      </form>
    </div>
  );
}

export default function WalkinPage() {
  const [authed, setAuthed] = useState(!!localStorage.getItem(ADMIN_TOKEN_KEY));
  const [user, setUser] = useState(getAdminUser());
  const [sessionId, setSessionId] = useState(1);
  const [mapData, setMapData] = useState(null);
  const [loadingMap, setLoadingMap] = useState(true);
  const [selected, setSelected] = useState([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState("cash");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [transfer, setTransfer] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    api.get("/event").then(({ data }) => setTransfer(data.transfer)).catch(() => {});
  }, []);

  const loadMap = useCallback(async (sid, showSpinner = false) => {
    if (showSpinner) setLoadingMap(true);
    try {
      const { data } = await api.get(`/sessions/${sid}/seats`);
      setMapData(data);
    } catch { /* ignore transient */ }
    if (showSpinner) setLoadingMap(false);
  }, []);

  useEffect(() => {
    if (!authed) return;
    setSelected([]);
    loadMap(sessionId, true);
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => loadMap(sessionId, false), 5000);
    return () => pollRef.current && clearInterval(pollRef.current);
  }, [authed, sessionId, loadMap]);

  if (!authed) return <Login onLogin={() => { setUser(getAdminUser()); setAuthed(true); }} />;

  const isStaff = user?.role === "admin" || user?.role === "superadmin";
  if (!isStaff) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex flex-col items-center justify-center px-6 text-center">
        <p className="text-[#7A6A5E]">Akun Anda tidak diizinkan menjual tiket di tempat.</p>
        <button onClick={() => { clearAdminSession(); setAuthed(false); }} className="mt-3 text-xs text-[#EF4444] underline">Keluar</button>
      </div>
    );
  }

  const toggle = (label, partner = null) => {
    setSelected((p) => {
      const pair = partner ? [label, partner] : [label];
      if (p.includes(label)) return p.filter((x) => !pair.includes(x));
      return [...p.filter((x) => !pair.includes(x)), ...pair];
    });
  };

  const total = selected.length * PRICE;

  const submit = async () => {
    if (!name.trim()) { toast.error("Isi nama pembeli"); return; }
    if (selected.length === 0) { toast.error("Pilih minimal 1 kursi"); return; }
    setBusy(true);
    try {
      const { data } = await adminApi.post("/admin/walkin", {
        name, phone, session_id: sessionId, seats: selected, payment_method: method,
      });
      setResult(data);
      setName(""); setPhone(""); setSelected([]);
      loadMap(sessionId, false);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Gagal membuat tiket");
      loadMap(sessionId, false);
    }
    setBusy(false);
  };

  const remaining = mapData ? (mapData.capacity - mapData.booked) : null;
  const sold = mapData && remaining <= 0;

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-[#7A241F] text-white">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={LOGOS.kbi} alt="KBI" className="h-8 bg-white/95 rounded p-1" />
            <div>
              <p className="text-sm font-semibold leading-tight flex items-center gap-1.5"><Store className="h-4 w-4" /> Jual Tiket di Tempat</p>
              <p className="text-[11px] text-white/70 leading-tight">Petugas: {user?.name}</p>
            </div>
          </div>
          <button onClick={() => { clearAdminSession(); setAuthed(false); }} data-testid="walkin-logout" className="text-xs text-white/80 underline">Keluar</button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-5 grid lg:grid-cols-3 gap-6">
        {/* Seat map — the big monitor area */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex flex-wrap gap-2">
              {SESSIONS.map((s) => (
                <button key={s.id} data-testid={`walkin-session-${s.id}`} onClick={() => setSessionId(s.id)}
                  className={cn("px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                    sessionId === s.id ? "bg-[#B26A1E] text-white border-[#B26A1E]" : "bg-white text-[#7A6A5E] border-border hover:border-[#B26A1E]/50")}>
                  {s.name} · {s.time}
                </button>
              ))}
            </div>
            <button onClick={() => loadMap(sessionId, true)} className="inline-flex items-center gap-1 text-xs text-[#7A6A5E] hover:text-[#B26A1E]">
              <RefreshCw className="h-3.5 w-3.5" /> Perbarui
            </button>
          </div>

          {mapData && (
            <p className="text-sm mb-3" data-testid="walkin-remaining">
              {sold ? <span className="font-semibold text-[#EF4444]">Kursi sesi ini habis terjual</span>
                : <>Sisa <b className="text-[#255E33] text-lg">{remaining}</b> kursi · {mapData.booked}/{mapData.capacity} terisi</>}
            </p>
          )}

          {loadingMap ? (
            <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-[#B26A1E]" /></div>
          ) : mapData ? (
            <SeatMap rows={mapData.rows} selected={selected} onToggle={toggle} couples={mapData.couples || {}} allowDisability />
          ) : (
            <p className="text-center text-sm text-[#7A6A5E] py-16">Gagal memuat peta kursi.</p>
          )}
        </div>

        {/* Order form */}
        <div className="rounded-2xl border border-border bg-white p-5 h-fit lg:sticky lg:top-20">
          <h2 className="font-serif-display text-xl text-[#7A241F] mb-3">Data Pembeli</h2>
          <Label htmlFor="wn">Nama</Label>
          <Input id="wn" data-testid="walkin-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama pembeli" className="mt-1.5 mb-3" />
          <Label htmlFor="wp">No. HP <span className="text-[#9CA3AF]">(opsional)</span></Label>
          <Input id="wp" data-testid="walkin-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xxxx" className="mt-1.5 mb-4" />

          <Label>Metode Pembayaran</Label>
          <div className="grid grid-cols-3 gap-2 mt-1.5 mb-2">
            {PAY.map((m) => {
              const Icon = m.icon; const active = method === m.k;
              return (
                <button type="button" key={m.k} data-testid={`walkin-pay-${m.k}`} onClick={() => setMethod(m.k)}
                  className={cn("rounded-xl border p-2.5 text-center transition-colors",
                    active ? "border-[#B26A1E] bg-[#B26A1E]/5 ring-2 ring-[#B26A1E]/30" : "border-border hover:border-[#B26A1E]/50")}>
                  <Icon className={cn("h-5 w-5 mx-auto mb-0.5", active ? "text-[#B26A1E]" : "text-[#7A6A5E]")} />
                  <span className="text-xs font-medium text-[#2C1E16]">{m.t}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-[#7A6A5E] mb-4">{method === "cash" ? "Cash: nominal pas, tanpa kode unik." : "Nominal akan ditambah kode unik otomatis."}</p>

          <div className="rounded-lg bg-muted/40 p-3 mb-2">
            <p className="text-xs text-[#7A6A5E] mb-1">Kursi dipilih ({selected.length})</p>
            <div className="flex flex-wrap gap-1.5 min-h-[28px]" data-testid="walkin-selected-seats">
              {selected.length === 0 ? <span className="text-xs text-[#9CA3AF]">Belum ada kursi dipilih</span>
                : selected.map((s) => <span key={s} className="px-2.5 py-1 rounded-md bg-[#B26A1E]/10 text-[#8A3A12] text-sm font-bold">{s}</span>)}
            </div>
          </div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-[#7A6A5E]">Total {method === "cash" ? "(pas)" : "(+ kode unik)"}</span>
            <span className="font-serif-display text-2xl text-[#B26A1E]" data-testid="walkin-total">{rupiah(total)}</span>
          </div>

          <Button onClick={submit} disabled={busy || selected.length === 0} data-testid="walkin-submit"
            className="w-full h-12 bg-[#7A241F] hover:bg-[#5E1B17] text-base">
            {busy ? <Loader2 className="h-5 w-5 animate-spin mr-1.5" /> : <Ticket className="h-5 w-5 mr-1.5" />} Buat Tiket & Check-in
          </Button>
        </div>
      </div>

      {/* Result popup */}
      <Dialog open={!!result} onOpenChange={() => setResult(null)}>
        <DialogContent data-testid="walkin-result-dialog" className="max-w-3xl rounded-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-full bg-[#2F703E]/15 flex items-center justify-center shrink-0"><CheckCircle2 className="h-5 w-5 text-[#2F703E]" /></div>
              <div>
                <DialogTitle className="font-serif-display text-2xl text-[#7A241F]">Tiket Dibuat & Check-in ✅</DialogTitle>
                {result && <p className="text-sm text-[#7A6A5E] mt-0.5"><b className="text-[#2C1E16]">{result.name}</b> · <span className="font-mono text-xs">#{result.order_no}</span></p>}
              </div>
            </div>
          </DialogHeader>
          {result && (
            <div className="grid sm:grid-cols-2 gap-4 items-start text-sm">
              {/* Kolom kiri: instruksi pembayaran */}
              {result.payment_method === "qris" ? (
                <div className="rounded-lg border border-[#7A241F]/15 bg-[#7A241F]/[0.03] p-4 text-center" data-testid="walkin-pay-qris-info">
                  <p className="text-[#7A241F] font-medium mb-2">Silakan scan QRIS lalu bayar:</p>
                  <img src={LOGOS.qris} alt="QRIS" className="mx-auto max-h-[42vh] w-auto rounded-lg border border-border bg-white" />
                </div>
              ) : result.payment_method === "transfer" ? (
                <div className="rounded-lg border border-[#7A241F]/15 bg-[#7A241F]/[0.03] p-4" data-testid="walkin-pay-transfer-info">
                  <p className="text-[#7A241F] font-medium mb-2">Silakan transfer ke rekening:</p>
                  <div className="rounded-md bg-white border border-border p-3 space-y-1">
                    <p className="text-xs text-[#7A6A5E]">{transfer?.bank || "BCA"}</p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-2xl font-bold text-[#7A241F] tracking-wide">{transfer?.account_number}</span>
                      <button onClick={() => { navigator.clipboard?.writeText((transfer?.account_number || "").replace(/\s/g, "")); toast.success("No. rekening disalin"); }}
                        data-testid="walkin-copy-rek" className="text-[#B26A1E] text-xs underline shrink-0">Salin</button>
                    </div>
                    <p className="text-xs text-[#7A6A5E]">a.n. {transfer?.account_name}</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-[#2F703E]/20 bg-[#2F703E]/[0.05] p-4 text-center flex flex-col items-center justify-center" data-testid="walkin-pay-cash-info">
                  <Banknote className="h-10 w-10 text-[#2F703E] mb-2" />
                  <p className="text-[#255E33] font-medium">Terima pembayaran tunai</p>
                </div>
              )}

              {/* Kolom kanan: nominal + kursi */}
              <div className="space-y-4">
                <div className="rounded-lg bg-[#B26A1E]/10 p-4 text-center">
                  <p className="text-[#7A6A5E]">Nominal {result.payment_method === "cash" ? "(pas)" : "(WAJIB PAS)"}:</p>
                  <p className="font-serif-display text-4xl text-[#B26A1E] leading-tight">{rupiah(result.total_amount)}</p>
                  {result.unique_code ? <p className="text-xs text-[#7A6A5E]">termasuk kode unik {result.unique_code}</p> : null}
                </div>
                <div className="rounded-lg bg-[#7A241F]/[0.04] border border-[#7A241F]/10 p-4">
                  <p className="text-[#8A3A12] font-medium mb-2">🎟️ Serahkan tiket:</p>
                  <p className="font-serif-display text-2xl text-[#7A241F] mb-2" data-testid="walkin-result-session">
                    {(SESSIONS.find((s) => s.id === result.session_id)?.name || `Sesi ${result.session_id}`).toUpperCase()} · {SESSIONS.find((s) => s.id === result.session_id)?.time}
                  </p>
                  <p className="text-xs text-[#7A6A5E] mb-1">Nomor kursi:</p>
                  <div className="flex flex-wrap gap-2" data-testid="walkin-result-seats">
                    {result.seats.map((s) => (
                      <span key={s} className="px-3 py-1.5 rounded-md bg-white text-[#8A3A12] font-bold text-lg border border-[#B26A1E]/30">{s}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setResult(null)} className="w-full h-11 bg-[#7A241F] hover:bg-[#5E1B17]" data-testid="walkin-result-ok">Sudah Saya Serahkan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
