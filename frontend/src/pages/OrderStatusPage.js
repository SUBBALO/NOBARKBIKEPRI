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
    pending_payment: { t: "Menunggu Pembayaran", c: "bg-[#B26A1E]/15 text-[#8A3A12]", i: Clock },
    waiting_verification: { t: "Menunggu Verifikasi", c: "bg-[#7A241F]/15 text-[#7A241F]", i: Hourglass },
    verified: { t: "Terverifikasi", c: "bg-[#2F703E]/15 text-[#255E33]", i: CheckCircle2 },
    rejected: { t: "Ditolak", c: "bg-[#EF4444]/15 text-[#EF4444]", i: XCircle },
    expired: { t: "Kadaluarsa", c: "bg-[#7A6A5E]/15 text-[#7A6A5E]", i: AlertTriangle },
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

  if (loading) return <div className="flex justify-center py-32"><Loader2 className="h-7 w-7 animate-spin text-[#B26A1E]" /></div>;
  if (!order) return (
    <div className="max-w-md mx-auto text-center py-32 px-4">
      <p className="text-[#7A6A5E]">Pesanan tidak ditemukan.</p>
      <Link to="/"><Button className="mt-4 bg-[#B26A1E] hover:bg-[#8A3A12]">Kembali</Button></Link>
    </div>
  );

  const mm = remaining != null ? Math.floor(remaining / 60000) : null;
  const ss = remaining != null ? Math.floor((remaining % 60000) / 1000) : null;
  const canUpload = order.status === "pending_payment" || order.status === "waiting_verification";

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-8 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-xs text-[#7A6A5E]">No. Order</p>
          <p className="font-mono text-sm text-[#7A241F]" data-testid="order-id">#{order.order_no}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Order detail */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-border bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <h2 className="font-serif-display text-2xl text-[#7A241F] mb-4">Detail Pesanan</h2>
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between"><dt className="text-[#7A6A5E]">Nama</dt><dd className="font-medium">{order.name}</dd></div>
            <div className="flex justify-between"><dt className="text-[#7A6A5E]">No. HP</dt><dd className="font-medium">{order.phone}</dd></div>
            <div className="flex justify-between"><dt className="text-[#7A6A5E]">Sesi</dt><dd className="font-medium">{order.session?.name} · {order.session?.time}</dd></div>
            <div className="flex justify-between"><dt className="text-[#7A6A5E]">Kursi</dt><dd className="font-medium text-right">{order.seats.join(", ")}</dd></div>
            <div className="flex justify-between"><dt className="text-[#7A6A5E]">Jumlah tiket</dt><dd className="font-medium">{order.qty} kursi</dd></div>
            <div className="flex justify-between"><dt className="text-[#7A6A5E]">Kontribusi</dt><dd className="font-medium">Dana Sukarela</dd></div>
          </dl>
          <div className="mt-5 rounded-xl bg-[#F3E9DD] border border-[#B26A1E]/40 p-5">
            <p className="text-xs text-[#7A6A5E]">Nominal Dana Sukarela</p>
            <div className="flex items-center justify-between mt-1">
              <span className="font-serif-display text-3xl text-[#7A241F]" data-testid="order-total">{rupiah(order.total_amount)}</span>
              <button onClick={copyTotal} data-testid="btn-copy-total" className="text-[#B26A1E] hover:text-[#7A241F] transition-colors">
                <Copy className="h-5 w-5" />
              </button>
            </div>
            <p className="text-[11px] text-[#5B4636] mt-2 leading-relaxed">
              Kontribusi bersifat sukarela. Mohon transfer sesuai nominal yang tertera di atas untuk memudahkan verifikasi pembayaran. Nominal di atas sudah termasuk kode unik untuk identifikasi pembayaran.
            </p>
          </div>
        </motion.div>

        {/* Payment / status action */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="rounded-2xl border border-border bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">

          {order.status === "verified" && (
            <div className="text-center py-4">
              <div className="h-14 w-14 mx-auto rounded-full bg-[#2F703E]/15 flex items-center justify-center mb-3">
                <CheckCircle2 className="h-7 w-7 text-[#2F703E]" />
              </div>
              <h3 className="font-serif-display text-2xl text-[#7A241F]">Pembayaran Terverifikasi</h3>
              <p className="text-sm text-[#7A6A5E] mt-1">Tiket Anda sudah sah. Tunjukkan halaman ini saat acara.</p>
            </div>
          )}
          {order.status === "rejected" && (
            <div className="text-center py-4">
              <XCircle className="h-12 w-12 mx-auto text-[#EF4444] mb-2" />
              <h3 className="font-serif-display text-2xl text-[#7A241F]">Pesanan Ditolak</h3>
              <p className="text-sm text-[#7A6A5E] mt-1">Bukti pembayaran tidak valid. Silakan hubungi panitia.</p>
            </div>
          )}
          {order.status === "expired" && (
            <div className="text-center py-4">
              <AlertTriangle className="h-12 w-12 mx-auto text-[#7A6A5E] mb-2" />
              <h3 className="font-serif-display text-2xl text-[#7A241F]">Pesanan Kadaluarsa</h3>
              <p className="text-sm text-[#7A6A5E] mt-1">Batas waktu pembayaran habis, kursi telah dilepas. Silakan pesan ulang.</p>
              <Link to="/"><Button className="mt-4 bg-[#B26A1E] hover:bg-[#8A3A12]">Pesan Ulang</Button></Link>
            </div>
          )}

          {(order.status === "pending_payment" || order.status === "waiting_verification") && (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-serif-display text-2xl text-[#7A241F]">Pembayaran</h2>
                {order.status === "pending_payment" && remaining != null && (
                  <span data-testid="countdown" className="text-sm font-mono px-2.5 py-1 rounded-full bg-[#B26A1E]/10 text-[#8A3A12]">
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
                    className="mt-3 inline-flex items-center gap-1.5 text-sm text-[#B26A1E] hover:underline" data-testid="btn-download-qris">
                    <Download className="h-4 w-4" /> Simpan gambar QRIS
                  </a>
                  <p className="text-xs text-[#7A6A5E] mt-2">Scan QRIS lalu transfer sesuai nominal yang tertera ({rupiah(order.total_amount)}). Nominal sudah termasuk kode unik untuk identifikasi pembayaran.</p>
                </TabsContent>
                <TabsContent value="transfer" className="pt-4">
                  <p className="text-sm font-medium text-[#7A241F] mb-2">Transfer ke Rekening <b>PD MBI Kepri</b></p>
                  <div className="rounded-xl border border-border p-5 bg-[#FDFBF7] space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-[#7A6A5E]">Bank</span><span className="font-semibold">{order.transfer?.bank}</span></div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-[#7A6A5E]">No. Rekening</span>
                      <span className="font-semibold flex items-center gap-2">
                        {order.transfer?.account_number}
                        <button onClick={() => { navigator.clipboard.writeText(order.transfer?.account_number.replace(/\s/g, "")); toast.success("No. rekening disalin"); }}
                          data-testid="btn-copy-rek" className="text-[#B26A1E]"><Copy className="h-3.5 w-3.5" /></button>
                      </span>
                    </div>
                    <div className="flex justify-between text-sm"><span className="text-[#7A6A5E]">Atas Nama</span><span className="font-semibold text-right max-w-[60%]">{order.transfer?.account_name}</span></div>
                  </div>

                  {/* Keterangan / berita transfer (auto isi No. Order) */}
                  <div className="mt-3">
                    <label className="text-xs text-[#7A6A5E]">Keterangan / Berita Transfer <span className="text-[#8A3A12]">(wajib diisi)</span></label>
                    <div className="mt-1 flex items-center gap-2 rounded-lg border-2 border-dashed border-[#B26A1E]/40 bg-white px-3 py-2.5">
                      <span data-testid="transfer-note" className="flex-1 font-mono font-bold text-[#7A241F] tracking-wide">#{order.order_no}</span>
                      <button onClick={() => { navigator.clipboard.writeText(String(order.order_no)); toast.success(`"${order.order_no}" disalin`); }}
                        data-testid="btn-copy-note" className="inline-flex items-center gap-1 text-xs text-[#B26A1E] font-medium hover:underline">
                        <Copy className="h-3.5 w-3.5" /> Salin
                      </button>
                    </div>
                    <p className="text-[11px] text-[#7A6A5E] mt-1">Cukup salin angka <b>{order.order_no}</b> lalu tempel pada kolom berita transfer.</p>
                  </div>

                  {/* Nominal transfer - ditonjolkan */}
                  <div className="mt-3 rounded-xl bg-[#F3E9DD] border border-[#B26A1E]/40 px-4 py-3">
                    <p className="text-xs text-[#7A6A5E]">Nominal Dana Sukarela</p>
                    <div className="flex items-center justify-between">
                      <span className="font-serif-display text-3xl tracking-tight text-[#7A241F]" data-testid="transfer-amount">{rupiah(order.total_amount)}</span>
                      <button onClick={() => { navigator.clipboard.writeText(String(order.total_amount)); toast.success("Nominal disalin"); }}
                        data-testid="btn-copy-transfer-total" className="text-[#B26A1E] hover:text-[#7A241F]"><Copy className="h-5 w-5" /></button>
                    </div>
                    <p className="text-[11px] text-[#5B4636] mt-0.5 leading-relaxed">Mohon transfer sesuai nominal yang tertera untuk memudahkan verifikasi. Nominal sudah termasuk kode unik untuk identifikasi pembayaran.</p>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="border-t border-border my-5" />

              {order.proof_image && (
                <div className="mb-4">
                  <p className="text-xs text-[#7A6A5E] mb-1.5">Bukti terunggah:</p>
                  <img src={order.proof_image} alt="Bukti" className="rounded-lg border border-border max-h-48 object-contain" data-testid="proof-preview" />
                </div>
              )}

              {canUpload && (
                <>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} data-testid="file-input" />
                  <Button onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="btn-upload-proof"
                    className="w-full bg-[#B26A1E] hover:bg-[#8A3A12] rounded-full">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <UploadCloud className="h-4 w-4 mr-1.5" />}
                    {order.proof_image ? "Ganti Bukti Pembayaran" : "Upload Bukti Pembayaran"}
                  </Button>
                </>
              )}

              {order.status === "waiting_verification" && (
                <p className="text-xs text-center text-[#7A6A5E] mt-3">
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
            <div className="h-11 w-11 rounded-full bg-[#B26A1E]/15 flex items-center justify-center mb-2">
              <Upload className="h-5 w-5 text-[#B26A1E]" />
            </div>
            <DialogTitle className="font-serif-display text-2xl text-[#7A241F]">Segera Upload Bukti Bayar!</DialogTitle>
            <DialogDescription className="text-[#7A6A5E]">
              Bayar tepat <b>{rupiah(order.total_amount)}</b> lalu <b>wajib upload bukti transfer/QRIS</b> di halaman ini.
              Kursi hanya dikunci 15 menit — jika tidak, kursi akan dilepas otomatis.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setReminderOpen(false)} className="bg-[#B26A1E] hover:bg-[#8A3A12] w-full" data-testid="btn-reminder-ok">
              Mengerti, Lanjut Bayar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
