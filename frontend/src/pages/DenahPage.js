import { useEffect, useState, Fragment } from "react";
import { api, LOGOS } from "@/lib/apiClient";
import { Printer, Loader2, ArrowLeft } from "lucide-react";

const SESSIONS = [
  { id: 1, name: "SESI 1", time: "09.30 – 11.30 WIB" },
  { id: 2, name: "SESI 2", time: "12.00 – 14.00 WIB" },
  { id: 3, name: "SESI 3", time: "14.30 – 16.30 WIB" },
  { id: 4, name: "SESI 4", time: "17.00 – 19.00 WIB" },
];

const CELL = 26;
const GAP = 3;

// Prioritas warna: operator > disabilitas > terisi > couple > kosong
const seatStyle = (seat) => {
  if (seat.status === "reserved") return { bg: "#E5E7EB", fg: "#111827", bd: "#111827", bw: 3 };
  if (seat.disability) return { bg: "#D1FAE5", fg: "#065F46", bd: "#059669", bw: 2.5 };
  if (seat.status === "booked") return { bg: "#E5E7EB", fg: "#4B5563", bd: "#6B7280", bw: 2.5 };
  if (seat.couple) return { bg: "#FCE7F3", fg: "#9D174D", bd: "#DB2777", bw: 2 };
  return { bg: "#FFFFFF", fg: "#374151", bd: "#9CA3AF", bw: 1 };
};

const LEGEND = [
  { label: "KOSONG (siap jual)", bg: "#FFFFFF", bd: "#9CA3AF", bw: 1 },
  { label: "TERISI / SUDAH TERJUAL", bg: "#E5E7EB", bd: "#6B7280", bw: 2.5 },
  { label: "SWEETBOX / COUPLE", bg: "#FCE7F3", bd: "#DB2777", bw: 2 },
  { label: "DISABILITAS", bg: "#D1FAE5", bd: "#059669", bw: 2.5 },
  { label: "OPERATOR", bg: "#E5E7EB", bd: "#111827", bw: 3 },
];

