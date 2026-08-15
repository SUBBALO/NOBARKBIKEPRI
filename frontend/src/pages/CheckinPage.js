import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { adminApi, api, getAdminUser, clearAdminSession, setAdminSession, LOGOS } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2, Search, UserCheck, CheckCircle2, Ticket, ScanLine, X,
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

function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/admin/login", { username, password });
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
        <div className="h-12 w-12 rounded-full bg-[#7A241F]/10 flex items-center justify-center mb-3">
          <ScanLine className="h-6 w-6 text-[#7A241F]" />
        </div>
        <h1 className="font-serif-display text-2xl text-[#7A241F]">Check-in Peserta</h1>
        <p className="text-sm text-[#7A6A5E] mb-5">Masuk dengan akun Anda untuk mencatat kehadiran peserta.</p>
        <Label htmlFor="uname">Username</Label>
        <Input id="uname" value={username} onChange={(e) => setUsername(e.target.value)}
          className="mt-1.5 mb-3" data-testid="checkin-login-username" placeholder="username" autoCapitalize="none" />
        <Label htmlFor="pw">Password</Label>
        <Input id="pw" type="password" inputMode="text" value={password} onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5" data-testid="checkin-login-password" placeholder="••••••••" />
        <Button type="submit" disabled={loading} data-testid="checkin-login-btn"
          className="w-full mt-5 bg-[#B26A1E] hover:bg-[#8A3A12] rounded-full h-11">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null} Masuk
        </Button>
      </form>
    </div>
  );
}

