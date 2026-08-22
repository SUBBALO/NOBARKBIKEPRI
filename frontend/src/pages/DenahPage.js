import { useEffect, useState, Fragment } from "react";
import { api, LOGOS } from "@/lib/apiClient";
import { Printer, Loader2, ArrowLeft } from "lucide-react";

const SESSIONS = [
  { id: 1, name: "Sesi 1", time: "09.30–11.30 WIB" },
  { id: 2, name: "Sesi 2", time: "12.00–14.00 WIB" },
  { id: 3, name: "Sesi 3", time: "14.30–16.30 WIB" },
  { id: 4, name: "Sesi 4", time: "17.00–19.00 WIB" },
];

const CELL = 26;
const GAP = 3;

const seatStyle = (seat) => {
  // Prioritas warna: operator > disabilitas > terjual > couple > tersedia
  if (seat.status === "reserved") return { bg: "#1F2937", fg: "#FFFFFF", bd: "#111827" }; // operator hitam
  if (seat.disability) return { bg: "#10B981", fg: "#FFFFFF", bd: "#059669" }; // disabilitas hijau
  if (seat.status === "booked") return { bg: "#9CA3AF", fg: "#FFFFFF", bd: "#6B7280" }; // terjual abu
  if (seat.couple) return { bg: "#F9A8D4", fg: "#831843", bd: "#EC4899" }; // couple pink
  return { bg: "#FFFFFF", fg: "#374151", bd: "#CBD5E1" }; // tersedia putih
};

const LEGEND = [
  { label: "Tersedia (siap jual)", bg: "#FFFFFF", bd: "#CBD5E1" },
  { label: "Terjual", bg: "#9CA3AF", bd: "#6B7280" },
  { label: "Sweetbox / couple (2 org)", bg: "#F9A8D4", bd: "#EC4899" },
  { label: "Disabilitas", bg: "#10B981", bd: "#059669" },
  { label: "Operator", bg: "#1F2937", bd: "#111827" },
];