const SessionDenah = ({ session, data, printedAt }) => {
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
    <div className={`dp dp-${session.id} bg-white`} data-sid={session.id} style={{ padding: "6mm 4mm 10mm" }}>
      {/* Header dengan JUDUL BESAR */}
      <div className="flex items-end justify-between border-b-2 border-[#7A241F] pb-2 mb-3">
        <div className="flex items-center gap-4">
          <img src={LOGOS.kbi} alt="KBI" style={{ height: 54 }} crossOrigin="anonymous" />
          <div>
            <p className="font-serif-display text-[40px] leading-none text-[#7A241F] font-bold">{session.name}</p>
            <p className="text-2xl font-bold text-[#8A3A12] leading-tight mt-1">{session.time}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-[#7A241F]">FILM DOKUMENTER ASHIN JINARAKKHITA</p>
          <p className="text-xs text-[#5B4636]">Minggu, 13 September 2026 · CGV Grand Batam Mall</p>
          <p className="text-base font-bold text-[#255E33] mt-1">Kapasitas: {capacity} · Terisi: {booked} · Kosong: {sisa}</p>
          <p className="text-[11px] text-[#7A6A5E] mt-0.5">Update per: {printedAt} WIB</p>
        </div>
      </div>

      {/* LAYAR */}
      <div className="flex flex-col items-center mb-3">
        <div style={{ width: "60%", maxWidth: 440, height: 9, borderRadius: "100%/100% 100% 0 0", background: "linear-gradient(to bottom,#7A241F,transparent)" }} />
        <span className="text-[11px] tracking-[0.35em] text-[#7A241F] font-bold mt-1">LAYAR</span>
      </div>

      {/* Grid kursi */}
      <div className="flex flex-col items-center" style={{ rowGap: GAP + 1 }}>
        {rows.map((row) => {
          const seatMap = {};
          row.blocks.forEach((b) => b.forEach((s) => { seatMap[parseInt(s.label.slice(row.row.length), 10)] = s; }));
          return (
            <Fragment key={row.row}>
              {row.row === "K" && (
                <div className="w-full flex items-center gap-2" style={{ margin: "6px 0" }}>
                  <div className="flex-1 border-t border-dashed border-[#B26A1E]/60" />
                  <span className="text-[8px] tracking-[0.25em] font-bold text-[#B26A1E]/80">LORONG JALAN</span>
                  <div className="flex-1 border-t border-dashed border-[#B26A1E]/60" />
                </div>
              )}
              <div className="flex items-center" style={{ columnGap: GAP }}>
                <span className="font-bold text-[#7A6A5E] text-center" style={{ width: 16, fontSize: 10 }}>{row.row}</span>
                {cols.map((n) => {
                  const seat = seatMap[n];
                  if (!seat) return <div key={`${row.row}-e${n}`} style={{ width: CELL, height: CELL }} />;
                  const st = seatStyle(seat);
                  return (
                    <div key={seat.label} title={seat.label}
                      style={{
                        width: CELL, height: CELL, fontSize: 9, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        borderRadius: 5, backgroundColor: st.bg, color: st.fg, border: `${st.bw}px solid ${st.bd}`,
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

      {/* KETERANGAN WARNA */}
      <div className="mt-5 rounded-lg border border-[#7A241F]/50 bg-[#FBF7F0] px-4 py-3" style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
        <p className="text-sm font-bold text-[#7A241F] mb-2">KETERANGAN WARNA</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {LEGEND.map((l) => (
            <div key={l.label} className="flex items-center gap-2 text-xs font-bold text-[#3B2A20]">
              <span style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: l.bg, border: `${l.bw}px solid ${l.bd}`, WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }} />
              {l.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default function DenahPage() {
  const [maps, setMaps] = useState({});
  const [loading, setLoading] = useState(true);
  const [solo, setSolo] = useState(null);
  const printedAt = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

  useEffect(() => {
    (async () => {
      try {
        const results = await Promise.all(
          SESSIONS.map((s) => api.get(`/sessions/${s.id}/seats`).then((r) => [s.id, r.data]).catch(() => [s.id, null]))
        );
        setMaps(Object.fromEntries(results));
      } finally { setLoading(false); }
    })();
    const after = () => setSolo(null);
    window.addEventListener("afterprint", after);
    return () => window.removeEventListener("afterprint", after);
  }, []);

  const doPrint = (id) => {
    setSolo(id);
    setTimeout(() => window.print(), 150);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7]">
        <Loader2 className="h-8 w-8 animate-spin text-[#B26A1E]" />
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-[#FDFBF7] ${solo ? `solo-${solo}` : ""}`}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .dp { break-after: page; padding: 6mm 6mm 10mm !important; }
          .dp:last-child { break-after: auto; }
          @page { size: A4 landscape; margin: 8mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .solo-1 .dp:not(.dp-1), .solo-2 .dp:not(.dp-2), .solo-3 .dp:not(.dp-3), .solo-4 .dp:not(.dp-4) { display: none !important; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 bg-[#7A241F] text-white px-4 py-3 shadow-md">
        <div className="max-w-[1100px] mx-auto flex items-center justify-between gap-3 flex-wrap">
          <button onClick={() => window.history.back()} data-testid="denah-back" className="inline-flex items-center gap-1.5 text-sm bg-white/15 hover:bg-white/25 rounded-full px-3 py-1.5 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Kembali
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            {SESSIONS.map((s) => (
              <button key={s.id} onClick={() => doPrint(s.id)} data-testid={`denah-print-${s.id}`}
                className="inline-flex items-center gap-1.5 text-sm font-semibold bg-white text-[#7A241F] rounded-full px-3 py-1.5 hover:bg-white/90 transition-colors">
                <Printer className="h-4 w-4" /> Cetak {s.name}
              </button>
            ))}
            <button onClick={() => doPrint(null)} data-testid="denah-print-all"
              className="inline-flex items-center gap-1.5 text-sm font-semibold bg-[#E4C57E] text-[#5E1B17] rounded-full px-3 py-1.5 hover:bg-[#E4C57E]/90 transition-colors">
              <Printer className="h-4 w-4" /> Cetak Semua
            </button>
          </div>
        </div>
      </div>

      <div className="no-print text-center text-xs text-[#7A6A5E] py-2 px-4">
        Pilih tombol <b>Cetak Sesi</b> → tujuan <b>Save as PDF</b>, kertas <b>A4 Landscape</b>. Status kursi ditandai <b>garis tepi berwarna + teks</b> (tetap kebaca walau tanpa warna latar). Agar warna latar ikut penuh, aktifkan <b>"Background graphics / Grafik latar"</b> di dialog print.
      </div>

      <div className="max-w-[1100px] mx-auto px-2 pb-10" data-testid="denah-container">
        {SESSIONS.map((s) => (
          <div key={s.id} className="bg-white rounded-lg shadow-sm border border-border mb-4 print:shadow-none print:border-0 print:mb-0" data-testid={`denah-session-${s.id}`}>
            <SessionDenah session={s} data={maps[s.id]} printedAt={printedAt} />
          </div>
        ))}
      </div>
    </div>
  );
}
