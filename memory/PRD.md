# PRD — Website Tiket Nonton Bersama KBI Kepri

## Problem Statement (asli, Bahasa Indonesia)
Website beli tiket nonton bareng Film Dokumenter "Y.A. MNS. Ashin Jinarakkhita: Jejak Langkah Sang Pelopor di Nusantara". Pembayaran manual (QRIS / Transfer BCA). Pembeli input nama+HP, pilih sesi, pilih kursi, pilih metode bayar, muncul total + kode unik untuk pengecekan mutasi, wajib upload bukti bayar. Admin verifikasi pembayaran & check-in peserta saat acara.

## Event Details
- Judul: Nonton Bersama Film Dokumenter "Y.A. MNS. Ashin Jinarakkhita: Jejak Langkah Sang Pelopor di Nusantara"
- Tanggal: Minggu, 13 September 2026
- Lokasi: CGV Grand Batam
- Harga: Rp50.000 / kursi
- 4 sesi (13:00, 15:00, 17:00, 19:00 WIB — placeholder, bisa diubah)
- Kapasitas: 100 kursi/sesi (baris A–K x 10, tanpa I)
- QRIS statis + Transfer BCA 061 518 3381 a.n. PD Majelis Buddhayana Indonesia Prov Kepri (PD MBI Kepri)

## Architecture
- Frontend: React (CRA + craco), Tailwind, shadcn/ui, framer-motion, sonner. Fonts: Cormorant Garamond (heading) + DM Sans (body).
- Backend: FastAPI + MongoDB (motor). Semua route prefix /api.
- Bukti bayar disimpan base64 di MongoDB (dikompres di client). Tanpa storage eksternal.
- Admin auth: password (ADMIN_PASSWORD) -> static X-Admin-Token header. Config di backend/.env.

## User Personas
- Pembeli/peserta: memesan tiket & upload bukti bayar.
- Admin/panitia: verifikasi pembayaran (cek mutasi via nominal unik) & check-in peserta di lokasi.

## Core Requirements (static)
- Alur pesan: nama+HP → pilih sesi → pilih kursi (bebas) → metode bayar → total + kode unik → wajib upload bukti.
- Sesi berurutan: hanya sesi aktif yang bisa dipesan, mulai Sesi 1; auto-advance saat penuh; admin bisa override.
- Kode unik ditambahkan ke total (mis. 100.000 → 100.067) untuk cek mutasi.
- Kursi dikunci 15 menit; jika tidak upload → auto-expire & dilepas.
- Admin: verifikasi/tolak, kontrol sesi, stats, print tiket, check-in peserta.

## Implemented (2026-08)
- [x] Booking flow 4 langkah + validasi (BookingPage.js)
- [x] Denah kursi bioskop dengan LAYAR, pilih kursi bebas (SeatMap.js)
- [x] Sesi berurutan + auto-advance (backend resolve_active_session)
- [x] Kode unik unik-per-order + total (gen_unique_total)
- [x] Halaman order/pembayaran: QRIS + Transfer, countdown 15 mnt, popup upload, upload bukti (OrderStatusPage.js)
- [x] Auto-expire pesanan belum bayar (taken_seats)
- [x] Admin: login, stats, kontrol sesi, tabel pesanan, lihat bukti, verifikasi/tolak, print tiket
- [x] Admin tab Check-in Peserta: cari nama/HP → tandai hadir → popup pengingat serahkan tiket kursi
- [x] Header logo KBI+MBI, judul tab browser "KBI Kepri", sinopsis di hero
- [x] Tested: backend 20/20, frontend e2e 100% (iteration_1 & iteration_2)

## Backlog (belum dikerjakan)
- P1: Jam sesi final (masih placeholder).
- P1: Layout kursi final (sesuai denah asli CGV) bila sudah tersedia.
- P2: Notifikasi WhatsApp otomatis ke pembeli.
- P2: Export daftar pesanan ke Excel/CSV.
- P2: Deploy + custom domain (kbikepri).

## Test Credentials
- Admin: /admin, password `admin123`
