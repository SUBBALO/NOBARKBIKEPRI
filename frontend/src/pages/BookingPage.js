import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { api, rupiah } from "@/lib/apiClient";
import { SeatMap } from "@/components/SeatMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft, ArrowRight, User, Clock, Armchair, QrCode, Landmark,
  Lock, CheckCircle2, AlertTriangle, Loader2, CalendarDays,
  UploadCloud, HandHeart,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { n: 1, label: "Data Diri", icon: User },
  { n: 2, label: "Pilih Sesi", icon: Clock },
  { n: 3, label: "Pilih Kursi", icon: Armchair },
  { n: 4, label: "Pembayaran", icon: QrCode },
];

const REF_COST = 60000; // biaya pengadaan rata-rata per orang (acuan dana sukarela)
const POSTER_URL = "https://customer-assets-lxgj4vgw.emergentagent.net/job_qris-payment-7/artifacts/h7ivo2nv_POSTER.webp";

const SessionCard = ({ s, active, selected, onSelect }) => {
  const disabled = s.status !== "open";
  const badge = {
    open: { t: "Dibuka", c: "bg-[#2F703E]/15 text-[#255E33]" },
    locked: { t: "Belum Dibuka", c: "bg-[#7A6A5E]/15 text-[#7A6A5E]" },
    full: { t: "Penuh", c: "bg-[#EF4444]/15 text-[#EF4444]" },
    closed: { t: "Belum Dibuka", c: "bg-[#7A6A5E]/15 text-[#7A6A5E]" },
  }[s.status];
  const remaining = Math.max(0, (s.capacity || 0) - (s.booked || 0));
  const pct = s.capacity ? Math.min(100, Math.round((s.booked / s.capacity) * 100)) : 0;
  const low = remaining > 0 && remaining <= 20;
  return (
    <button
      type="button"
      data-testid={`session-${s.id}`}
      disabled={disabled}
      onClick={() => onSelect(s.id)}
      className={cn(
        "text-left rounded-xl border p-5 transition-colors duration-200 relative",
        disabled ? "opacity-60 cursor-not-allowed bg-muted/40 border-border" :
          selected === s.id ? "border-[#B26A1E] bg-[#B26A1E]/5 ring-2 ring-[#B26A1E]/30" :
            "border-border bg-white hover:border-[#B26A1E]/50"
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-serif-display text-2xl text-[#7A241F]">{s.name}</span>
        <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", badge.c)}>{badge.t}</span>
      </div>
      <p className="text-sm text-[#7A6A5E]">Pukul {s.time}</p>

      {s.status === "open" ? (
        <div className="mt-3" data-testid={`session-remaining-${s.id}`}>
          <div className="flex items-baseline gap-1.5">
            <span className={cn("font-serif-display text-3xl leading-none", low ? "text-[#B26A1E]" : "text-[#255E33]")}>{remaining}</span>
            <span className="text-xs font-medium text-[#7A6A5E]">kursi tersisa</span>
            {low && (
              <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-[#8A3A12] bg-[#B26A1E]/10 px-2 py-0.5 rounded-full">
                <AlertTriangle className="h-3 w-3" /> Segera penuh
              </span>
            )}
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div className={cn("h-full rounded-full transition-all", low ? "bg-[#B26A1E]" : "bg-[#2F703E]")} style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[11px] text-[#7A6A5E] mt-1">{s.booked}/{s.capacity} kursi terisi</p>
        </div>
      ) : s.status === "full" ? (
        <p className="text-sm font-semibold text-[#EF4444] mt-3" data-testid={`session-remaining-${s.id}`}>Kursi habis terjual</p>
      ) : (
        <p className="text-xs text-[#7A6A5E] mt-3">{s.booked}/{s.capacity} kursi terisi</p>
      )}

      {disabled && s.status === "locked" && (
        <span className="absolute top-4 right-4 text-[#7A6A5E]"><Lock className="h-3.5 w-3.5" /></span>
      )}
    </button>
  );
};

const ComingSoonView = ({ event }) => (
  <div className="max-w-3xl mx-auto px-4 sm:px-8 py-10 sm:py-16" data-testid="coming-soon-view">
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
      className="relative overflow-hidden rounded-3xl border border-[#5E1B17] bg-[#7A241F] text-white grain shadow-xl shadow-amber-900/10 text-center p-6 sm:p-12"
    >
      <div className="absolute -right-20 -top-16 h-72 w-72 rounded-full bg-[#B26A1E]/30 blur-3xl z-0" />
      <div className="absolute -left-16 -bottom-20 h-64 w-64 rounded-full bg-[#E4C57E]/20 blur-3xl z-0" />
      <div className="relative z-10 flex flex-col items-center">
        <img src={POSTER_URL} alt="Poster Ashin Jinarakkhita" data-testid="coming-soon-poster"
          className="w-auto max-h-[340px] sm:max-h-[440px] rounded-2xl border border-white/20 shadow-2xl shadow-black/40 bg-white/5" />
        <span className="mt-6 inline-flex items-center gap-2 text-xs sm:text-sm font-medium bg-white/10 px-4 py-1.5 rounded-full backdrop-blur">
          <CalendarDays className="h-4 w-4" /> {event?.date || "Minggu, 13 September 2026"} · {event?.location || "CGV Grand Batam"}
        </span>
        <p className="font-cursive text-2xl sm:text-3xl text-[#E4C57E] mt-4 leading-none">Nonton Bersama</p>
        <h1 className="font-serif-display text-3xl sm:text-5xl font-extrabold leading-[1.05] mt-1">
          ASHIN JINARAKKHITA
        </h1>
        <p className="text-sm sm:text-base text-white/85 mt-3 max-w-md">
          Film dokumenter — Jejak Langkah Sang Pelopor Membangkitkan Kembali Dharma di Nusantara.
        </p>
        <span data-testid="coming-soon-badge"
          className="mt-6 inline-flex items-center gap-2 bg-[#B26A1E] text-white text-base sm:text-lg font-semibold px-6 py-2.5 rounded-full shadow-lg shadow-black/20">
          <Clock className="h-5 w-5" /> Tiket Segera Dibuka
        </span>
        <p className="text-xs text-white/60 mt-3">Nantikan informasi pembukaan penjualan tiket.</p>
      </div>
    </motion.div>
  </div>
);

export default function BookingPage() {
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [event, setEvent] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [rows, setRows] = useState([]);
  const [couples, setCouples] = useState({});
  const [seatsLoading, setSeatsLoading] = useState(false);
  const [selected, setSelected] = useState([]);
  const [method, setMethod] = useState("qris");
  const [amountText, setAmountText] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadEvent = async () => {
    try {
      const { data } = await api.get("/event");
      setEvent(data);
      const openS = data.sessions.find((s) => s.status === "open");
      if (openS && !sessionId) setSessionId(openS.id);
    } catch (e) { toast.error("Gagal memuat data acara"); }
  };

  const loadSeats = async (id, silent = false) => {
    if (!silent) setSeatsLoading(true);
    try {
      const { data } = await api.get(`/sessions/${id}/seats`);
      setRows(data.rows);
      setCouples(data.couples || {});
      const bookedSet = new Set(
        data.rows.flatMap((r) => r.blocks.flat().filter((s) => s.status === "booked").map((s) => s.label))
      );
      setSelected((prev) => {
        const kept = prev.filter((l) => !bookedSet.has(l));
        if (silent && kept.length !== prev.length) {
          toast.info("Beberapa kursi pilihan Anda baru saja dipesan orang lain. Silakan pilih ulang.");
        }
        return kept;
      });
    } catch (e) {
      if (!silent) toast.error("Gagal memuat denah kursi");
    }
    if (!silent) setSeatsLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadEvent(); }, []);
  useEffect(() => { if (step === 3 && sessionId) loadSeats(sessionId); }, [step, sessionId]);
  useEffect(() => {
    if (step !== 3 || !sessionId) return;
    const t = setInterval(() => loadSeats(sessionId, true), 8000);
    return () => clearInterval(t);
  }, [step, sessionId]);

  const toggleSeat = (label, partner = null) => {
    setSelected((prev) => {
      const pair = partner ? [label, partner] : [label];
      if (prev.includes(label)) {
        return prev.filter((s) => !pair.includes(s));
      }
      return [...prev.filter((s) => !pair.includes(s)), ...pair];
    });
  };

  const next = () => {
    if (step === 1) {
      if (!name.trim() || !phone.trim()) return toast.error("Isi nama dan nomor HP dulu");
      if (!/^08[0-9]{7,}$/.test(phone.replace(/[^0-9]/g, ""))) return toast.error("Nomor HP wajib diawali 08 (mis. 0812xxxxxxx)");
    }
    if (step === 2 && !sessionId) return toast.error("Pilih sesi terlebih dahulu");
    if (step === 3 && selected.length === 0) return toast.error("Pilih minimal 1 kursi");
    setStep((s) => Math.min(4, s + 1));
  };
  const back = () => setStep((s) => Math.max(1, s - 1));

  const amount = parseInt(amountText || "0", 10) || 0;
  const total = amount;

  const submit = async () => {
    setSubmitting(true);
    try {
      const { data } = await api.post("/orders", {
        name, phone, session_id: sessionId, seats: selected, payment_method: method, amount,
      });
      toast.success("Pesanan dibuat! Segera lakukan pembayaran.");
      nav(`/order/${data.id}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gagal membuat pesanan");
      setConfirmOpen(false);
      if (step === 3 || e?.response?.status === 409) loadSeats(sessionId);
    }
    setSubmitting(false);
  };

  const activeSession = event?.sessions?.find((s) => s.id === sessionId);

  if (!event) {
    return (
      <div className="flex justify-center py-32" data-testid="event-loading">
        <Loader2 className="h-8 w-8 animate-spin text-[#B26A1E]" />
      </div>
    );
  }
  if (event.coming_soon) return <ComingSoonView event={event} />;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
      {/* Top banner: sudah berdana tapi lupa upload bukti */}
      <Link to="/upload" data-testid="link-upload-strip"
        className="flex items-center justify-between gap-2 rounded-xl border border-[#B26A1E]/40 bg-[#E8D8B6]/50 px-3 py-2 mb-4 hover:bg-[#E8D8B6]/80 transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <UploadCloud className="h-4 w-4 text-[#7A241F] shrink-0" />
          <p className="font-semibold text-[#7A241F] text-xs sm:text-sm truncate">Cek pesanan atau upload bukti dana Anda di sini</p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-white bg-[#7A241F] px-3 py-1.5 rounded-full">
          Cek / Upload <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </Link>

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-3xl border border-[#5E1B17] bg-[#7A241F] text-white mb-6 grain shadow-xl shadow-amber-900/10"
      >
        <div className="absolute -right-20 -top-16 h-72 w-72 rounded-full bg-[#B26A1E]/30 blur-3xl z-0" />
        <div className="absolute -left-16 -bottom-20 h-64 w-64 rounded-full bg-[#E4C57E]/20 blur-3xl z-0" />
        <div className="relative z-10 grid md:grid-cols-2 gap-6 items-center p-6 sm:p-8">
          {/* Text */}
          <div className="order-2 md:order-1">
            <span className="inline-flex items-center gap-2 text-xs font-medium bg-white/10 px-3 py-1 rounded-full backdrop-blur">
              <CalendarDays className="h-3.5 w-3.5" /> {event?.date || "Minggu, 13 September 2026"} · {event?.location || "CGV Grand Batam"}
            </span>
            <p className="font-cursive text-2xl sm:text-3xl text-[#E4C57E] mt-3 leading-none">Nonton Bersama</p>
            <h1 className="font-serif-display text-3xl sm:text-5xl font-extrabold leading-[1.05] mt-1">
              ASHIN<br className="hidden sm:block" /> JINARAKKHITA
            </h1>
            <p className="text-sm sm:text-base text-white/85 mt-3 max-w-md">
              Film dokumenter — Jejak Langkah Sang Pelopor Membangkitkan Kembali Dharma di Nusantara.
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <span className="inline-flex items-center gap-2 bg-[#B26A1E] text-white text-sm font-semibold px-4 py-2 rounded-full">
                Kontribusi Tiket: Dana Sukarela
              </span>
              <span className="text-xs text-white/70">QRIS atau Transfer BCA</span>
            </div>
          </div>
          {/* Poster */}
          <div className="order-1 md:order-2 flex justify-center md:justify-end">
            <img src={POSTER_URL} alt="Poster Ashin Jinarakkhita"
              data-testid="hero-poster"
              className="w-auto max-h-[240px] sm:max-h-[300px] md:max-h-[420px] rounded-2xl border border-white/20 shadow-2xl shadow-black/30 bg-white/5" />
          </div>
        </div>
      </motion.div>

      {/* Stepper */}
      <div className="flex items-center justify-between mb-6 max-w-2xl">
        {STEPS.map((s, i) => {
          const done = step > s.n;
          const cur = step === s.n;
          const Icon = s.icon;
          return (
            <div key={s.n} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div className={cn(
                  "h-9 w-9 rounded-full flex items-center justify-center transition-colors",
                  done ? "bg-[#2F703E] text-white" : cur ? "bg-[#B26A1E] text-white" : "bg-muted text-[#7A6A5E]"
                )}>
                  {done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-4 w-4" />}
                </div>
                <span className={cn("text-[11px] font-medium", cur ? "text-[#B26A1E]" : "text-[#7A6A5E]")}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn("h-0.5 flex-1 mx-2 rounded", step > s.n ? "bg-[#2F703E]" : "bg-border")} />
              )}
            </div>
          );
        })}
      </div>

      <motion.div
        key={step}
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="rounded-2xl border border-border bg-white p-4 sm:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
      >
        {/* STEP 1 */}
        {step === 1 && (
          <div className="max-w-md">
            <h2 className="font-serif-display text-3xl text-[#7A241F] mb-1">Data Diri</h2>
            <p className="text-sm text-[#7A6A5E] mb-6">Isi data pemesan tiket.</p>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Nama Lengkap</Label>
                <Input id="name" data-testid="input-name" value={name}
                  onChange={(e) => setName(e.target.value)} placeholder="Nama sesuai identitas" className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="phone">Nomor HP / WhatsApp</Label>
                <Input id="phone" data-testid="input-phone" value={phone}
                  inputMode="numeric"
                  onChange={(e) => {
                    let v = e.target.value.replace(/[^0-9]/g, "");
                    if (v.startsWith("62")) v = "0" + v.slice(2);
                    else if (v.startsWith("8")) v = "0" + v;
                    setPhone(v);
                  }} placeholder="08xxxxxxxxxx" className="mt-1.5" />
                <p className="text-[11px] text-[#7A6A5E] mt-1">Wajib diawali <b>08</b> agar tiket bisa dikirim via WhatsApp.</p>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div>
            <h2 className="font-serif-display text-3xl text-[#7A241F] mb-1">Pilih Sesi</h2>
            <p className="text-sm text-[#7A6A5E] mb-6">
              Tekan sesi yang dibuka untuk langsung memilih kursi. Sesi dibuka bertahap oleh panitia.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {event?.sessions?.map((s) => (
                <SessionCard key={s.id} s={s} selected={sessionId}
                  onSelect={(id) => { setSessionId(id); setSelected([]); setStep(3); }} />
              ))}
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div>
            <div className="flex flex-wrap items-end justify-between gap-2 mb-6">
              <div>
                <h2 className="font-serif-display text-3xl text-[#7A241F] mb-1">Pilih Kursi</h2>
                <p className="text-sm text-[#7A6A5E]">
                  {activeSession ? `${activeSession.name} · ${activeSession.time}` : ""} — pilih kursi sebanyak yang dibutuhkan. Denah diperbarui otomatis.
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-[#7A6A5E]">Terpilih</p>
                <p className="font-semibold text-[#B26A1E]" data-testid="selected-seats-label">
                  {selected.length ? selected.join(", ") : "—"}
                </p>
              </div>
            </div>
            {seatsLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[#B26A1E]" /></div>
            ) : (
              <>
                <div className="rounded-xl border border-[#B26A1E]/30 bg-[#F3E9DD]/60 p-3.5 mb-5 text-xs sm:text-sm text-[#5B4636] space-y-1" data-testid="seat-info-box">
                  <p><span className="inline-block h-3 w-3 rounded-sm bg-[#F9A8D4] mr-1.5 align-middle" /><b>Kursi Sweetbox (pink)</b> wajib untuk 2 orang — klik satu, pasangannya ikut terpilih otomatis.</p>
                  <p><span className="inline-block h-3 w-3 rounded-sm bg-[#6EE7B7] mr-1.5 align-middle" /><b>Kursi disabilitas (hijau)</b> hanya dijual di lokasi acara — hubungi panitia bila membutuhkan.</p>
                </div>
                <SeatMap rows={rows} selected={selected} onToggle={toggleSeat} couples={couples} />
              </>
            )}
          </div>
        )}

        {/* STEP 4 */}
        {step === 4 && (
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h2 className="font-serif-display text-3xl text-[#7A241F] mb-1">Metode Pembayaran</h2>
              <p className="text-sm text-[#7A6A5E] mb-6">Pilih cara pembayaran Anda.</p>
              <div className="space-y-3">
                {[
                  { k: "qris", label: "QRIS", desc: "Scan & bayar via e-wallet / m-banking", icon: QrCode },
                  { k: "transfer", label: "Transfer Bank BCA", desc: "Transfer ke Rek. PD MBI Kepri", icon: Landmark },
                ].map((m) => {
                  const Icon = m.icon;
                  return (
                    <button key={m.k} type="button" data-testid={`method-${m.k}`}
                      onClick={() => setMethod(m.k)}
                      className={cn("w-full flex items-center gap-4 rounded-xl border p-4 text-left transition-colors",
                        method === m.k ? "border-[#B26A1E] bg-[#B26A1E]/5 ring-2 ring-[#B26A1E]/30" : "border-border hover:border-[#B26A1E]/50")}>
                      <span className={cn("h-10 w-10 rounded-lg flex items-center justify-center",
                        method === m.k ? "bg-[#B26A1E] text-white" : "bg-muted text-[#7A6A5E]")}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block font-semibold text-[#7A241F]">{m.label}</span>
                        <span className="block text-xs text-[#7A6A5E]">{m.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Dana Sukarela */}
              <div className="mt-6 rounded-xl border border-[#B26A1E]/40 bg-[#F3E9DD]/50 p-5" data-testid="donation-card">
                <h3 className="font-semibold text-[#7A241F] flex items-center gap-2">
                  <HandHeart className="h-5 w-5 text-[#B26A1E]" /> Kontribusi Tiket: Dana Sukarela
                </h3>
                <p className="text-xs text-[#7A6A5E] mt-1.5">
                  Biaya pengadaan rata-rata <b>{rupiah(REF_COST)}/orang</b>, sebagai acuan untuk 1 tiket.
                </p>
                <p className="text-base sm:text-lg font-semibold text-[#7A241F] mt-2 leading-snug" data-testid="donation-free-note">
                  Nominal kontribusi <span className="text-[#B26A1E]">bebas</span>, sesuai Dana Paramita Anda. 🙏
                </p>
                <Label htmlFor="donation" className="text-xs text-[#5B4636] mt-4 block">Nominal dana sukarela (Rp)</Label>
                <div className="relative mt-1.5">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-[#7A6A5E]">Rp</span>
                  <Input id="donation" data-testid="donation-input" inputMode="numeric"
                    value={amount ? amount.toLocaleString("id-ID") : ""}
                    onChange={(e) => setAmountText(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="0" className="pl-10 h-12 text-lg font-semibold bg-white" />
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-[#FDFBF7] p-6">
              <h3 className="font-semibold text-[#7A241F] mb-4">Ringkasan Pesanan</h3>
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between"><dt className="text-[#7A6A5E]">Nama</dt><dd className="font-medium">{name}</dd></div>
                <div className="flex justify-between"><dt className="text-[#7A6A5E]">No. HP</dt><dd className="font-medium">{phone}</dd></div>
                <div className="flex justify-between"><dt className="text-[#7A6A5E]">Sesi</dt><dd className="font-medium">{activeSession?.name} · {activeSession?.time}</dd></div>
                <div className="flex justify-between"><dt className="text-[#7A6A5E]">Kursi</dt><dd className="font-medium text-right">{selected.join(", ")}</dd></div>
                <div className="flex justify-between"><dt className="text-[#7A6A5E]">Jumlah tiket</dt><dd className="font-medium">{selected.length} kursi</dd></div>
                <div className="flex justify-between"><dt className="text-[#7A6A5E]">Dana sukarela</dt><dd className="font-medium">{rupiah(amount)}</dd></div>
              </dl>
              <div className="border-t border-border mt-4 pt-4 flex justify-between items-center">
                <span className="text-[#7A6A5E]">Total</span>
                <span className="font-serif-display text-2xl text-[#B26A1E]" data-testid="summary-total">{rupiah(total)}</span>
              </div>
              <p className="text-[11px] text-[#7A6A5E] mt-2 flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[#B26A1E]" />
                Nominal PAS + kode unik akan langsung tampil di halaman pembayaran setelah Anda konfirmasi — bayar tepat sejumlah itu agar mudah kami cek di mutasi.
              </p>
            </div>
          </div>
        )}

        {/* Nav buttons */}
        <div className="flex justify-between mt-10">
          <Button variant="ghost" data-testid="btn-back" onClick={back} disabled={step === 1}
            className="text-[#7A6A5E]">
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Kembali
          </Button>
          {step === 2 ? null : step < 4 ? (
            <Button data-testid="btn-next" onClick={next}
              className="bg-[#B26A1E] hover:bg-[#8A3A12] rounded-full px-6">
              Lanjut <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          ) : (
            <Button data-testid="btn-confirm-open"
              onClick={() => {
                if (amount <= 0) { toast.error("Isi nominal dana sukarela terlebih dahulu"); return; }
                setConfirmOpen(true);
              }}
              className="bg-[#B26A1E] hover:bg-[#8A3A12] rounded-full px-6">
              Konfirmasi Pesanan <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          )}
        </div>
      </motion.div>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent data-testid="confirm-dialog">
          <DialogHeader>
            <div className="h-11 w-11 rounded-full bg-[#EF4444]/10 flex items-center justify-center mb-2">
              <AlertTriangle className="h-5 w-5 text-[#EF4444]" />
            </div>
            <DialogTitle className="font-serif-display text-2xl text-[#7A241F]">Konfirmasi Pesanan</DialogTitle>
            <DialogDescription className="text-[#7A6A5E]">
              Setelah dikonfirmasi, pesanan <b>TIDAK dapat diubah atau dibatalkan</b>. Kursi akan dikunci dan Anda harus segera melakukan pembayaran serta mengunggah bukti.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-1">
            <p><b>{selected.length}</b> kursi ({selected.join(", ")}) · {activeSession?.name}</p>
            <p>Metode pembayaran: <b>{method === "qris" ? "QRIS" : "Transfer BCA"}</b></p>
            <p className="text-xs text-[#7A6A5E]">Nominal pas + kode unik akan tampil di halaman pembayaran.</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" data-testid="btn-cancel-confirm" onClick={() => setConfirmOpen(false)}>Batal</Button>
            <Button data-testid="btn-submit-order" onClick={submit} disabled={submitting}
              className="bg-[#B26A1E] hover:bg-[#8A3A12]">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Ya, Buat Pesanan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
