import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { api, rupiah, LOGOS } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2, QrCode, Landmark, Copy, Upload, CheckCircle2, Clock,
  XCircle, AlertTriangle, Download, UploadCloud, Hourglass,
} from "lucide-react";
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

const StatusBadge = ({ status }) => {
  const map = {
    pending_payment: { t: "Menunggu Pembayaran", c: "bg-[#D56115]/15 text-[#B34F0F]", i: Clock },
    waiting_verification: { t: "Menunggu Verifikasi", c: "bg-[#1E3A5F]/15 text-[#1E3A5F]", i: Hourglass },
    verified: { t: "Terverifikasi", c: "bg-[#10B981]/15 text-[#0F7A57]", i: CheckCircle2 },
    rejected: { t: "Ditolak", c: "bg-[#EF4444]/15 text-[#EF4444]", i: XCircle },
    expired: { t: "Kadaluarsa", c: "bg-[#6B7280]/15 text-[#6B7280]", i: AlertTriangle },
  }[status] || { t: status, c: "bg-muted", i: Clock };
  const Icon = map.i;
  return (
    <span data-testid="order-status" className={cn("inline-flex items-center gap-1.5 text-sm px-3 py-1 rounded-full font-medium", map.c)}>
      <Icon className="h-4 w-4" /> {map.t}
    </span>
  );
};

