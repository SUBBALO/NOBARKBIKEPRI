import { useState } from "react";
import { cn } from "@/lib/utils";
import { ZoomIn, ZoomOut, MoveHorizontal } from "lucide-react";

const LEGEND = [
  { key: "available", label: "Tersedia", cls: "bg-[#E5E7EB]" },
  { key: "selected", label: "Terpilih", cls: "bg-[#B26A1E]" },
  { key: "booked", label: "Terisi", cls: "bg-[#9CA3AF]" },
  { key: "couple", label: "Sweetbox (wajib 2 orang)", cls: "bg-[#F9A8D4]" },
  { key: "disability", label: "Disabilitas (beli di lokasi)", cls: "bg-[#6EE7B7]" },
  { key: "reserved", label: "Operator", cls: "bg-[#4B5563]" },
];

const ZOOMS = [0.8, 1, 1.3];

export const SeatMap = ({ rows, selected, onToggle, couples = {}, allowDisability = false }) => {
  const [zi, setZi] = useState(1);
  const z = ZOOMS[zi];
  const sz = Math.round(26 * z);
  const fs = Math.max(8, Math.round(9 * z));
  const gap = Math.max(2, Math.round(3 * z));
  const aisle = Math.round(14 * z);

  const handleClick = (label) => {
    const partner = couples[label];
    onToggle(label, partner || null);
  };

  return (
    <div className="w-full">
      {/* Controls */}
      <div className="flex items-center justify-between mb-3">
        <span className="sm:hidden inline-flex items-center gap-1.5 text-[11px] text-[#B26A1E] font-medium">
          <MoveHorizontal className="h-3.5 w-3.5" /> Geser untuk lihat semua kursi
        </span>
        <span className="hidden sm:block" />
        <div className="flex items-center gap-1">
          <button type="button" data-testid="seatmap-zoom-out" onClick={() => setZi((i) => Math.max(0, i - 1))}
            disabled={zi === 0}
            className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-[#7A6A5E] hover:bg-[#F3E9DD] disabled:opacity-40">
            <ZoomOut className="h-4 w-4" />
          </button>
          <button type="button" data-testid="seatmap-zoom-in" onClick={() => setZi((i) => Math.min(ZOOMS.length - 1, i + 1))}
            disabled={zi === ZOOMS.length - 1}
            className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-[#7A6A5E] hover:bg-[#F3E9DD] disabled:opacity-40">
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto pb-2" data-testid="seatmap-scroll">
        <div className="w-max min-w-full flex flex-col items-center" style={{ rowGap: gap + 2 }}>
          {/* Screen */}
          <div className="flex flex-col items-center mb-5 w-full">
            <div
              className="w-3/4 max-w-[560px] h-3 rounded-t-[100%] bg-gradient-to-b from-[#7A241F] to-transparent opacity-70"
              style={{ boxShadow: "0 -8px 30px rgba(30,58,95,0.35)" }}
            />
            <span className="mt-1.5 text-xs tracking-[0.3em] text-[#7A241F]/70 font-medium">LAYAR</span>
          </div>

          {rows.map((row) => (
            <div key={row.row} className="flex items-center" style={{ columnGap: aisle }}>
              <span className="font-semibold text-[#7A6A5E] text-center"
                style={{ width: sz * 0.6, fontSize: fs + 1 }}>{row.row}</span>
              {row.blocks.map((block, bi) => (
                <div key={`${row.row}-b${bi}`} className="flex" style={{ columnGap: gap }}>
                  {block.map((seat) => {
                    const isSel = selected.includes(seat.label);
                    const st = isSel ? "selected" : seat.status;
                    const disLocked = seat.disability && !allowDisability;
                    const disabled = seat.status === "booked" || seat.status === "locked" || seat.status === "reserved" || disLocked;
                    return (
                      <button
                        key={seat.label}
                        type="button"
                        data-testid={`seat-${seat.label}`}
                        disabled={disabled}
                        onClick={() => handleClick(seat.label)}
                        title={seat.status === "reserved" ? `${seat.label} (operator)` : seat.disability ? `${seat.label} (disabilitas — beli di lokasi)` : seat.couple ? `${seat.label} (sweetbox)` : seat.label}
                        style={{ height: sz, width: sz, fontSize: fs }}
                        className={cn(
                          "relative rounded-md font-semibold flex items-center justify-center transition-colors duration-150",
                          st === "available" && !seat.couple && !seat.disability && "bg-[#E5E7EB] text-[#374151] hover:bg-[#B26A1E]/30",
                          st === "available" && seat.couple && "bg-[#F9A8D4] text-[#831843] hover:bg-[#EC4899]/60",
                          st === "available" && seat.disability && (allowDisability
                            ? "bg-[#6EE7B7] text-[#065F46] hover:bg-[#34D399]"
                            : "bg-[#6EE7B7]/60 text-[#065F46]/60 cursor-not-allowed"),
                          st === "selected" && !seat.couple && !seat.disability && "bg-[#B26A1E] text-white seat-pop shadow-md",
                          st === "selected" && seat.couple && "bg-[#DB2777] text-white seat-pop shadow-md",
                          st === "selected" && seat.disability && "bg-[#059669] text-white seat-pop shadow-md",
                          st === "booked" && "bg-[#9CA3AF] text-white/70 cursor-not-allowed",
                          st === "reserved" && "bg-[#4B5563] text-white/60 cursor-not-allowed",
                          st === "locked" && "bg-[#F3E9DD] text-[#B26A1E]/40 cursor-not-allowed border border-dashed border-[#B26A1E]/40"
                        )}
                      >
                        {seat.label.replace(row.row, "")}
                      </button>
                    );
                  })}
                </div>
              ))}
              <span className="font-semibold text-[#7A6A5E] text-center"
                style={{ width: sz * 0.6, fontSize: fs + 1 }}>{row.row}</span>
            </div>
          ))}

          {/* Entrance marker (kanan bawah seperti denah asli) */}
          <div className="w-full flex justify-end pr-2 mt-1">
            <span className="text-[10px] font-medium text-[#7A6A5E] bg-[#F3E9DD] rounded px-2 py-0.5">PINTU MASUK / KELUAR</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 justify-center mt-6">
        {LEGEND.map((l) => (
          <div key={l.key} className="flex items-center gap-2 text-xs text-[#7A6A5E]">
            <span className={cn("h-4 w-4 rounded", l.cls)} />
            {l.label}
          </div>
        ))}
      </div>
      <p className="text-center text-[11px] text-[#B26A1E] mt-2">
        Kursi Sweetbox (pink) otomatis terpilih sepasang — wajib dibeli untuk 2 orang.
      </p>
    </div>
  );
};
