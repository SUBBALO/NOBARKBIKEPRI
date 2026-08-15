import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { adminApi, api, getAdminUser, setAdminSession, clearAdminSession, rupiah, LOGOS } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SeatMap } from "@/components/SeatMap";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Store, Banknote, QrCode, Landmark, Ticket, CheckCircle2, RefreshCw, Lock, UploadCloud, Camera, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

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

const SESSIONS = [
  { id: 1, name: "Sesi 1", time: "09.30–11.30 WIB" },
  { id: 2, name: "Sesi 2", time: "12.00–14.00 WIB" },
  { id: 3, name: "Sesi 3", time: "14.30–16.30 WIB" },
  { id: 4, name: "Sesi 4", time: "17.00–19.00 WIB" },
];
const PAY = [
  { k: "cash", t: "Cash", icon: Banknote },
  { k: "qris", t: "QRIS", icon: QrCode },
  { k: "transfer", t: "Transfer", icon: Landmark },
];
const REF_COST = 60000;

function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/admin/login", { username, password });
      if (!["admin", "superadmin", "seller"].includes(data.user.role)) {
        toast.error("Akun ini tidak boleh menjual tiket di tempat");
        setLoading(false);
        return;
      }
      setAdminSession(data.user);
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
  const [authed, setAuthed] = useState(!!getAdminUser());
  const [user, setUser] = useState(getAdminUser());
  const [sessionId, setSessionId] = useState(1);
  const [mapData, setMapData] = useState(null);
  const [loadingMap, setLoadingMap] = useState(true);
  const [selected, setSelected] = useState([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState(() => localStorage.getItem("walkin_location") || "");
  const [locHistory, setLocHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem("walkin_locations") || "[]"); } catch { return []; }
  });
  const [method, setMethod] = useState("cash");
  const [amountText, setAmountText] = useState("");
  const [proof, setProof] = useState(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [transfer, setTransfer] = useState(null);
  const [walkinSessions, setWalkinSessions] = useState({});
  const pollRef = useRef(null);

  const loadEvent = useCallback(async () => {
    try {
      const { data } = await api.get("/event");
      setTransfer(data.transfer);
      const map = {};
      (data.sessions || []).forEach((s) => { map[s.id] = !!s.walkin_open; });
      setWalkinSessions(map);
    } catch (e) { console.error("Gagal memuat status sesi:", e); }
  }, []);

  useEffect(() => { loadEvent(); }, [loadEvent]);

  const loadMap = useCallback(async (sid, showSpinner = false) => {
    if (showSpinner) setLoadingMap(true);
    try {
      const { data } = await api.get(`/sessions/${sid}/seats`);
      setMapData(data);
    } catch (e) { console.error("Gagal memuat peta kursi:", e); }
    if (showSpinner) setLoadingMap(false);
  }, []);

  useEffect(() => {
    if (!authed) return;
    setSelected([]);
    loadMap(sessionId, true);
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => { loadMap(sessionId, false); loadEvent(); }, 5000);
    return () => pollRef.current && clearInterval(pollRef.current);
  }, [authed, sessionId, loadMap, loadEvent]);

  if (!authed) return <Login onLogin={() => { setUser(getAdminUser()); setAuthed(true); }} />;

  const isStaff = ["admin", "superadmin", "seller"].includes(user?.role);
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

  const amount = parseInt(amountText || "0", 10) || 0;
  const refTotal = selected.length * REF_COST;
  const total = amount;

  const submit = async () => {
    if (!walkinSessions[sessionId]) { toast.error("Sesi ini belum dibuka untuk panitia (lokasi)"); return; }
    if (!name.trim()) { toast.error("Isi nama pembeli"); return; }
    if (selected.length === 0) { toast.error("Pilih minimal 1 kursi"); return; }
    if (amount <= 0) { toast.error("Isi nominal dana sukarela"); return; }
    if (!location.trim()) { toast.error("Isi lokasi penjualan"); return; }
    if (method !== "cash" && !proof) { toast.error("Untuk QRIS/Transfer wajib upload foto bukti pembayaran"); return; }
    setBusy(true);
    try {
      const { data } = await adminApi.post("/admin/walkin", {
        name, phone, session_id: sessionId, seats: selected, payment_method: method, amount,
        proof_image: method !== "cash" ? proof : null,
        location: location.trim(),
      });
      localStorage.setItem("walkin_location", location.trim());
      const loc = location.trim();
      const nextHist = [loc, ...locHistory.filter((l) => l.toLowerCase() !== loc.toLowerCase())].slice(0, 12);
      setLocHistory(nextHist);
      localStorage.setItem("walkin_locations", JSON.stringify(nextHist));
      setResult(data);
      setName(""); setPhone(""); setSelected([]); setAmountText(""); setProof(null);
      loadMap(sessionId, false);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Gagal membuat tiket");
      loadMap(sessionId, false);
    }
    setBusy(false);
  };

  const remaining = mapData ? (mapData.capacity - mapData.booked) : null;
  const sold = mapData && remaining <= 0;
  const sessionWalkinOpen = walkinSessions[sessionId];

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
          <button onClick={() => { adminApi.post("/admin/logout").catch(() => {}); clearAdminSession(); setAuthed(false); }} data-testid="walkin-logout" className="text-xs text-white/80 underline">Keluar</button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-5 grid lg:grid-cols-3 gap-6">
        {/* Seat map — the big monitor area */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex flex-wrap gap-2">
              {SESSIONS.map((s) => {
                const isWalkinOpen = walkinSessions[s.id];
                return (
                  <button key={s.id} data-testid={`walkin-session-${s.id}`} onClick={() => setSessionId(s.id)}
                    className={cn("px-3 py-1.5 rounded-full text-sm font-medium border transition-colors relative",
                      sessionId === s.id ? "bg-[#B26A1E] text-white border-[#B26A1E]"
                        : isWalkinOpen ? "bg-white text-[#7A6A5E] border-border hover:border-[#B26A1E]/50"
                          : "bg-muted/50 text-[#9CA3AF] border-border")}>
                    {s.name} · {s.time}
                    <span className={cn("ml-1.5 text-[10px] font-semibold", isWalkinOpen ? (sessionId === s.id ? "text-white/90" : "text-[#255E33]") : "text-[#B26A1E]")}>
                      {isWalkinOpen ? "• BUKA" : "• TUTUP"}
                    </span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => loadMap(sessionId, true)} className="inline-flex items-center gap-1 text-xs text-[#7A6A5E] hover:text-[#B26A1E]">
              <RefreshCw className="h-3.5 w-3.5" /> Perbarui
            </button>
          </div>

          {mapData && sessionWalkinOpen && (
            <p className="text-sm mb-3" data-testid="walkin-remaining">
              {sold ? <span className="font-semibold text-[#EF4444]">Kursi sesi ini habis terjual</span>
                : <>Sisa <b className="text-[#255E33] text-lg">{remaining}</b> kursi · {mapData.booked}/{mapData.capacity} terisi</>}
            </p>
          )}

          {!sessionWalkinOpen ? (
            <div className="rounded-xl border border-[#B26A1E]/40 bg-[#F3E9DD]/50 p-8 text-center" data-testid="walkin-session-closed">
              <Store className="h-10 w-10 text-[#B26A1E] mx-auto mb-3" />
              <p className="font-semibold text-[#7A241F]">Sesi ini belum dibuka untuk penjualan panitia</p>
              <p className="text-sm text-[#7A6A5E] mt-1 max-w-sm mx-auto">
                Minta <b>Super Admin</b> membuka sesi ini lewat panel admin
                (Verifikasi Pembayaran → Buka/Tutup Penjualan per Sesi → saklar <b>Panitia (Lokasi)</b>), lalu pilih sesi ini lagi.
              </p>
            </div>
          ) : loadingMap ? (
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
          <Input id="wp" data-testid="walkin-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xxxx" className="mt-1.5 mb-3" />

          <Label htmlFor="wl">Lokasi Penjualan <span className="text-[#EF4444]">*</span></Label>
          <div className="relative mt-1.5 mb-1">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#B26A1E]" />
            <Input id="wl" data-testid="walkin-location" value={location} onChange={(e) => setLocation(e.target.value)}
              list="walkin-loc-list" autoComplete="off"
              placeholder="mis. Vihara Duta Maitreya" className="pl-9" />
            <datalist id="walkin-loc-list">
              {locHistory.map((l) => <option key={l} value={l} />)}
            </datalist>
          </div>
          {locHistory.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4" data-testid="walkin-loc-suggestions">
              {locHistory.slice(0, 5).map((l) => (
                <button key={l} type="button" onClick={() => setLocation(l)}
                  className={cn("text-[11px] rounded-full px-2.5 py-1 border transition-colors",
                    location.trim().toLowerCase() === l.toLowerCase()
                      ? "bg-[#B26A1E] text-white border-[#B26A1E]"
                      : "bg-white text-[#7A6A5E] border-border hover:border-[#B26A1E]")}>
                  {l}
                </button>
              ))}
            </div>
          )}

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
          <div className="rounded-lg border border-[#B26A1E]/30 bg-[#F3E9DD]/50 p-3 mb-3">
            <p className="text-xs font-semibold text-[#7A241F]">Dana Sukarela</p>
            <p className="text-[11px] text-[#7A6A5E]">Acuan {selected.length || 0} tiket × Rp60.000 = <b>{rupiah(refTotal)}</b></p>
            <p className="text-sm font-semibold text-[#7A241F] mt-1.5" data-testid="walkin-free-note">
              Nominal tetap <span className="text-[#B26A1E]">bebas</span> sesuai kerelaan 🙏
            </p>
            <div className="relative mt-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#7A6A5E]">Rp</span>
              <Input data-testid="walkin-amount" inputMode="numeric"
                value={amount ? amount.toLocaleString("id-ID") : ""}
                onChange={(e) => setAmountText(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="0" className="pl-9 h-11 text-base font-semibold bg-white" />
            </div>
          </div>

          {method !== "cash" && (
            <div className="rounded-lg border border-[#7A241F]/30 bg-[#7A241F]/[0.03] p-3 mb-3" data-testid="walkin-proof-box">
              <p className="text-xs font-semibold text-[#7A241F] flex items-center gap-1.5">
                <Camera className="h-4 w-4" /> Foto Bukti Pembayaran <span className="text-[#EF4444]">(wajib)</span>
              </p>
              <p className="text-[11px] text-[#7A6A5E] mb-2">Untuk {method === "qris" ? "QRIS" : "Transfer"}, foto/screenshot bukti bayar pembeli.</p>
              {proof ? (
                <div className="relative">
                  <img src={proof} alt="Bukti" className="w-full max-h-40 object-contain rounded-md border border-border bg-white" data-testid="walkin-proof-preview" />
                  <button type="button" onClick={() => setProof(null)} data-testid="walkin-proof-remove"
                    className="mt-1.5 text-[11px] text-[#EF4444] underline">Ganti foto</button>
                </div>
              ) : (
                <label data-testid="walkin-proof-upload"
                  className="flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-[#B26A1E]/40 bg-white py-4 cursor-pointer hover:border-[#B26A1E]">
                  {uploadingProof ? <Loader2 className="h-5 w-5 animate-spin text-[#B26A1E]" /> : <UploadCloud className="h-5 w-5 text-[#B26A1E]" />}
                  <span className="text-[11px] font-medium text-[#7A241F]">{uploadingProof ? "Memproses..." : "Ambil / Upload Foto"}</span>
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploadingProof(true);
                      try { setProof(await compressImage(file)); }
                      catch { toast.error("Gagal memproses foto"); }
                      setUploadingProof(false);
                    }} />
                </label>
              )}
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-[#7A6A5E]">Total {method === "cash" ? "(pas)" : "(+ kode unik)"}</span>
            <span className="font-serif-display text-2xl text-[#B26A1E]" data-testid="walkin-total">{rupiah(total)}</span>
          </div>

          <Button onClick={submit} disabled={busy || selected.length === 0 || !sessionWalkinOpen || !location.trim() || (method !== "cash" && !proof)} data-testid="walkin-submit"
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
