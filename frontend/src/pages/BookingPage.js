import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { api, rupiah, CONTACT } from "@/lib/apiClient";
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
  Phone, MessageCircle, UploadCloud,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { n: 1, label: "Data Diri", icon: User },
  { n: 2, label: "Pilih Sesi", icon: Clock },
  { n: 3, label: "Pilih Kursi", icon: Armchair },
  { n: 4, label: "Pembayaran", icon: QrCode },
];

const PRICE = 50000;

const SessionCard = ({ s, active, selected, onSelect }) => {
  const disabled = s.status !== "open";
  const badge = {
    open: { t: "Dibuka", c: "bg-[#10B981]/15 text-[#0F7A57]" },
    locked: { t: "Terkunci", c: "bg-[#6B7280]/15 text-[#6B7280]" },
    full: { t: "Penuh", c: "bg-[#EF4444]/15 text-[#EF4444]" },
    closed: { t: "Selesai", c: "bg-[#6B7280]/15 text-[#6B7280]" },
  }[s.status];
  return (
    <button
      type="button"
      data-testid={`session-${s.id}`}
      disabled={disabled}
      onClick={() => onSelect(s.id)}
      className={cn(
        "text-left rounded-xl border p-5 transition-colors duration-200 relative",
        disabled ? "opacity-60 cursor-not-allowed bg-muted/40 border-border" :
          selected === s.id ? "border-[#D56115] bg-[#D56115]/5 ring-2 ring-[#D56115]/30" :
            "border-border bg-white hover:border-[#D56115]/50"
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-serif-display text-2xl text-[#1E3A5F]">{s.name}</span>
        <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", badge.c)}>{badge.t}</span>
      </div>
      <p className="text-sm text-[#6B7280]">Pukul {s.time}</p>
      <p className="text-xs text-[#6B7280] mt-3">{s.booked}/{s.capacity} kursi terisi</p>
      {disabled && s.status === "locked" && (
        <span className="absolute top-4 right-4 text-[#6B7280]"><Lock className="h-3.5 w-3.5" /></span>
      )}
    </button>
  );
};

export default function BookingPage() {
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [event, setEvent] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [rows, setRows] = useState([]);
  const [seatsLoading, setSeatsLoading] = useState(false);
  const [selected, setSelected] = useState([]);
  const [method, setMethod] = useState("qris");
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

  const loadSeats = async (id) => {
    setSeatsLoading(true);
    try {
      const { data } = await api.get(`/sessions/${id}/seats`);
      setRows(data.rows);
    } catch (e) { toast.error("Gagal memuat denah kursi"); }
    setSeatsLoading(false);
  };

  useEffect(() => { loadEvent(); }, []);
  useEffect(() => { if (step === 3 && sessionId) loadSeats(sessionId); }, [step, sessionId]);

  const toggleSeat = (label) => {
    setSelected((prev) =>
      prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label]
    );
  };

  const next = () => {
    if (step === 1) {
      if (!name.trim() || !phone.trim()) return toast.error("Isi nama dan nomor HP dulu");
      if (!/^[0-9+\-\s]{8,}$/.test(phone.trim())) return toast.error("Nomor HP tidak valid");
    }
    if (step === 2 && !sessionId) return toast.error("Pilih sesi terlebih dahulu");
    if (step === 3 && selected.length === 0) return toast.error("Pilih minimal 1 kursi");
    setStep((s) => Math.min(4, s + 1));
  };
  const back = () => setStep((s) => Math.max(1, s - 1));

  const total = selected.length * PRICE;

  const submit = async () => {
    setSubmitting(true);
    try {
      const { data } = await api.post("/orders", {
        name, phone, session_id: sessionId, seats: selected, payment_method: method,
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 sm:py-12">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-2xl border border-border bg-[#1E3A5F] text-white p-8 sm:p-12 mb-10 grain"
      >
        <div className="relative z-10 max-w-3xl">
          <span className="inline-flex items-center gap-2 text-xs font-medium bg-white/10 px-3 py-1 rounded-full">
            <CalendarDays className="h-3.5 w-3.5" /> {event?.date || "Minggu, 13 September 2026"} · {event?.location || "CGV Grand Batam"}
          </span>
          <h1 className="font-serif-display text-3xl sm:text-5xl leading-tight mt-4">
            Nonton Bersama Film Dokumenter
          </h1>
          <p className="font-serif-display text-xl sm:text-2xl text-[#F0C48A] mt-2 italic">
            “Y.A. MNS. Ashin Jinarakkhita: Jejak Langkah Sang Pelopor di Nusantara”
          </p>
          <p className="text-sm sm:text-base text-white/90 mt-4 italic">
            Sebuah perjalanan yang perlahan menghidupkan kembali cahaya.
          </p>
          <p className="text-sm text-white/70 mt-3 max-w-2xl leading-relaxed">
            Temukan kisah perjuangan Y.A. MNS. Jinarakkhita (Sukong) dalam menghidupkan kembali
            agama Buddha di Indonesia — diceritakan melalui kenangan, kesaksian, juga jejak yang ia tinggalkan.
          </p>
          <p className="text-sm text-white/70 mt-4">
            Harga tiket {rupiah(PRICE)} / kursi · Pembayaran QRIS atau Transfer BCA
          </p>
        </div>
        <div className="absolute -right-16 -bottom-16 h-64 w-64 rounded-full bg-[#D56115]/30 blur-3xl z-0" />
      </motion.div>

      {/* Contact + lupa upload strip */}
      <div className="grid sm:grid-cols-2 gap-4 mb-10">
        <div data-testid="contact-card" className="rounded-xl border border-border bg-white p-5 flex items-center gap-4">
          <span className="h-11 w-11 rounded-lg bg-[#D56115]/10 flex items-center justify-center shrink-0">
            <Phone className="h-5 w-5 text-[#D56115]" />
          </span>
          <div>
            <p className="text-xs text-[#6B7280]">Kontak Person</p>
            <p className="font-semibold text-[#1E3A5F]">{CONTACT.label}</p>
            <div className="flex items-center gap-3 mt-0.5">
              <a href={`tel:${CONTACT.phone.replace(/-/g, "")}`} data-testid="contact-phone" className="text-sm text-[#D56115] hover:underline font-medium">{CONTACT.phone}</a>
              <a href={CONTACT.waLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[#0F7A57]"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>
            </div>
          </div>
        </div>
        <Link to="/upload" data-testid="link-upload-strip"
          className="rounded-xl border border-border bg-white p-5 flex items-center gap-4 hover:border-[#D56115]/50 transition-colors">
          <span className="h-11 w-11 rounded-lg bg-[#1E3A5F]/10 flex items-center justify-center shrink-0">
            <UploadCloud className="h-5 w-5 text-[#1E3A5F]" />
          </span>
          <div>
            <p className="font-semibold text-[#1E3A5F]">Sudah bayar tapi lupa upload bukti?</p>
            <p className="text-sm text-[#6B7280]">Klik di sini, cari pesanan dengan nomor HP Anda lalu upload buktinya.</p>
          </div>
        </Link>
      </div>

      {/* Stepper */}
      <div className="flex items-center justify-between mb-8 max-w-2xl">
        {STEPS.map((s, i) => {
          const done = step > s.n;
          const cur = step === s.n;
          const Icon = s.icon;
          return (
            <div key={s.n} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div className={cn(
                  "h-9 w-9 rounded-full flex items-center justify-center transition-colors",
                  done ? "bg-[#10B981] text-white" : cur ? "bg-[#D56115] text-white" : "bg-muted text-[#6B7280]"
                )}>
                  {done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-4 w-4" />}
                </div>
                <span className={cn("text-[11px] font-medium", cur ? "text-[#D56115]" : "text-[#6B7280]")}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn("h-0.5 flex-1 mx-2 rounded", step > s.n ? "bg-[#10B981]" : "bg-border")} />
              )}
            </div>
          );
        })}
      </div>

      <motion.div
        key={step}
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="rounded-2xl border border-border bg-white p-6 sm:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
      >
        {/* STEP 1 */}
        {step === 1 && (
          <div className="max-w-md">
            <h2 className="font-serif-display text-3xl text-[#1E3A5F] mb-1">Data Diri</h2>
            <p className="text-sm text-[#6B7280] mb-6">Isi data pemesan tiket.</p>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Nama Lengkap</Label>
                <Input id="name" data-testid="input-name" value={name}
                  onChange={(e) => setName(e.target.value)} placeholder="Nama sesuai identitas" className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="phone">Nomor HP / WhatsApp</Label>
                <Input id="phone" data-testid="input-phone" value={phone}
                  onChange={(e) => setPhone(e.target.value)} placeholder="08xxxxxxxxxx" className="mt-1.5" />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div>
            <h2 className="font-serif-display text-3xl text-[#1E3A5F] mb-1">Pilih Sesi</h2>
            <p className="text-sm text-[#6B7280] mb-6">
              Hanya 1 sesi dibuka pada satu waktu. Sesi berikutnya terbuka otomatis saat sesi berjalan penuh.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {event?.sessions?.map((s) => (
                <SessionCard key={s.id} s={s} selected={sessionId}
                  onSelect={(id) => { setSessionId(id); setSelected([]); }} />
              ))}
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div>
            <div className="flex flex-wrap items-end justify-between gap-2 mb-6">
              <div>
                <h2 className="font-serif-display text-3xl text-[#1E3A5F] mb-1">Pilih Kursi</h2>
                <p className="text-sm text-[#6B7280]">
                  {activeSession ? `${activeSession.name} · ${activeSession.time}` : ""} — pilih kursi mana saja yang tersedia.
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-[#6B7280]">Terpilih</p>
                <p className="font-semibold text-[#D56115]" data-testid="selected-seats-label">
                  {selected.length ? selected.join(", ") : "—"}
                </p>
              </div>
            </div>
            {seatsLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[#D56115]" /></div>
            ) : (
              <SeatMap rows={rows} selected={selected} onToggle={toggleSeat} />
            )}
          </div>
        )}

        {/* STEP 4 */}
        {step === 4 && (
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h2 className="font-serif-display text-3xl text-[#1E3A5F] mb-1">Metode Pembayaran</h2>
              <p className="text-sm text-[#6B7280] mb-6">Pilih cara pembayaran Anda.</p>
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
                        method === m.k ? "border-[#D56115] bg-[#D56115]/5 ring-2 ring-[#D56115]/30" : "border-border hover:border-[#D56115]/50")}>
                      <span className={cn("h-10 w-10 rounded-lg flex items-center justify-center",
                        method === m.k ? "bg-[#D56115] text-white" : "bg-muted text-[#6B7280]")}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block font-semibold text-[#1E3A5F]">{m.label}</span>
                        <span className="block text-xs text-[#6B7280]">{m.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-[#FDFBF7] p-6">
              <h3 className="font-semibold text-[#1E3A5F] mb-4">Ringkasan Pesanan</h3>
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between"><dt className="text-[#6B7280]">Nama</dt><dd className="font-medium">{name}</dd></div>
                <div className="flex justify-between"><dt className="text-[#6B7280]">No. HP</dt><dd className="font-medium">{phone}</dd></div>
                <div className="flex justify-between"><dt className="text-[#6B7280]">Sesi</dt><dd className="font-medium">{activeSession?.name} · {activeSession?.time}</dd></div>
                <div className="flex justify-between"><dt className="text-[#6B7280]">Kursi</dt><dd className="font-medium text-right">{selected.join(", ")}</dd></div>
                <div className="flex justify-between"><dt className="text-[#6B7280]">Jumlah</dt><dd className="font-medium">{selected.length} × {rupiah(PRICE)}</dd></div>
              </dl>
              <div className="border-t border-border mt-4 pt-4 flex justify-between items-center">
                <span className="text-[#6B7280]">Total</span>
                <span className="font-serif-display text-2xl text-[#D56115]" data-testid="summary-total">{rupiah(total)}</span>
              </div>
              <p className="text-[11px] text-[#6B7280] mt-2 flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[#D56115]" />
                Nominal PAS + kode unik akan langsung tampil di halaman pembayaran setelah Anda konfirmasi — bayar tepat sejumlah itu agar mudah kami cek di mutasi.
              </p>
            </div>
          </div>
        )}

        {/* Nav buttons */}
        <div className="flex justify-between mt-10">
          <Button variant="ghost" data-testid="btn-back" onClick={back} disabled={step === 1}
            className="text-[#6B7280]">
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Kembali
          </Button>
          {step < 4 ? (
            <Button data-testid="btn-next" onClick={next}
              className="bg-[#D56115] hover:bg-[#B34F0F] rounded-full px-6">
              Lanjut <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          ) : (
            <Button data-testid="btn-confirm-open" onClick={() => setConfirmOpen(true)}
              className="bg-[#D56115] hover:bg-[#B34F0F] rounded-full px-6">
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
            <DialogTitle className="font-serif-display text-2xl text-[#1E3A5F]">Konfirmasi Pesanan</DialogTitle>
            <DialogDescription className="text-[#6B7280]">
              Setelah dikonfirmasi, pesanan <b>TIDAK dapat diubah atau dibatalkan</b>. Kursi akan dikunci dan Anda harus segera melakukan pembayaran serta mengunggah bukti.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-1">
            <p><b>{selected.length}</b> kursi ({selected.join(", ")}) · {activeSession?.name}</p>
            <p>Total <b>{rupiah(total)}</b> + kode unik · {method === "qris" ? "QRIS" : "Transfer BCA"}</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" data-testid="btn-cancel-confirm" onClick={() => setConfirmOpen(false)}>Batal</Button>
            <Button data-testid="btn-submit-order" onClick={submit} disabled={submitting}
              className="bg-[#D56115] hover:bg-[#B34F0F]">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Ya, Buat Pesanan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