export default function CheckinPage() {
  const [authed, setAuthed] = useState(!!getAdminUser());
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [popup, setPopup] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.get("/admin/participants");
      setParticipants(data);
    } catch (err) {
      if (err?.response?.status === 401) { clearAdminSession(); setAuthed(false); }
      else toast.error("Gagal memuat data");
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (authed) load(); }, [authed, load]);

  const doCheckin = async (o) => {
    setBusyId(o.id);
    try {
      const { data } = await adminApi.post(`/admin/orders/${o.id}/checkin`);
      setPopup(data);
      await load();
    } catch (err) { toast.error("Gagal check-in"); }
    setBusyId(null);
  };

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  const q = query.trim().toLowerCase();
  const nq = q.replace(/[\s-]/g, "");
  const results = q.length === 0 ? participants : participants.filter(
    (o) =>
      o.name.toLowerCase().includes(q) ||
      o.phone.replace(/[\s-]/g, "").includes(nq) ||
      String(o.order_no || "").includes(nq)
  );
  const totalHadir = participants.filter((o) => o.checked_in).length;

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-[#7A241F] text-white">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={LOGOS.kbi} alt="KBI" className="h-8 bg-white/95 rounded p-1" />
            <div>
              <p className="text-sm font-semibold leading-tight">Check-in Peserta</p>
              <p className="text-[11px] text-white/70 leading-tight">Nonton Bersama · MBI Kepri</p>
            </div>
          </div>
          <button onClick={() => { adminApi.post("/admin/logout").catch(() => {}); clearAdminSession(); setAuthed(false); }}
            data-testid="checkin-logout" className="text-xs text-white/80 underline">Keluar</button>
        </div>
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7A6A5E]" />
            <Input data-testid="checkin-search-mobile" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama, nomor HP, atau no. order..." className="pl-9 pr-9 h-11 bg-white text-[#2C1E16]" />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7A6A5E]">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="text-[11px] text-white/70 mt-2">
            {totalHadir}/{participants.length} peserta sudah hadir
          </p>
        </div>
      </div>

      <div className="px-4 py-4 max-w-lg mx-auto space-y-3 pb-20">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[#B26A1E]" /></div>
        ) : results.length === 0 ? (
          <p className="text-center text-sm text-[#7A6A5E] py-16">
            {participants.length === 0 ? "Belum ada peserta terverifikasi." : "Tidak ada peserta yang cocok."}
          </p>
        ) : (
          results.map((o) => (
            <motion.div key={o.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              data-testid={`checkin-card-${o.id.slice(0, 8)}`}
              className={cn("rounded-2xl border bg-white p-4 shadow-sm",
                o.checked_in ? "border-[#2F703E]/40 bg-[#2F703E]/5" : "border-border")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-[#2C1E16] truncate">{o.name}</p>
                    {o.order_no ? (
                      <span className="shrink-0 text-[11px] font-bold text-[#7A241F] bg-[#7A241F]/10 px-2 py-0.5 rounded-md">
                        #{o.order_no}
                      </span>
                    ) : null}
                    {o.channel === "vip" && <span className="shrink-0 text-[10px] font-bold text-[#B26A1E] bg-[#B26A1E]/15 px-2 py-0.5 rounded-md">VIP</span>}
                    {o.channel === "manual" && <span className="shrink-0 text-[10px] font-bold text-[#8A3A12] bg-[#B26A1E]/10 px-2 py-0.5 rounded-md">MANUAL</span>}
                  </div>
                  <p className="text-xs text-[#7A6A5E]">{o.phone}</p>
                  <p className="text-xs text-[#7A6A5E] mt-0.5">{o.session?.name} · {o.session?.time} · {o.qty} tiket</p>
                </div>
                {o.checked_in ? (
                  <span className="shrink-0 inline-flex items-center gap-1 text-xs text-[#255E33] font-medium bg-[#2F703E]/15 px-2 py-1 rounded-full">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Hadir
                  </span>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {o.seats.map((s) => (
                  <span key={s} className="px-3 py-1.5 rounded-lg bg-[#B26A1E]/10 text-[#8A3A12] text-base font-bold">{s}</span>
                ))}
              </div>

              {o.checked_in ? (
                <p className="text-[11px] text-[#7A6A5E] mt-3">
                  Check-in: {fmtTime(o.checked_in_at)}
                  {o.checked_in_by ? <> · oleh <b className="text-[#255E33]">{o.checked_in_by}</b></> : null}
                </p>
              ) : (
                <Button onClick={() => doCheckin(o)} disabled={busyId === o.id}
                  data-testid={`checkin-mobile-btn-${o.id.slice(0, 8)}`}
                  className="w-full mt-3 h-11 bg-[#7A241F] hover:bg-[#5E1B17] rounded-xl">
                  {busyId === o.id ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <UserCheck className="h-4 w-4 mr-1.5" />}
                  Tandai Sudah Datang
                </Button>
              )}
            </motion.div>
          ))
        )}
      </div>

      {/* Reminder popup */}
      <Dialog open={!!popup} onOpenChange={() => setPopup(null)}>
        <DialogContent data-testid="checkin-mobile-popup" className="max-w-sm rounded-2xl">
          <DialogHeader>
            <div className="h-11 w-11 rounded-full bg-[#2F703E]/15 flex items-center justify-center mb-2">
              <Ticket className="h-5 w-5 text-[#2F703E]" />
            </div>
            <DialogTitle className="font-serif-display text-2xl text-[#7A241F]">Peserta Sudah Datang</DialogTitle>
          </DialogHeader>
          {popup && (
            <div className="text-sm space-y-3">
              <p><b>{popup.name}</b> — {popup.session?.name} · {popup.session?.time}</p>
              <p className="text-xs text-[#2F703E] font-medium">✓ Check-in: {fmtTime(popup.checked_in_at || new Date().toISOString())}</p>
              <div className="rounded-lg bg-[#B26A1E]/10 p-4">
                <p className="text-[#8A3A12] font-medium mb-2">Serahkan tiket:</p>
                <p className="font-serif-display text-2xl text-[#7A241F] mb-2" data-testid="checkin-mobile-session">{popup.session?.name?.toUpperCase()} · {popup.session?.time}</p>
                <p className="text-xs text-[#7A6A5E] mb-1">Nomor kursi <b className="text-[#8A3A12]">({popup.seats.length} tiket)</b>:</p>
                <div className="flex flex-wrap gap-2">
                  {popup.seats.map((s) => (
                    <span key={s} className="px-3 py-1.5 rounded-md bg-white text-[#8A3A12] font-bold border border-[#B26A1E]/30">{s}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setPopup(null)} className="bg-[#7A241F] hover:bg-[#5E1B17] w-full h-11" data-testid="checkin-mobile-ok">
              Sudah Saya Berikan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