export default function OrderStatusPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [remaining, setRemaining] = useState(null);
  const fileRef = useRef(null);
  const remindedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/orders/${id}`);
      setOrder(data);
      if (data.status === "pending_payment" && !remindedRef.current) {
        remindedRef.current = true;
        setReminderOpen(true);
      }
    } catch (e) {
      toast.error("Pesanan tidak ditemukan");
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // countdown for pending payment
  useEffect(() => {
    if (!order || order.status !== "pending_payment") return;
    const created = new Date(order.created_at).getTime();
    const deadline = created + 15 * 60 * 1000;
    const t = setInterval(() => {
      const diff = deadline - Date.now();
      if (diff <= 0) { setRemaining(0); load(); clearInterval(t); }
      else setRemaining(diff);
    }, 1000);
    return () => clearInterval(t);
  }, [order, load]);

  const copyTotal = () => {
    navigator.clipboard.writeText(String(order.total_amount));
    toast.success("Nominal disalin");
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("File harus berupa gambar");
    setUploading(true);
    try {
      const dataUrl = await compressImage(file);
      const { data } = await api.post(`/orders/${id}/proof`, { proof_image: dataUrl });
      setOrder(data);
      toast.success("Bukti pembayaran berhasil diunggah!");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Gagal mengunggah bukti");
    }
    setUploading(false);
  };

  if (loading) return <div className="flex justify-center py-32"><Loader2 className="h-7 w-7 animate-spin text-[#D56115]" /></div>;
  if (!order) return (
    <div className="max-w-md mx-auto text-center py-32 px-4">
      <p className="text-[#6B7280]">Pesanan tidak ditemukan.</p>
      <Link to="/"><Button className="mt-4 bg-[#D56115] hover:bg-[#B34F0F]">Kembali</Button></Link>
    </div>
  );

  const mm = remaining != null ? Math.floor(remaining / 60000) : null;
  const ss = remaining != null ? Math.floor((remaining % 60000) / 1000) : null;
  const canUpload = order.status === "pending_payment" || order.status === "waiting_verification";

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-8 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-xs text-[#6B7280]">No. Order</p>
          <p className="font-mono text-sm text-[#1E3A5F]" data-testid="order-id">#{order.order_no}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Order detail */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-border bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <h2 className="font-serif-display text-2xl text-[#1E3A5F] mb-4">Detail Pesanan</h2>
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between"><dt className="text-[#6B7280]">Nama</dt><dd className="font-medium">{order.name}</dd></div>
            <div className="flex justify-between"><dt className="text-[#6B7280]">No. HP</dt><dd className="font-medium">{order.phone}</dd></div>
            <div className="flex justify-between"><dt className="text-[#6B7280]">Sesi</dt><dd className="font-medium">{order.session?.name} · {order.session?.time}</dd></div>
            <div className="flex justify-between"><dt className="text-[#6B7280]">Kursi</dt><dd className="font-medium text-right">{order.seats.join(", ")}</dd></div>
            <div className="flex justify-between"><dt className="text-[#6B7280]">Jumlah tiket</dt><dd className="font-medium">{order.qty} × {rupiah(order.unit_price)}</dd></div>
          </dl>
          <div className="mt-5 rounded-xl bg-[#1E3A5F] text-white p-5">
            <p className="text-xs text-white/70">Total yang harus dibayar (nominal PAS)</p>
            <div className="flex items-center justify-between mt-1">
              <span className="font-serif-display text-3xl" data-testid="order-total">{rupiah(order.total_amount)}</span>
              <button onClick={copyTotal} data-testid="btn-copy-total" className="text-white/80 hover:text-white transition-colors">
                <Copy className="h-5 w-5" />
              </button>
            </div>
            <p className="text-[11px] text-[#F0C48A] mt-2">
              3 digit terakhir ({order.unique_code}) adalah kode unik. Bayar TEPAT sejumlah ini agar mudah kami cek di mutasi.
            </p>
          </div>
        </motion.div>

        {/* Payment / status action */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="rounded-2xl border border-border bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">

          {order.status === "verified" && (
            <div className="text-center py-4">
              <div className="h-14 w-14 mx-auto rounded-full bg-[#10B981]/15 flex items-center justify-center mb-3">
                <CheckCircle2 className="h-7 w-7 text-[#10B981]" />
              </div>
              <h3 className="font-serif-display text-2xl text-[#1E3A5F]">Pembayaran Terverifikasi</h3>
              <p className="text-sm text-[#6B7280] mt-1">Tiket Anda sudah sah. Tunjukkan halaman ini saat acara.</p>
            </div>
          )}
          {order.status === "rejected" && (
            <div className="text-center py-4">
              <XCircle className="h-12 w-12 mx-auto text-[#EF4444] mb-2" />
              <h3 className="font-serif-display text-2xl text-[#1E3A5F]">Pesanan Ditolak</h3>
              <p className="text-sm text-[#6B7280] mt-1">Bukti pembayaran tidak valid. Silakan hubungi panitia.</p>
            </div>
          )}
          {order.status === "expired" && (
            <div className="text-center py-4">
              <AlertTriangle className="h-12 w-12 mx-auto text-[#6B7280] mb-2" />
              <h3 className="font-serif-display text-2xl text-[#1E3A5F]">Pesanan Kadaluarsa</h3>
              <p className="text-sm text-[#6B7280] mt-1">Batas waktu pembayaran habis, kursi telah dilepas. Silakan pesan ulang.</p>
              <Link to="/"><Button className="mt-4 bg-[#D56115] hover:bg-[#B34F0F]">Pesan Ulang</Button></Link>
            </div>
          )}

          {(order.status === "pending_payment" || order.status === "waiting_verification") && (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-serif-display text-2xl text-[#1E3A5F]">Pembayaran</h2>
                {order.status === "pending_payment" && remaining != null && (
                  <span data-testid="countdown" className="text-sm font-mono px-2.5 py-1 rounded-full bg-[#D56115]/10 text-[#B34F0F]">
                    {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
                  </span>
                )}
              </div>

              <Tabs defaultValue={order.payment_method} className="w-full">
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="qris" data-testid="tab-qris"><QrCode className="h-4 w-4 mr-1.5" /> QRIS</TabsTrigger>
                  <TabsTrigger value="transfer" data-testid="tab-transfer"><Landmark className="h-4 w-4 mr-1.5" /> Transfer</TabsTrigger>
                </TabsList>
                <TabsContent value="qris" className="pt-4">
                  <div className="rounded-xl border border-border p-3 bg-white">
                    <img src={LOGOS.qris} alt="QRIS" className="w-full max-w-xs mx-auto rounded-lg" data-testid="qris-image" />
                  </div>
                  <a href={LOGOS.qris} download="QRIS-MBI.png" target="_blank" rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm text-[#D56115] hover:underline" data-testid="btn-download-qris">
                    <Download className="h-4 w-4" /> Simpan gambar QRIS
                  </a>
                  <p className="text-xs text-[#6B7280] mt-2">Scan QRIS lalu bayar nominal PAS {rupiah(order.total_amount)}.</p>
                </TabsContent>
                <TabsContent value="transfer" className="pt-4">
                  <p className="text-sm font-medium text-[#1E3A5F] mb-2">Transfer ke Rekening <b>PD MBI Kepri</b></p>
                  <div className="rounded-xl border border-border p-5 bg-[#FDFBF7] space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-[#6B7280]">Bank</span><span className="font-semibold">{order.transfer?.bank}</span></div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-[#6B7280]">No. Rekening</span>
                      <span className="font-semibold flex items-center gap-2">
                        {order.transfer?.account_number}
                        <button onClick={() => { navigator.clipboard.writeText(order.transfer?.account_number.replace(/\s/g, "")); toast.success("No. rekening disalin"); }}
                          data-testid="btn-copy-rek" className="text-[#D56115]"><Copy className="h-3.5 w-3.5" /></button>
                      </span>
                    </div>
                    <div className="flex justify-between text-sm"><span className="text-[#6B7280]">Atas Nama</span><span className="font-semibold text-right max-w-[60%]">{order.transfer?.account_name}</span></div>
                  </div>

                  {/* Keterangan / berita transfer (auto isi No. Order) */}
                  <div className="mt-3">
                    <label className="text-xs text-[#6B7280]">Keterangan / Berita Transfer <span className="text-[#B34F0F]">(wajib diisi)</span></label>
                    <div className="mt-1 flex items-center gap-2 rounded-lg border-2 border-dashed border-[#D56115]/40 bg-white px-3 py-2.5">
                      <span data-testid="transfer-note" className="flex-1 font-mono font-bold text-[#1E3A5F] tracking-wide">No. Order #{order.order_no}</span>
                      <button onClick={() => { navigator.clipboard.writeText(`No. Order #${order.order_no}`); toast.success("Keterangan disalin"); }}
                        data-testid="btn-copy-note" className="inline-flex items-center gap-1 text-xs text-[#D56115] font-medium hover:underline">
                        <Copy className="h-3.5 w-3.5" /> Salin
                      </button>
                    </div>
                    <p className="text-[11px] text-[#6B7280] mt-1">Salin & tempel pada kolom berita transfer agar mudah kami cocokkan.</p>
                  </div>

                  {/* Nominal transfer - ditonjolkan */}
                  <div className="mt-3 rounded-xl bg-[#1E3A5F] text-white px-4 py-3">
                    <p className="text-xs text-white/70">Nominal Transfer (harus PAS)</p>
                    <div className="flex items-center justify-between">
                      <span className="font-serif-display text-3xl tracking-tight" data-testid="transfer-amount">{rupiah(order.total_amount)}</span>
                      <button onClick={() => { navigator.clipboard.writeText(String(order.total_amount)); toast.success("Nominal disalin"); }}
                        data-testid="btn-copy-transfer-total" className="text-white/80 hover:text-white"><Copy className="h-5 w-5" /></button>
                    </div>
                    <p className="text-[11px] text-[#F0C48A] mt-0.5">3 digit terakhir ({order.unique_code}) adalah kode unik — bayar TEPAT sejumlah ini.</p>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="border-t border-border my-5" />

              {order.proof_image && (
                <div className="mb-4">
                  <p className="text-xs text-[#6B7280] mb-1.5">Bukti terunggah:</p>
                  <img src={order.proof_image} alt="Bukti" className="rounded-lg border border-border max-h-48 object-contain" data-testid="proof-preview" />
                </div>
              )}

              {canUpload && (
                <>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} data-testid="file-input" />
                  <Button onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="btn-upload-proof"
                    className="w-full bg-[#D56115] hover:bg-[#B34F0F] rounded-full">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <UploadCloud className="h-4 w-4 mr-1.5" />}
                    {order.proof_image ? "Ganti Bukti Pembayaran" : "Upload Bukti Pembayaran"}
                  </Button>
                </>
              )}

              {order.status === "waiting_verification" && (
                <p className="text-xs text-center text-[#6B7280] mt-3">
                  Bukti sudah kami terima. Menunggu verifikasi panitia (cek mutasi).
                </p>
              )}
            </>
          )}
        </motion.div>
      </div>

      {/* Upload reminder popup */}
      <Dialog open={reminderOpen} onOpenChange={setReminderOpen}>
        <DialogContent data-testid="reminder-dialog">
          <DialogHeader>
            <div className="h-11 w-11 rounded-full bg-[#D56115]/15 flex items-center justify-center mb-2">
              <Upload className="h-5 w-5 text-[#D56115]" />
            </div>
            <DialogTitle className="font-serif-display text-2xl text-[#1E3A5F]">Segera Upload Bukti Bayar!</DialogTitle>
            <DialogDescription className="text-[#6B7280]">
              Bayar tepat <b>{rupiah(order.total_amount)}</b> lalu <b>wajib upload bukti transfer/QRIS</b> di halaman ini.
              Kursi hanya dikunci 15 menit — jika tidak, kursi akan dilepas otomatis.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setReminderOpen(false)} className="bg-[#D56115] hover:bg-[#B34F0F] w-full" data-testid="btn-reminder-ok">
              Mengerti, Lanjut Bayar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
