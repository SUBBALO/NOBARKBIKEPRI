import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { api, rupiah } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Search, UploadCloud, CheckCircle2, Hourglass, Clock,
  AlertTriangle, QrCode, Landmark, Copy,
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

const STATUS = {
  pending_payment: { t: "Belum Upload Bukti", c: "bg-[#B26A1E]/15 text-[#8A3A12]", i: Clock },
  expired: { t: "Kadaluarsa (segera upload)", c: "bg-[#7A6A5E]/15 text-[#7A6A5E]", i: AlertTriangle },
  waiting_verification: { t: "Menunggu Verifikasi", c: "bg-[#7A241F]/15 text-[#7A241F]", i: Hourglass },
  verified: { t: "Terverifikasi", c: "bg-[#2F703E]/15 text-[#255E33]", i: CheckCircle2 },
};

export default function UploadProofPage() {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [orders, setOrders] = useState([]);
  const [transfer, setTransfer] = useState(null);
  const [uploadingId, setUploadingId] = useState(null);
  const [comingSoon, setComingSoon] = useState(null);
  const fileRefs = useRef({});

  useEffect(() => {
    api.get("/event").then(({ data }) => setComingSoon(!!data.coming_soon)).catch(() => setComingSoon(false));
  }, []);

  const search = async (e) => {
    e?.preventDefault();
    if (phone.trim().replace(/[\s-]/g, "").length < 6) return toast.error("Masukkan nomor HP yang benar");
    setLoading(true); setSearched(false);
    try {
      const { data } = await api.get(`/orders/lookup`, { params: { phone } });
      setOrders(data.orders); setTransfer(data.transfer); setSearched(true);
      if (data.orders.length === 0) toast.info("Tidak ada pesanan untuk nomor ini");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Gagal mencari pesanan");
    }
    setLoading(false);
  };

  const handleFile = async (order, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("File harus berupa gambar");
    setUploadingId(order.id);
    try {
      const dataUrl = await compressImage(file);
      await api.post(`/orders/${order.id}/proof`, { proof_image: dataUrl });
      toast.success("Bukti berhasil diunggah! Menunggu verifikasi panitia.");
      await search();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Gagal mengunggah bukti");
    }
    setUploadingId(null);
  };

  if (comingSoon) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-8 py-16 text-center" data-testid="upload-coming-soon">
        <Clock className="h-10 w-10 text-[#B26A1E] mx-auto mb-4" />
        <h1 className="font-serif-display text-3xl text-[#7A241F]">Penjualan Belum Dibuka</h1>
        <p className="text-sm text-[#7A6A5E] mt-2">Tiket segera dibuka. Halaman ini akan aktif setelah penjualan dimulai.</p>
        <Link to="/"><Button className="mt-6 bg-[#B26A1E] hover:bg-[#8A3A12] rounded-full px-6">Kembali ke Beranda</Button></Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-8 py-10 sm:py-14">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-serif-display text-3xl sm:text-4xl text-[#7A241F]">Cek Pesanan &amp; Unggah Bukti Berdana</h1>
        <p className="text-sm text-[#7A6A5E] mt-2">
          Sudah berdana tapi belum sempat kirim bukti? Masukkan <b>nomor HP</b> yang Anda pakai saat memesan untuk menemukan pesanan Anda — lalu cek status &amp; unggah bukti transfer.
        </p>

        <form onSubmit={search} className="mt-6 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7A6A5E]" />
            <Input data-testid="lookup-phone" value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="08xxxxxxxxxx" className="pl-9" />
          </div>
          <Button type="submit" disabled={loading} data-testid="btn-lookup"
            className="bg-[#B26A1E] hover:bg-[#8A3A12] rounded-full px-6">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Search className="h-4 w-4 mr-1.5" />}
            Cari Pesanan
          </Button>
        </form>
      </motion.div>

      {searched && orders.length === 0 && (
        <div className="mt-8 text-center rounded-2xl border border-border bg-white p-10">
          <p className="text-[#7A6A5E]">Tidak ada pesanan ditemukan untuk nomor <b>{phone}</b>.</p>
          <Link to="/"><Button className="mt-4 bg-[#B26A1E] hover:bg-[#8A3A12]">Pesan Tiket</Button></Link>
        </div>
      )}

      <div className="mt-8 space-y-4">
        {orders.map((o) => {
          const meta = STATUS[o.status] || STATUS.pending_payment;
          const Icon = meta.i;
          const canUpload = ["pending_payment", "expired", "waiting_verification"].includes(o.status);
          return (
            <motion.div key={o.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              data-testid={`lookup-order-${o.id.slice(0, 8)}`}
              className="rounded-2xl border border-border bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="font-semibold text-[#2C1E16]">{o.name} <span className="font-mono text-xs text-[#7A6A5E]">#{o.order_no}</span></p>
                  <p className="text-xs text-[#7A6A5E]">{o.session?.name} · {o.session?.time} · {o.qty} tiket</p>
                </div>
                <span className={cn("inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium", meta.c)}>
                  <Icon className="h-3.5 w-3.5" /> {meta.t}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-[#7A6A5E]">Jumlah tiket</p>
                  <p className="font-semibold text-[#7A241F]">{o.qty} tiket</p>
                </div>
                <div className="rounded-lg bg-[#7A241F] text-white p-3">
                  <p className="text-xs text-white/70">Nominal yang harus ditransfer</p>
                  <div className="flex items-center justify-between">
                    <p className="font-serif-display text-xl">{rupiah(o.total_amount)}</p>
                    <button onClick={() => { navigator.clipboard.writeText(String(o.total_amount)); toast.success("Nominal disalin"); }}
                      data-testid={`copy-total-${o.id.slice(0, 8)}`} className="text-white/80 hover:text-white"><Copy className="h-4 w-4" /></button>
                  </div>
                  <p className="text-[10px] text-[#E4C57E] mt-0.5">termasuk kode unik {o.unique_code}</p>
                </div>
              </div>

              <p className="text-xs text-[#7A6A5E] mt-3 flex items-center gap-1.5">
                {o.payment_method === "qris" ? <QrCode className="h-3.5 w-3.5" /> : <Landmark className="h-3.5 w-3.5" />}
                Metode: {o.payment_method === "qris" ? "QRIS" : `Transfer ${transfer?.bank} — ${transfer?.short_name}`}
              </p>

              {o.status === "verified" ? (
                <p className="mt-4 text-sm text-[#255E33] flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> Sudah terverifikasi, tidak perlu upload lagi.</p>
              ) : canUpload && (
                <div className="mt-4">
                  <input ref={(el) => (fileRefs.current[o.id] = el)} type="file" accept="image/*" className="hidden"
                    onChange={(e) => handleFile(o, e)} data-testid={`file-${o.id.slice(0, 8)}`} />
                  <Button onClick={() => fileRefs.current[o.id]?.click()} disabled={uploadingId === o.id}
                    data-testid={`upload-${o.id.slice(0, 8)}`} className="w-full bg-[#B26A1E] hover:bg-[#8A3A12] rounded-full">
                    {uploadingId === o.id ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <UploadCloud className="h-4 w-4 mr-1.5" />}
                    {o.has_proof ? "Ganti Bukti Pembayaran" : "Upload Bukti Pembayaran"}
                  </Button>
                  {o.has_proof && <p className="text-[11px] text-center text-[#7A6A5E] mt-1.5">Bukti sudah ada — upload lagi untuk mengganti.</p>}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