const SessionDenah = ({ session, data, isLast }) => {
  const rows = data?.rows || [];
  const seatNums = [];
  rows.forEach((r) => r.blocks.forEach((b) => b.forEach((s) => seatNums.push(parseInt(s.label.slice(r.row.length), 10)))));
  const maxN = seatNums.length ? Math.max(...seatNums) : 21;
  const minN = seatNums.length ? Math.min(...seatNums) : 1;
  const cols = [];
  for (let n = maxN; n >= minN; n--) cols.push(n);

  const capacity = data?.capacity || 0;
  const booked = data?.booked || 0;
  const sisa = Math.max(0, capacity - booked);

  return (
    <div className="denah-page bg-white" style={{ pageBreakAfter: isLast ? "auto" : "always", padding: "6mm 4mm 10mm" }}>
      <div className="flex items-center justify-between border-b-2 border-[#7A241F] pb-2 mb-3">
        <div className="flex items-center gap-3">
          <img src={LOGOS.kbi} alt="KBI" style={{ height: 42 }} crossOrigin="anonymous" />
          <div>
            <p className="font-serif-display text-lg text-[#7A241F] leading-tight">DENAH KURSI · FILM DOKUMENTER ASHIN JINARAKKHITA</p>
            <p className="text-xs text-[#5B4636]">Minggu, 13 September 2026 · CGV Grand Batam Mall</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-bold text-xl text-[#7A241F] leading-tight">{session.name}</p>
          <p className="text-xs text-[#5B4636]">{session.time}</p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 text-sm mb-2">
        <span className="text-[#5B4636]">Kapasitas: <b>{capacity}</b></span>
        <span className="text-[#6B7280]">Terjual: <b>{booked}</b></span>
        <span className="text-[#255E33]">Sisa siap jual: <b>{sisa}</b></span>
      </div>

      {/* LAYAR */}
      <div className="flex flex-col items-center mb-3">
        <div style={{ width: "60%", maxWidth: 420, height: 8, borderRadius: "100%/100% 100% 0 0", background: "linear-gradient(to bottom,#7A241F,transparent)" }} />
        <span className="text-[10px] tracking-[0.3em] text-[#7A241F] font-semibold mt-1">LAYAR</span>
      </div>

      <div className="flex flex-col items-center" style={{ rowGap: GAP + 1 }}>
        {rows.map((row) => {
          const seatMap = {};
          row.blocks.forEach((b) => b.forEach((s) => { seatMap[parseInt(s.label.slice(row.row.length), 10)] = s; }));
          return (
            <Fragment key={row.row}>
              {row.row === "K" && (
                <div className="w-full flex items-center gap-2" style={{ margin: "8px 0" }}>
                  <div className="flex-1 border-t border-dashed border-[#B26A1E]/50" />
                  <span className="text-[8px] tracking-[0.25em] font-semibold text-[#B26A1E]/70">LORONG JALAN</span>
                  <div className="flex-1 border-t border-dashed border-[#B26A1E]/50" />
                </div>
              )}
              <div className="flex items-center" style={{ columnGap: GAP }}>
                <span className="font-bold text-[#7A6A5E] text-center" style={{ width: 16, fontSize: 10 }}>{row.row}</span>
                {cols.map((n) => {
                  const seat = seatMap[n];
                  if (!seat) return <div key={`${row.row}-e${n}`} style={{ width: CELL, height: CELL }} />;
                  const st = seatStyle(seat);
                  return (
                    <div key={seat.label}
                      title={seat.label}
                      style={{
                        width: CELL, height: CELL, fontSize: 9, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        borderRadius: 5, backgroundColor: st.bg, color: st.fg, border: `1px solid ${st.bd}`,
                        WebkitPrintColorAdjust: "exact", printColorAdjust: "exact",
                      }}>
                      {seat.label.replace(row.row, "")}
                    </div>
                  );
                })}
                <span className="font-bold text-[#7A6A5E] text-center" style={{ width: 16, fontSize: 10 }}>{row.row}</span>
              </div>
            </Fragment>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1.5 justify-center mt-4">
        {LEGEND.map((l) => (
          <div key={l.label} className="flex items-center gap-1.5 text-xs text-[#5B4636]">
            <span style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: l.bg, border: `1px solid ${l.bd}`, WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
};

export default function DenahPage() {
  const [maps, setMaps] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const results = await Promise.all(
          SESSIONS.map((s) => api.get(`/sessions/${s.id}/seats`).then((r) => [s.id, r.data]).catch(() => [s.id, null]))
        );
        setMaps(Object.fromEntries(results));
      } finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7]">
        <Loader2 className="h-8 w-8 animate-spin text-[#B26A1E]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .denah-page { padding: 6mm 6mm 10mm !important; }
          @page { size: A4 landscape; margin: 8mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 bg-[#7A241F] text-white px-4 py-3 flex items-center justify-between shadow-md">
        <button onClick={() => window.history.back()} data-testid="denah-back" className="inline-flex items-center gap-1.5 text-sm bg-white/15 hover:bg-white/25 rounded-full px-3 py-1.5 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Kembali
        </button>
        <span className="text-sm font-medium hidden sm:block">Denah Kursi — {SESSIONS.length} Sesi (kondisi terkini)</span>
        <button onClick={() => window.print()} data-testid="denah-print" className="inline-flex items-center gap-1.5 text-sm font-semibold bg-white text-[#7A241F] rounded-full px-4 py-1.5 hover:bg-white/90 transition-colors">
          <Printer className="h-4 w-4" /> Cetak / Simpan PDF
        </button>
      </div>

      <div className="no-print text-center text-xs text-[#7A6A5E] py-2 px-4">
        Tip: klik "Cetak / Simpan PDF" → pilih tujuan <b>Save as PDF</b> (kertas A4, orientasi Landscape). Setiap sesi otomatis 1 halaman.
      </div>

      <div className="max-w-[1100px] mx-auto px-2 pb-10" data-testid="denah-container">
        {SESSIONS.map((s, i) => (
          <div key={s.id} className="bg-white rounded-lg shadow-sm border border-border mb-4 print:shadow-none print:border-0 print:mb-0" data-testid={`denah-session-${s.id}`}>
            <SessionDenah session={s} data={maps[s.id]} isLast={i === SESSIONS.length - 1} />
          </div>
        ))}
      </div>
    </div>
  );
}
