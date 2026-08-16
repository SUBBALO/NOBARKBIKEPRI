import { useState, useEffect, useRef } from "react";
import { SeatMap } from "@/components/SeatMap";
import { LOGOS, rupiah } from "@/lib/apiClient";
import { Banknote, QrCode, Landmark, CheckCircle2, Armchair } from "lucide-react";

export const DISPLAY_CHANNEL = "kbi_walkin_display";

const POSTER_URL = "https://customer-assets-lxgj4vgw.emergentagent.net/job_qris-payment-7/artifacts/h7ivo2nv_POSTER.webp";

const SESSIONS = [
  { id: 1, name: "Sesi 1", time: "09.30–11.30" },
  { id: 2, name: "Sesi 2", time: "12.00–14.00" },
  { id: 3, name: "Sesi 3", time: "14.30–16.30" },
  { id: 4, name: "Sesi 4", time: "17.00–19.00" },
];

const initial = { mode: "idle" };

export default function DisplayPage() {
  const [state, setState] = useState(initial);
  const chanRef = useRef(null);

  useEffect(() => {
    const ch = new BroadcastChannel(DISPLAY_CHANNEL);
    chanRef.current = ch;
    ch.onmessage = (e) => {
      if (e.data?.type === "state") setState(e.data.payload || initial);
    };
    ch.postMessage({ type: "hello" }); // minta state terkini dari laptop panitia
    return () => ch.close();
  }, []);

  const { mode } = state;

  if (mode === "idle" || !mode) {
    return (
      <div className="h-screen overflow-hidden bg-[#7A241F] flex items-center justify-center px-8 py-6" data-testid="display-idle">
        <div className="flex flex-col lg:flex-row items-center gap-10 max-w-6xl w-full">
          <img src={POSTER_URL} alt="Poster Ashin Jinarakkhita" data-testid="display-idle-poster"
            className="w-auto max-h-[80vh] rounded-2xl shadow-2xl border-4 border-white/10 object-contain shrink-0" />
          <div className="text-center lg:text-left flex-1">
            <img src={LOGOS.kbi} alt="KBI" className="h-16 bg-white/95 rounded-xl p-2.5 mb-6 shadow-xl mx-auto lg:mx-0" />
            <h1 className="font-serif-display text-white text-4xl lg:text-6xl leading-tight">Pesan &amp; Beli Tiket di Sini</h1>
            <div className="mt-5 mb-5 h-1 w-28 bg-[#B26A1E] rounded-full mx-auto lg:mx-0" />
            <p className="text-[#F3E9DD] text-xl lg:text-2xl font-light tracking-wide">NOBAR FILM DOKUMENTER</p>
            <p className="font-serif-display text-[#F6C976] text-3xl lg:text-4xl mt-1">ASHIN JINARAKKHITA</p>
            <p className="text-white/90 text-lg lg:text-xl mt-4">Minggu, 13 September 2026</p>
            <p className="text-white/80 text-base lg:text-lg mt-0.5">CGV Grand Batam Mall</p>
            <div className="mt-7">
              <p className="text-[#F3E9DD]/80 text-sm uppercase tracking-widest mb-2.5">Pilihan Sesi</p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5" data-testid="display-idle-sessions">
                {SESSIONS.map((s) => (
                  <div key={s.id} className="rounded-xl bg-white/10 border border-white/20 px-3 py-2.5">
                    <p className="font-serif-display text-xl text-[#F6C976]">{s.name}</p>
                    <p className="text-white/85 text-sm">{s.time} WIB</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "done" && state.result) {
    const r = state.result;
    return (
      <div className="min-h-screen bg-[#2F703E] flex flex-col items-center justify-center text-center px-8" data-testid="display-done">
        <img src={LOGOS.kbi} alt="KBI" className="h-20 bg-white/95 rounded-2xl p-3 mb-6 shadow-2xl" />
        <CheckCircle2 className="h-20 w-20 text-white mb-4" />
        <h1 className="font-serif-display text-white text-5xl lg:text-7xl">Terima Kasih 🙏</h1>
        <p className="text-white/90 text-2xl mt-4">{state.sessionName} · {state.sessionTime}</p>
        <p className="text-white/80 text-xl mt-8 mb-3">Nomor kursi Anda:</p>
        <div className="flex flex-wrap gap-3 justify-center max-w-4xl" data-testid="display-done-seats">
          {(r.seats || []).map((s) => (
            <span key={s} className="px-5 py-3 rounded-xl bg-white text-[#255E33] font-bold text-3xl shadow-lg">{s}</span>
          ))}
        </div>
      </div>
    );
  }

  if (mode === "paying") {
    const method = state.method || "cash";
    return (
      <div className="h-screen overflow-hidden bg-[#FDFBF7] flex flex-col" data-testid="display-paying">
        <div className="bg-[#7A241F] text-white px-8 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <img src={LOGOS.kbi} alt="KBI" className="h-10 bg-white/95 rounded-lg p-1.5" />
            <div>
              <p className="text-xl font-serif-display leading-tight">{state.sessionName}</p>
              <p className="text-white/70 text-base">{state.sessionTime}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-white/70 text-sm">No. Tiket · Kursi</p>
            <p className="text-2xl font-bold">{state.orderNo ? `#${state.orderNo}` : ""} · {(state.selected || []).join(", ") || "-"}</p>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex items-center justify-center px-8 py-4">
          <div className="grid lg:grid-cols-2 gap-6 items-center max-w-5xl w-full">
            {/* Nominal */}
            <div className="rounded-3xl bg-[#B26A1E] text-white p-6 text-center shadow-2xl order-2 lg:order-1">
              <p className="text-xl text-white/85">Total Dana Sukarela</p>
              <p className="font-serif-display text-6xl leading-none mt-2" data-testid="display-amount">{rupiah(state.amount || 0)}</p>
              <p className="text-base text-white/80 mt-2">
                {method === "cash" ? "Bayar tunai pas ke panitia" : "Mohon bayar sesuai nominal PAS"}
              </p>
              <div className="mt-3 pt-3 border-t border-white/25 flex items-center justify-center gap-6 text-lg">
                <span data-testid="display-pay-orderno">No. Tiket: <b>#{state.orderNo}</b></span>
                <span data-testid="display-pay-qty"><b>{state.qty}</b> tiket</span>
              </div>
            </div>

            {/* Instruksi metode */}
            {method === "qris" ? (
              <div className="rounded-3xl bg-white border-4 border-[#7A241F]/15 p-6 text-center shadow-xl order-1 lg:order-2" data-testid="display-qris">
                <p className="text-[#7A241F] text-2xl font-serif-display mb-1 flex items-center justify-center gap-2"><QrCode className="h-7 w-7" /> Scan QRIS</p>
                <p className="text-[#7A6A5E] text-base mb-3">Scan dengan aplikasi bank / e-wallet</p>
                <img src={LOGOS.qris} alt="QRIS" className="mx-auto w-full max-w-[260px] rounded-xl border border-border bg-white" />
              </div>
            ) : method === "transfer" ? (
              <div className="rounded-3xl bg-white border-4 border-[#7A241F]/15 p-6 text-center shadow-xl order-1 lg:order-2" data-testid="display-transfer">
                <p className="text-[#7A241F] text-2xl font-serif-display mb-3 flex items-center justify-center gap-2"><Landmark className="h-7 w-7" /> Transfer Bank</p>
                <p className="text-[#7A6A5E] text-lg">{state.transfer?.bank || "BCA"}</p>
                <p className="font-mono text-5xl font-bold text-[#7A241F] tracking-wider my-3">{state.transfer?.account_number}</p>
                <p className="text-[#7A6A5E] text-lg">a.n. {state.transfer?.account_name}</p>
              </div>
            ) : (
              <div className="rounded-3xl bg-[#2F703E] text-white p-8 text-center shadow-xl order-1 lg:order-2 flex flex-col items-center justify-center" data-testid="display-cash">
                <Banknote className="h-20 w-20 mb-3" />
                <p className="text-3xl font-serif-display">Pembayaran Tunai</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // mode === "selecting"
  return (
    <div className="h-screen overflow-hidden bg-[#FDFBF7] flex flex-col" data-testid="display-selecting">
      <div className="bg-[#7A241F] text-white px-8 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <img src={LOGOS.kbi} alt="KBI" className="h-10 bg-white/95 rounded-lg p-1.5" />
          <div>
            <p className="text-2xl font-serif-display leading-tight">{state.sessionName || "Pilih Kursi"}</p>
            <p className="text-white/70 text-base">{state.sessionTime}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-white/70 text-sm">Sisa kursi</p>
          <p className="text-3xl font-bold text-[#F3E9DD]" data-testid="display-remaining">{state.remaining ?? "-"}</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-4 py-3 flex flex-col items-center">
        <div className="w-full max-w-5xl">
          {state.rows ? (
            <div style={{ pointerEvents: "none" }}>
              <SeatMap rows={state.rows} selected={state.selected || []} onToggle={() => {}} couples={state.couples || {}} allowDisability />
            </div>
          ) : (
            <p className="text-center text-[#7A6A5E] text-xl py-24">Menunggu panitia memilih sesi…</p>
          )}
        </div>
      </div>

      <div className="bg-white border-t border-border px-8 py-3 flex items-center justify-between shrink-0">
        <p className="text-[#7A6A5E] text-lg flex items-center gap-2"><Armchair className="h-5 w-5 text-[#B26A1E]" /> Kursi dipilih ({(state.selected || []).length})</p>
        <div className="flex flex-wrap gap-2 justify-end max-w-3xl" data-testid="display-selected">
          {(state.selected || []).length === 0
            ? <span className="text-[#9CA3AF] text-lg">Belum ada kursi dipilih</span>
            : (state.selected || []).map((s) => (
              <span key={s} className="px-3 py-1.5 rounded-lg bg-[#B26A1E]/15 text-[#8A3A12] font-bold text-xl">{s}</span>
            ))}
        </div>
      </div>
    </div>
  );
}
