# PRD — Nonton Bersama MBI Kepri (Ticket Pre-order/Booking)

## Problem Statement
Website pemesanan tiket nonton bareng film dokumenter, acara Minggu 13 Sep 2026 di CGV Grand Batam.
Alur: user isi data → pilih sesi → pilih kursi → bayar (QRIS / Transfer BCA) dengan kode unik + no. order 4 digit → upload bukti. Admin verifikasi pembayaran & check-in peserta di hari-H.
Bahasa user: Indonesia. Harga tiket Rp 50.000/kursi.

## Stack
React + FastAPI + MongoDB. Auth JWT (bcrypt + PyJWT) via header `X-Admin-Token`. openpyxl untuk export Excel.

## Roles (admin_users)
- superadmin: semua akses + Kelola User (tambah/hapus user).
- admin: verifikasi/tolak/hapus order, check-in, export, lihat log. TIDAK kelola user.
- checkin: hanya halaman /checkin. Login di /admin → diarahkan ke /checkin.
Default seed: admin1(superadmin)/admin2(admin)/admin3(checkin), semua password `admin123`. Lihat test_credentials.md.

## Implemented (per Jun 2026 session)
- Booking flow lengkap: atomic seat lock, kode unik mutasi, no order 4 digit.
- Sesi aktif = sesi pertama yang belum penuh (Sesi 1 dulu, lanjut 2/3/4 saat penuh). `resolve_active_session()`.
- Halaman Upload Bukti publik: nama disamarkan (mask_name) + kursi disembunyikan (backend & UI).
- Admin dashboard: filter, search (nama/HP/no order), bulk verify/reject, export Excel, WhatsApp wa.me, upload bukti atas nama user.
- Hapus order permanen + dialog konfirmasi (staff), membebaskan seat lock.
- Sistem user login (username+password, JWT, 3 role) + tab Kelola User (superadmin).
- Log Aktivitas: catat hapus/verifikasi/tolak/bulk/checkin/buat-hapus user (aktor + waktu). Tab "Log Aktivitas".
- Check-in: /checkin login username+password; cari peserta by nama/HP/no order 4 digit; no order tampil di kartu.
- Riwayat check-in: order menyimpan `checked_in_by` (nama petugas); tampil "oleh <nama>" di kartu peserta hadir (mobile & panel admin).
- Homepage: hero diringkas (form Data Diri langsung terlihat), kartu "Kontak Person" atas dihapus (footer tetap ada).
- Footer: teks kecil "Developed by Alam Tenang" (tautan Instagram @alam_tenang) di paling bawah.
- Export Log Aktivitas ke Excel (tombol di tab Log, endpoint GET /api/admin/logs/export).
- Indikator "sisa kursi" menonjol di halaman Pilih Sesi (angka besar + progress bar; label "Segera penuh" bila sisa ≤ 20).
- Menu Walk-in "Jual di Tempat" (staff, halaman monitor `/walkin`): login username+password (hanya admin/superadmin). Pilih kursi MANUAL dari peta kursi live (auto-refresh 5 dtk, mengikuti ketersediaan sistem). Isi nama + no HP opsional + metode Cash/QRIS/Transfer → order langsung status verified + checked_in (checked_in_by = petugas). Cash = nominal pas tanpa kode unik & tanpa bukti; QRIS/Transfer = pakai kode unik. Popup hasil menampilkan no order, total (+kode unik), dan kursi untuk diserahkan. Endpoint POST /api/admin/walkin menerima {name,phone,session_id,seats[],payment_method}. Tab admin "Jual di Tempat" = launcher ke /walkin.
- (Agu 2026) Re-theme poster warm maroon/gold/cream; poster di hero (POSTER_URL); banner "Sudah bayar tapi lupa upload bukti?" pindah ke paling atas homepage.
- (Agu 2026) Klik kartu sesi yang dibuka → langsung masuk Pilih Kursi (tanpa tombol Lanjut di step 2).
- (Agu 2026) Audit Mobile: SeatMap muat penuh di 390px (kursi 24px + gap kecil di mobile, sm: ukuran lama), header "Upload Bukti" selalu bertext, banner subtitle tidak truncate, padding kartu step p-4 di mobile. Step 4 & /upload tanpa horizontal overflow.
- (Agu 2026) Grafik "Pembelian Tiket per Hari" di panel admin (recharts stacked bar terverifikasi vs belum + tabel harian). Backend: `stats["daily"]` per tanggal WIB {date, orders, tickets, tickets_verified, revenue_verified}, exclude expired/rejected.
- (Agu 2026) MODE COMING SOON: default ON (config key `coming_soon` tidak ada → dianggap True, aman untuk publish sebelum penjualan dibuka). Halaman depan menampilkan poster + tanggal + badge "Tiket Segera Dibuka"; link & halaman Upload Bukti disembunyikan/diblokir; POST /orders & GET /orders/lookup ditolak 403. Toggle switch di panel admin (khusus superadmin, card di atas dashboard) → POST /api/admin/coming-soon {enabled} (tercatat di log aktivitas). Buka penjualan cukup geser switch, TANPA redeploy.
- (Agu 2026) Panel Admin mobile-friendly: header wrap (tanpa overflow), Daftar Pesanan tampil sebagai KARTU di layar < md (data-testid `orders-cards`, aksi lengkap: cek bukti/upload/WA/hapus/checkbox bulk), tabel tetap untuk desktop (hidden md:block). Overflow horizontal 0px di 390px. Buat user via UI diverifikasi berfungsi (isu "gagal buat user" tidak terreproduksi di preview — kemungkinan validasi input atau belum redeploy di produksi).

## Key APIs
- POST /api/admin/login {username,password} → {token, user}
- GET /api/admin/me ; GET/POST /api/admin/users ; DELETE /api/admin/users/{id} (superadmin)
- GET /api/admin/logs (staff)
- GET /api/admin/orders, /admin/stats, /admin/export (staff)
- POST /api/admin/orders/{id}/verify|reject ; DELETE /api/admin/orders/{id} ; POST /admin/orders/bulk (staff)
- POST /api/admin/orders/{id}/checkin (any role) — records checked_in_by
- GET /api/admin/participants (any role) — includes checked_in_by
- GET /api/orders/lookup?phone= (public, masked name, no seats)

## Testing
iteration_3.json: 100% pass (19/19 backend + frontend flows) untuk auth/role/log/delete/checkin/lookup-mask/session-order/contact-card removal.

## Environment note
Produksi terpisah dari preview (data preview volatil). Deploy 50 credits/bulan/app, terpotong di muka saat Deploy; redeploy update gratis dalam periode aktif; app tetap live walau workspace terblokir selama periode terbayar.

## Backlog / Future (P1)
- Refaktor Pre-order (bayar tanpa pilih kursi → pilih kursi saat check-in) — DITUNDA, belum dikonfirmasi user.
- Batas kapasitas per sesi (mis. 200 tiket) untuk pre-order.
- Live board /board seat map auto-refresh saat check-in.
- (Opsional) hapus/nonaktifkan "Kontrol Sesi" manual di admin karena sesi kini otomatis sekuensial.
