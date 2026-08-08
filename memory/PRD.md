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
- Footer: teks kecil "Developed by Alam Tenang" di paling bawah.

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
