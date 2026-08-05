import { cn } from "@/lib/utils";

const LEGEND = [
  { key: "available", label: "Tersedia", cls: "bg-[#E5E7EB]" },
  { key: "selected", label: "Terpilih", cls: "bg-[#D56115]" },
  { key: "booked", label: "Terisi", cls: "bg-[#9CA3AF]" },
  { key: "locked", label: "Terkunci", cls: "bg-[#F3E9DD] border border-dashed border-[#D56115]/40" },
];

export const SeatMap = ({ rows, selected, onToggle }) => {
  return (
    <div className="w-full">
      {/* Screen */}
      <div className="flex flex-col items-center mb-8">
        <div
          className="w-3/4 h-3 rounded-t-[100%] bg-gradient-to-b from-[#1E3A5F] to-transparent opacity-70"
          style={{ boxShadow: "0 -8px 30px rgba(30,58,95,0.35)" }}
        />
        <span className="mt-2 text-xs tracking-[0.3em] text-[#1E3A5F]/70 font-medium">LAYAR</span>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="min-w-[520px] flex flex-col gap-2 items-center">
          {rows.map((row) => (
            <div key={row.row} className="flex items-center gap-3">
              <span className="w-5 text-xs font-semibold text-[#6B7280]">{row.row}</span>
              <div className="flex gap-1.5">
                {row.seats.map((seat, idx) => {
                  const isSel = selected.includes(seat.label);
                  const st = isSel ? "selected" : seat.status;
                  const disabled = seat.status === "booked" || seat.status === "locked";
                  return (
                    <button
                      key={seat.label}
                      type="button"
                      data-testid={`seat-${seat.label}`}
                      disabled={disabled}
                      onClick={() => onToggle(seat.label)}
                      title={seat.label}
                      className={cn(
                        "relative h-7 w-7 sm:h-8 sm:w-8 rounded-md text-[10px] font-semibold flex items-center justify-center transition-colors duration-150",
                        idx === 4 ? "mr-4" : "",
                        st === "available" && "bg-[#E5E7EB] text-[#374151] hover:bg-[#D56115]/30",
                        st === "selected" && "bg-[#D56115] text-white seat-pop shadow-md",
                        st === "booked" && "bg-[#9CA3AF] text-white/70 cursor-not-allowed",
                        st === "locked" && "bg-[#F3E9DD] text-[#D56115]/40 cursor-not-allowed border border-dashed border-[#D56115]/40"
                      )}
                    >
                      {seat.label.replace(row.row, "")}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 justify-center mt-8">
        {LEGEND.map((l) => (
          <div key={l.key} className="flex items-center gap-2 text-xs text-[#6B7280]">
            <span className={cn("h-4 w-4 rounded", l.cls)} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
};
