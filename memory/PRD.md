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
- (Agu 2026) "Dana Terkumpul per Sesi": kartu per sesi (revenue/tiket/pembeli, verified only) di tab Verifikasi Pembayaran. Backend `stats["per_session"]`. Grafik harian jadi ComposedChart + garis "Pembeli" (jumlah pesanan/hari). Export Excel kini punya sheet ke-2 "Ringkasan": dana per sesi + total + pembelian per hari.
- (Agu 2026) DENAH ASLI CINEMA 4 (REGULER) CGV: 12 baris M,L,K,J,H,G,F,E,D,C,B,A (tanpa I), nomor 1 di kanan, blok dipisah gang. SEAT_LAYOUT/COUPLE_PAIRS/RESERVED_SEATS/DISABILITY_SEATS di server.py. Kapasitas 207/sesi (209 - A11,A12 operator). Kursi couple pink WAJIB sepasang (B16-B7 berpasangan, seluruh baris A berpasangan; 15 pasang = 30 kursi) — klik 1 otomatis pilih pasangannya (UI), divalidasi juga server-side (online + walkin). K TIDAK punya kursi 9. K10 & K8 = kursi DISABILITAS (hijau): online DITOLAK, hanya bisa walk-in (SeatMap prop allowDisability di /walkin). A11/A12 reserved operator (gelap, disabled). SeatMap punya zoom in/out + hint "Geser untuk lihat semua kursi" di mobile (scroll di container, page tidak overflow). Harga semua kursi sama Rp50.000. Testing iteration_6: backend 7/7 + frontend e2e 100% pass.

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
- Angka preset tombol cepat nominal dana sukarela — user bilang "nanti sy br bahas".
- Ganti nama akun admin1/2/3 dengan nama panitia asli.
- Struk mini cetak untuk walk-in.
- Monitor kehadiran per sesi auto-refresh (/board).
- Refaktor Pre-order (bayar tanpa pilih kursi) — TIDAK RELEVAN lagi: denah asli sudah dipasang; anggap batal kecuali user minta.

## Update Terbaru (Agu 2026, sesi ini)
- DANA SUKARELA: harga tetap Rp50.000 DIHAPUS. Pembeli isi nominal TOTAL sendiri (bebas >0, maks 100jt). Acuan REFERENCE_COST Rp60.000/orang + tombol "Pakai nominal acuan" (qty×60rb) di step Pembayaran (donation-card) & /walkin (walkin-amount, walkin-use-reference). QRIS/transfer + kode unik; cash pas. OrderCreate/WalkinCreate punya field amount; unit_price tidak disimpan lagi. OrderStatusPage: "Jumlah tiket: N kursi" + "Kontribusi: Dana Sukarela".
- SESI MANUAL + 5 SESI: SESSIONS = 5 sesi (09.00-10.30, 12.30-14.30, 15.00-17.00, 17.00-19.00, 19.00-21.00 WIB; hardcode juga di WalkinPage.js). TIDAK ada buka otomatis — config `open_sessions` (default [] = semua TUTUP). Hanya SUPERADMIN via POST /api/admin/sessions/toggle (log action session_toggle); boleh banyak sesi terbuka bersamaan. Switch per sesi di panel admin (session-open-switch-N; admin biasa lihat saja). create_order menolak sesi tutup; walk-in TIDAK terikat status sesi. Endpoint lama /admin/active-session DIHAPUS.
- Info box kursi couple & disabilitas (seat-info-box) di step Pilih Kursi.
- Testing iteration_7: backend 9/9 + frontend 100% pass. Kondisi preview dikembalikan: coming_soon ON, semua sesi tutup.
- HAPUS PESANAN kini KHUSUS SUPERADMIN: DELETE /api/admin/orders/{id} pakai require_roles("superadmin"); tombol & kolom Hapus disembunyikan untuk admin biasa (isSuper). Dites: admin2 403 + tombol hilang, admin1 sukses.
- VERIFIED_BY: verifikasi/tolak pembayaran menyimpan verified_by (nama petugas); walk-in juga set verified_by. Panel admin menampilkan "oleh {nama}" di bawah "Payment OK" (kartu mobile + tabel). Hanya terisi untuk verifikasi baru.
- Filter sesi daftar pesanan diperbaiki: kini Sesi 1-5 (sebelumnya hardcode 1-4).
- PRODUKSI: custom domain https://kbikepri.com (user sudah redeploy).

## Update (14 Agu 2026 — sesi jual lokasi panitia + izin hapus + restore)
- **KONTROL SESI TERPISAH Umum vs Panitia**: config `walkin_sessions` (baru) di samping `open_sessions`. Tiap sesi punya 2 saklar di panel admin (Super Admin): `Umum (Online)`→open_sessions (data-testid session-open-switch-{id}), `Panitia (Lokasi)`→walkin_sessions (session-walkin-switch-{id}). `POST /api/admin/sessions/toggle {session_id,open,target:"public"|"walkin"}`. `/api/event` tiap sesi kini punya `walkin_open` bool. Walk-in DITOLAK (400) bila sesi tidak ada di walkin_sessions. Halaman /walkin: sesi tampil BUKA/TUTUP, sesi tutup → panel walkin-session-closed + submit disabled. Link panitia: `/walkin` (prod: https://kbikepri.com/walkin).
- **IZIN HAPUS per user (can_delete)**: superadmin selalu bisa; user lain via toggle "Boleh hapus data" di Kelola User (user-candelete-{username}) → `POST /api/admin/users/{id}/permission {can_delete:bool}`. delete_order kini `Depends(get_current_user)` cek role superadmin OR can_delete. public_user & get_current_user membawa can_delete.
- **SOFT DELETE + KOTAK SAMPAH + RESTORE**: DELETE /api/admin/orders/{id} TIDAK permanen — set `deleted:true` + deleted_at/deleted_by, lepas seat_locks. Semua query list/stats/export/lookup/participants/backfill exclude `deleted:{$ne:true}`. Superadmin: `GET /api/admin/orders/deleted`, `POST /api/admin/orders/{id}/restore` (kunci ulang kursi; 409 bila kursi diambil order lain). UI: tab "Kotak Sampah" (admin-tab-trash, superadmin) + TrashPanel + tombol Pulihkan. Dialog hapus kini "→ Kotak Sampah / Ya, Hapus" (bukan permanen).
- **REKAP KAS CASH per sesi**: `stats.cash_per_session` (walk-in cash verified per sesi). Ditampilkan di kotak Rekap Kas Cash (cash-per-session).
- **KANAL PENJUALAN + siapa yg jual/approve**: badge kanal Umum(Online)/Panitia(Lokasi) di Daftar Pesanan (channel-{id8}), "Dijual oleh {sold_by}" untuk walk-in (soldby-{id8}), "Diverifikasi oleh {verified_by}". Export Excel +kolom Kanal/Dijual Oleh/Diverifikasi Oleh, metode Cash kini benar (bukan Transfer).
- **WALK-IN PROOF wajib untuk QRIS/Transfer**: WalkinCreate +field `proof_image`. Cash tanpa bukti; QRIS/Transfer WAJIB upload foto (walkin-proof-box/upload, kamera environment) → order tetap verified + simpan proof_image (bisa dilihat admin via proof-image endpoint). Tombol "Pakai nominal acuan/acuan" DIHAPUS di BookingPage & WalkinPage; teks "Nominal tetap **bebas** sesuai kerelaan" diperbesar (donation-free-note / walkin-free-note).
- **USER chelyn**: username `chelyn` / password `Chelyn123456`, role admin, can_delete=true. Di-seed idempotent saat startup (ensure_committee_users) untuk environment baru/production; di preview di-set manual (sebelumnya sudah ada sebagai checkin).
- Testing iteration_8: backend 8/8 + frontend 100% (3 fitur inti). Tambahan (cash recap, channel, proof, free-note, chelyn) diverifikasi via curl + screenshot. Preview dikembalikan: coming_soon ON, semua sesi (umum & panitia) TUTUP.

## Update (14 Agu 2026 — bendahara lengkap, revisi sesi, keamanan, compact)
- **REVISI 4 SESI** (dari 5): S1 09.30–11.30, S2 12.00–14.00, S3 14.30–16.30, S4 17.00–19.00. Frontend/backend SESSIONS + filter [1..4].
- **WALK-IN lokasi wajib**: field `location` (ketik bebas, autocomplete dari localStorage `walkin_locations`, saran chip). Wajib semua metode. Panitia bisa jual beda lokasi di hari sama → rekap pisah per lokasi.
- **REKAP BENDAHARA LENGKAP** (tab Bendahara, Super Admin & Admin): `GET /api/admin/bendahara` → {grand_total (umum_amount/panitia_amount/cash/qris/transfer), by_date[], orders[] flat}. Mencakup UMUM (online) + PANITIA (walk-in) verified. Filter kanal/petugas/search + sort. **Export Excel** `GET /api/admin/bendahara/export` (3 sheet: Semua Transaksi, Ringkasan per Tanggal, Per Petugas).
- **HAPUS TAB** "Check-in Peserta" & "Jual di Tempat" dari panel admin (pakai link /checkin & /walkin). Sisa tab: Verifikasi Pembayaran, Bendahara, Log, Kelola User, Kotak Sampah.
- **RINGKASAN COMPACT**: SessionFunds+SalesSummary+DailyChart dibungkus collapsible "Ringkasan & Laporan Penjualan" (tertutup default) → daftar Verifikasi Pembayaran langsung terlihat.
- **RENAME** "Couple" → "Sweetbox (wajib 2 orang)" (SeatMap legend/title, BookingPage, error backend).
- **FOOTER** "Developed by Alam Tenang" diperbesar (text-base font-semibold).
- **KEAMANAN**: brute-force login (5x gagal per IP+username → kunci 15 mnt/429, koleksi login_attempts TTL 1 hari); batas bukti ~6MB (online+walkin); batas 6 kursi/pesanan online; CORS allow_credentials=False (aman dgn header token). CATATAN: password default admin123 LEMAH → sarankan user ganti (belum ada UI ganti password).
- Testing iteration_9 (file): backend 14/14, frontend 100%, no bugs. Keamanan diverifikasi via curl (lockout 429 works). Production build (CI=true) PASS.


## Update (14 Agu 2026, sesi ini) — Jual keliling + izin hapus + Kotak Sampah
- SESI PANITIA (WALK-IN) TERPISAH DARI UMUM: config baru `walkin_sessions` (default [] = tutup). /api/event tiap sesi punya `walkin_open`. Toggle: POST /api/admin/sessions/toggle body {session_id, open, target:'public'|'walkin'} (superadmin only). Panel admin: tiap sesi punya 2 switch — Umum (session-open-switch-N) & Panitia/Lokasi (session-walkin-switch-N). walkin_order() MENOLAK sesi yang tidak dibuka untuk walk-in (400). WalkinPage.js kunci sesi yang belum dibuka (walkin-session-closed), auto-pilih sesi terbuka, poll /event. => panitia bisa jualan sesi X di lokasi tanpa membukanya untuk umum online.
- IZIN HAPUS PER-USER: field user `can_delete`. DELETE order kini diizinkan untuk superadmin ATAU user.can_delete (bukan lagi superadmin-only). POST /api/admin/users/{id}/permission {can_delete} (superadmin). UsersPanel: switch "Boleh hapus data pesanan" (user-candelete-{username}) untuk non-super; super admin tampil pesan statis. public_user & get_current_user kirim can_delete.
- SOFT DELETE + KOTAK SAMPAH + RESTORE: delete_order jadi SOFT (set deleted:true, deleted_at, deleted_by) + lepas seat_locks. Semua query list/stats/export/lookup/participants/backfill exclude deleted:true. GET /api/admin/orders/deleted + POST /api/admin/orders/{id}/restore (superadmin only; restore re-lock kursi, tolak 409 bila kursi sudah diambil). Tab admin "Kotak Sampah" (admin-tab-trash, superadmin) + TrashPanel; dialog hapus kini "Ya, Hapus" (bukan permanen). Action log tambah "restore".
- Testing iteration_8: backend 8/8 + frontend 100% pass, no issues. Preview dikembalikan: coming_soon ON, semua sesi (umum & panitia) tutup.


## Update (15 Agu 2026, sesi ini) — Denah rapi + UI polish + deploy-ready
- DENAH GRID SEJAJAR (SeatMap.js): render pakai kolom TETAP nomor kursi (maxN..minN, umumnya 21→1). Tiap baris di-map by nomor; kolom tanpa kursi = spacer kosong (shrink-0, lebar = sz) → semua baris sejajar persis kayak denah asli. A/B kursi 1-4 sejajar, sweetbox B (7-16) sejajar dgn C, disabilitas K10 & K8 kini ada kolom kosong (K9) di tengah.
- LORONG JALAN: divider dashed "LORONG JALAN" di antara baris L & K (aisle horizontal).
- IN/OUT: kotak biru "IN/OUT" di baris C, diposisikan ABSOLUTE (left: calc(100%+8px)) di kanan LUAR grid — label "C" tidak tergeser & tetap sejajar baris lain. Marker "PINTU MASUK/KELUAR" lama dihapus.
- HEADER: tombol "Pesan Tiket" dihapus (Header.js). Sisa: logo + Upload Bukti (saat penjualan buka).
- FOOTER (Footer.js): "Developed by Alam Tenang" pindah ke tengah bawah (text-center), font diperkecil (text-[11px]/link text-xs), padding footer dipadatkan (py-4, mt-4).
- COPY DANA SUKARELA (BookingPage.js kartu donation): "Biaya pengadaan rata-rata Rp60.000/orang, sebagai acuan untuk 1 tiket. Nominal kontribusi bebas, sesuai Dana Paramita Anda. 🙏" (hapus var refTotal yg jadi unused).
- DIALOG KONFIRMASI (BookingPage.js): hapus baris "Total Rp X + kode unik" yg bikin salah baca. Sekarang: "N kursi (...) · Sesi" + "Metode pembayaran: QRIS/Transfer BCA" + note kecil nominal muncul di halaman pembayaran.
- WARNA KOTAK NOMINAL (OrderStatusPage.js, kartu QRIS & Transfer): dari maroon solid (bg-#7A241F, teks putih) → krem lembut (bg-#F3E9DD, border #B26A1E/40, nominal #7A241F, teks #5B4636) agar mudah dibaca (ramah lansia).
- DEPLOY READINESS: .gitignore — hapus baris .env/.env.*/*.env (jangan blok env files). /api/orders/lookup dioptimasi: filter phone via MongoDB $regex (abaikan spasi/strip) + .limit(200) (dulu tarik 3000 doc lalu filter di Python). Tambah `import re`. deployment_agent health check = PASS, no blockers.
- Semua perubahan sesi ini frontend + 2 fix deploy; diverifikasi via screenshot preview & curl. Belum dijalankan testing_agent (perubahan visual/kecil). User perlu REDEPLOY agar naik ke kbikepri.com.


## Update (15 Agu 2026, sesi ini — lanjutan) — Export per tabel, Edit User, Role Penjual, Log login/logout
- EXPORT PER TABEL: tombol "Export Excel" GLOBAL di pojok panel admin DIHAPUS. Masterlist tiap tabel punya export sendiri: GET /api/admin/masterlist/export?type=umum|vip (xlsx, require_staff). Tombol UI: masterlist-export-umum / masterlist-export-vip. exportExcel + state exporting level-AdminPage dihapus (unused).
- KELOLA USER — EDIT: PUT /api/admin/users/{id} body {name?, role?, can_delete?} (require_super). Safeguard: nama min 2 char (400), tidak bisa turunkan super admin TERAKHIR (400), tidak bisa turunkan role akun sendiri (400). Audit log 'user_update'. UI: tombol "Edit" per user → dialog user-edit-dialog (input nama + radio peran user-edit-role-{role}).
- ROLE BARU 'seller' = Petugas Penjual Tiket: boleh /walkin + /checkin SAJA. Guard baru require_walkin = require_roles(superadmin,admin,seller) dipakai walkin_order. Seller DIBLOKIR (403) dari /admin/stats, /admin/bendahara, /admin/users, /admin/masterlist/export. ROLE_LABELS + UserCreate/UserUpdate Literal + frontend (ROLE_BADGE, create-user select, edit radio, WalkinPage gate x2, AdminPage !isStaff fallback role-aware → tombol /walkin + /checkin).
- LOG LOGIN/LOGOUT: /api/admin/login catat action 'login' (+role). POST /api/admin/logout catat 'logout'. Semua halaman (admin/walkin/checkin) panggil /admin/logout saat "Keluar". Muncul di Log Aktivitas (ACTION labels login/logout ditambah).
- TESTING: testing_agent iteration_12 = backend 18/18 + frontend 100% PASS, no issues. Test file baru: /app/backend/tests/test_iter12_seller_export_users.py.
- HEALTH CHECK: deployment_agent = PASS, no blockers (build CI=true lolos, env & CORS OK, no hardcoded secret di production code).
- CODE REVIEW (non-blocking, TIDAK dikerjakan biar aman menjelang acara): AdminPage.js ~1960 baris & server.py ~1768 baris (bisa dipecah pasca-acara); /api/admin/logs belum paginasi (pertimbangkan TTL/index kalau log membengkak).
- User perlu REDEPLOY agar semua naik ke kbikepri.com.
## Update (15 Agu 2026, sesi lanjutan 2) — Order Manual, UI kanal, simpan tiket, No HP 08
- ORDER MANUAL (tab baru di samping VIP): pilih kursi (bebas), input nama+HP(opsional)+nominal, status Belum/Sudah Bayar; jika Sudah Bayar isi tgl transfer + nominal transfer + bukti(opsional). Editable & bisa hapus & tambah. Masuk Bendahara HANYA jika sudah bayar. Channel "manual" terpisah di Bendahara/Masterlist. Endpoint: GET/POST /admin/manual, PUT /admin/manual/{id}. Seat lock permanen.
- EDIT NOMINAL VERIFIED: admin 1x (flag amount_edited_once), Super Admin tanpa batas.
- MASTERLIST: dipindah dari tab jadi tombol khusus "Masterlist Pembelian" (terang) di atas panel; tab lama dihapus. Urutan tabel: VIP, Order Manual, Website(umum). Export per tabel (type=umum|vip|manual).
- KANAL/LABEL: umum→"Website", panitia→"Panitia", manual→"Manual — oleh {admin}", vip→"VIP". Header "Upload Bukti" disembunyikan di halaman admin; link publik header + judul halaman upload jadi "Cek Pesanan & Unggah Bukti Berdana".
- VERIFIKASI LIST: sort belum-verif/belum-upload di ATAS, verified di bawah; paginasi 20/halaman; tampil "oleh {verified_by||sold_by||created_by} · {tgl jam}" di bawah Payment OK.
- ORDER STATUS: bar aksi atas (semua status) — "Simpan Tiket (Gambar)" (canvas PNG) + "Tambah ke Kalender HP" (.ics). Warna tombol dibuat terang. Kotak nominal krem.
- NO HP WAJIB 08: normalize_phone di backend (8..→08.., 62..→08.., tolak invalid) di POST /orders; frontend auto-fix + hint. Super Admin bisa edit No HP: PUT /admin/orders/{id}/phone (tombol "Edit No HP" di dialog bukti).
- LOGIN/LOGOUT dicatat di Log. Role 'seller' (Petugas Penjual Tiket) walkin+checkin saja.
- TESTING: iteration_15 backend 6/6 + frontend 8/8 PASS, no issues. Code review: no blockers (advisories: split server.py pasca-acara, rotasi password default sebelum hari-H, whitelist CORS di produksi).
- CATATAN: isu PRODUKSI "Gagal memuat data acara" di kbikepri.com belum tuntas (khusus produksi; preview /api/event = 200). Perlu Redeploy + kemungkinan cek env produksi via Emergent Support.
- Semua perubahan perlu REDEPLOY agar naik ke produksi.

## Update (Jun 2026, sesi ini) — Migrasi Auth ke httpOnly Cookie (keamanan)
- KEAMANAN UTAMA: token login staff TIDAK lagi disimpan di localStorage. Sekarang backend set httpOnly cookie saat /api/admin/login, auth extractor baca cookie (+ fallback header X-Admin-Token untuk kompatibilitas), /api/admin/logout hapus cookie. Frontend apiClient.js pakai withCredentials, tidak persist token; hanya simpan `mbi_admin_user` (non-sensitif) untuk restore UI/role.
- REGRESI iteration_16 (frontend 60%): halaman Admin/Walkin/Checkin init authed dari token localStorage yang sudah tidak ada → login lagi setelah reload. FIX: initializer jadi useState(!!getAdminUser()) di AdminPage.js:1594 / WalkinPage.js:97 / CheckinPage.js:66. Hapus import ADMIN_TOKEN_KEY yg tak terpakai.
- TESTING iteration_17: backend 100% (7/7), frontend 100% (3/3 halaman staff persist setelah reload; logout bersih). retest_needed=false. Test file: /app/backend/tests/test_iter16_cookie_auth.py.
- Wording keamanan yg dipakai ke user: risiko utama pencurian token via JS berkurang; TIDAK ada situs yg bisa dijamin 100% kebal.
- Preview dikembalikan siap-publish: coming_soon = ON (semua sesi tetap tutup). User perlu REDEPLOY agar migrasi cookie naik ke kbikepri.com, lalu cek login di kbikepri.com/admin sekali.
- BACKLOG code-quality (pasca-acara, non-blocking): setAdminSession(token,user) masih terima+buang token (sederhanakan jadi setAdminSession(user)); pertimbangkan probe /api/admin/me saat mount 3 halaman staff; split server.py (~1950 baris) jadi routers.

## Update (Jun 2026 — Security Headers)
- User scan ssl.org security-headers di produksi: HSTS sudah ada; header lain "Missing" (CSP Critical, X-Frame-Options, COOP/COEP/CORP, Permissions-Policy, dll).
- BACKEND: tambah middleware `security_headers` (@app.middleware http) di server.py → semua /api response kini kirim X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy, X-Permitted-Cross-Domain-Policies: none, X-DNS-Prefetch-Control: off, Origin-Agent-Cluster: ?1, Cross-Origin-Opener-Policy: same-origin, Cross-Origin-Resource-Policy: same-site, Permissions-Policy. Terverifikasi via curl -I.
- FRONTEND: tambah `<meta http-equiv="Content-Security-Policy">` + `<meta name="referrer">` di index.html. CSP mengizinkan emergent scripts, posthog, google fonts, backend api, img https/data/blob; frame-ancestors 'none'; upgrade-insecure-requests. Diuji: login admin1 sukses, dashboard load penuh, 0 CSP violation.
- KETERBATASAN PENTING (jujur ke user): scanner membaca HTTP header di ROOT domain (hosting frontend statis Emergent). Header HTTP frontend (X-Frame-Options/COOP/COEP/CORP dst) TIDAK bisa di-set dari kode statis — hanya CSP via meta tag (proteksi browser nyata, tapi scanner mungkin tetap tandai header HTTP-nya "missing"). Untuk header HTTP di frontend perlu konfigurasi hosting/CDN Emergent → email support@emergent.sh.
- User perlu REDEPLOY agar perubahan naik ke kbikepri.com.

## Update (Jun 2026 — Code Review: perbaikan aman)
- Laporan code-quality (env f0dac3ac). Dikerjakan HANYA item aman & bernilai; refactor besar DITUNDA sampai pasca-acara (user setuju default: tunda) karena risiko regresi tinggi pada web LIVE.
- FIX 1 (Critical false-positive): `setAdminSession(user)` — hapus param `token` yg tak dipakai (apiClient.js) + update 3 pemanggil (AdminPage/WalkinPage/CheckinPage login). Token TIDAK pernah lagi menyentuh localStorage. Diuji: login walkin chelyn + reload → tetap authed (0 input password).
- FIX 2 (Critical test secret): test_iter16_cookie_auth.py — default password test via env `TEST_ADMIN_PASSWORD` (fallback admin123).
- DITUNDA (bukan bug, murni maintainability, risiko tinggi menjelang acara): (a) React hook deps useEffect/useCallback — menambah deps bisa memicu loop polling; (b) pecah AdminPage jadi 5 panel file + BookingPage/WalkinPage/OrderStatusPage; (c) refactor fungsi kompleks backend (export_orders, walkin_order, manual_order, admin_stats, create_order, dll); (d) SeatMap. => Kerjakan sebagai fase maintenance terkendali PASCA-ACARA + testing_agent penuh.

## Update (Jun 2026 — Edit Order Manual: upload bukti + konfirmasi hold kursi)
- FITUR: dialog Edit Order Manual kini punya field "Foto Bukti Transfer (opsional)" (data-testid `manual-edit-proof`) di bagian Sudah Bayar. State `editProof`; saveEdit kirim `proof_image` hanya bila ada file baru (kosong = bukti lama tidak diubah). Backend PUT /admin/manual/{id} + ManualUpdate.proof_image sudah mendukung sebelumnya (tidak diubah).
- KONFIRMASI (bukan bug): kursi Order Manual di-HOLD PERMANEN (seat_locks expires_at=None) sejak dibuat — baik BELUM maupun SUDAH bayar; hanya lepas saat order dihapus. Diverifikasi curl e2e: unpaid→kursi booked; edit→verified+bukti tersimpan; delete→kursi available lagi. Screenshot dialog edit menampilkan field upload.

## Update (Jun 2026 — VIP list/edit/hapus kursi + Manual lepas sebagian kursi)
- AKSES: fitur edit/hapus VIP & Manual untuk SEMUA Admin & Super Admin (chelyn & susanto[superadmin] otomatis termasuk). susanto belum dibuat (user tunda).
- BACKEND baru: GET /admin/vip (daftar), PUT /admin/vip/{id} (ubah nama/catatan + GANTI KURSI), DELETE /admin/vip/{id} & DELETE /admin/manual/{id} (require_staff = semua admin boleh hapus VIP/manual, TERPISAH dari DELETE /admin/orders yang tetap butuh superadmin/can_delete untuk order website). Helper `reconcile_seats()` kunci kursi baru + lepas kursi lama (rollback + 409 bila bentrok). ManualUpdate & update_manual kini terima `seats` (lepas SEBAGIAN kursi / tambah). VIPUpdate model baru.
- FRONTEND: helper `markEditableSeats()` (kursi milik order sendiri di-set available agar bisa di-toggle di peta). VIPPanel: tambah "Daftar Tiket VIP" + tombol Edit Kursi (dialog max-w-2xl berisi SeatMap + nama + catatan) + Hapus. ManualPanel: dialog Edit kini punya SeatMap (lepas/tambah kursi) selain field lama; tombol hapus pindah ke DELETE /admin/manual/{id}. Order website TIDAK muncul di tab Manual/VIP → aman tak bisa diedit/hapus dari sana.
- DIUJI curl e2e (admin1): VIP buat/list/edit(ganti kursi, kursi lama lepas)/hapus OK; Manual lepas sebagian kursi (kursi c lepas, a&b tetap) OK; admin2 (can_delete=false) BISA hapus manual via /admin/manual (200) tapi DITOLAK 403 di /admin/orders (proteksi order website utuh). Screenshot: dialog Edit VIP tampil peta kursi + kursi terpilih. Data uji dibersihkan.

## Update (Jun 2026 — Order manual BELUM BAYAR masuk Masterlist "Belum Berdana")
- Order manual belum bayar (status manual_unpaid) kini MUNCUL di Masterlist tabel Order Manual dengan badge status "Belum Berdana" (yg sudah = "Sudah Berdana"), agar total tiket terlihat. TIDAK menghitung uang Bendahara (grand_total & tickets Bendahara TIDAK berubah — diverifikasi).
- BACKEND: helper `_unpaid_manual_rows(from,to)` (bentuk row sama, paid=False). `/admin/bendahara` kini return field baru `unpaid_manual` (dipakai Masterlist saja; Bendahara panel abaikan). Recap row verified diberi `paid: True`. Export Masterlist manual (`/admin/masterlist/export?type=manual`) kini sertakan baris unpaid + kolom "Status"; TOTAL nominal hanya jumlah yg paid, TOTAL tiket termasuk unpaid.
- FRONTEND MasterlistPanel: state `unpaidManual`; manual list = [manual verified, ...unpaidManual]; tabel tambah kolom "Status" (Belum/Sudah Berdana). nCols manual 5→6.
- DIUJI curl: unpaid muncul di unpaid_manual (paid False, tickets 2, amount 90k); Bendahara money UNCHANGED; export manual 200. Screenshot: baris "Belum Berdana" tampil di Masterlist. Data uji dibersihkan.

## Update (Jun 2026 — Layar Monitor Pelanggan hari-H + webcam struk)
- KONSEP: 1 laptop, layar di-extend. 2 JENDELA browser sama: jendela panitia (/walkin) = kontrol; jendela monitor (/display) = tampilan pelanggan bersih. Sinkron via BroadcastChannel "kbi_walkin_display" (tanpa backend/internet tambahan).
- BARU: `/app/frontend/src/pages/DisplayPage.js` (route /display, standalone di App.js). Mode: idle (logo KBI + "Selamat Datang / Nonton Bareng"), selecting (peta kursi besar read-only + kursi terpilih live + sisa kursi), paying (nominal besar + QRIS scan / rekening transfer / cash), done (Terima Kasih + sesi + kursi). Mount kirim {type:'hello'} → panitia balas state terkini.
- WalkinPage: tombol "Buka Layar Monitor" (window.open /display) di top bar; toggle "Layar Monitor: Sambutan/Kursi/Pembayaran" (displayMode welcome→idle/selecting/paying); broadcast useEffect kirim {mode,sessionId/name/time,rows,couples,selected,method,amount,transfer,remaining} tiap state berubah; saat result ada → broadcast mode done; tutup result → balik selecting.
- WEBCAM: tombol "Foto Struk pakai Webcam" (getUserMedia video, dialog <video> + Jepret → canvas toDataURL 0.82 → setProof). Tetap ada opsi "Upload / Pilih File". Butuh HTTPS (ok di preview & prod) + izin kamera.
- DIUJI 2-jendela (Playwright same context): selecting mirror kursi M21/M20 ✓; paying mirror QRIS + Rp120.000 ✓; welcome→idle ✓; screenshot idle "Selamat Datang/Nonton Bareng" bagus. Webcam UI render (fungsi getUserMedia standar, perlu kamera nyata utk verifikasi penuh). Sesi walk-in uji dikembalikan tertutup.

## Update (Jun 2026 — Alur bayar terpandu walk-in + auto monitor + banner)
- ALUR /walkin dirombak terpandu: pilih kursi → nama+nominal → metode. CASH → tombol "Buat Tiket (LUNAS)" langsung → popup LUNAS. QRIS/TRANSFER → "Lanjut Bayar" → dialog pembayaran (QRIS di-scan / no rekening + nominal) → "Foto Struk pakai Webcam" (atau upload) → "Konfirmasi LUNAS" → tiket dibuat. Foto struk WAJIB sebelum konfirmasi (sesuai permintaan: QRIS/transfer dulu → webcam → baru nomor tiket).
- Popup sukses jadi gaya LUNAS: "LUNAS ✅" + Nomor Tiket (#order_no) + Jumlah Tiket + Sesi + Nomor Kursi (data-testid walkin-result-orderno/qty/session/seats). Instruksi pembayaran lama dihapus dari popup (bayar sudah sebelum tiket dibuat).
- MONITOR auto: default banner (welcome→idle); auto ke peta kursi saat panitia klik kursi/pilih sesi (toggle & session btn set displayMode selecting); paying saat dialog bayar; setelah klik OK di popup LUNAS → monitor balik banner (welcome). Toggle manual Sambutan/Kursi/Pembayaran tetap ada.
- PANITIA WAJIB PILIH SESI DULU: sessionId awal null → tampil prompt "Pilih Sesi Dulu" (data-testid walkin-pick-session), peta kursi tersembunyi & polling mati sampai sesi dipilih.
- BANNER MONITOR (idle) diganti: judul "Pesan & Beli Tiket di Sini" + "NOBAR FILM DOKUMENTER" + "ASHIN JINARAKKHITA" + "Minggu, 13 September 2026" + "CGV Grand Batam Mall" + daftar 4 sesi (Sesi 1–4 + jam) di bawah (data-testid display-idle-sessions).
- DIUJI 2-jendela: welcome default ✓; klik kursi→selecting ✓; CASH→LUNAS(#1626, 2 tiket)+monitor done→OK→welcome ✓; QRIS→dialog QRIS+monitor paying→upload proof→Konfirmasi LUNAS(#8971)→OK→welcome ✓; screenshot banner & prompt pilih-sesi bagus. Semua tiket uji dihapus (tickets kembali 31), semua sesi walk-in dikembalikan tertutup.

## Update (Jun 2026 — Poster di banner + logo di Terima Kasih + reset pilih sesi)
- Banner monitor idle kini tampilkan POSTER film (POSTER_URL) di kiri + info/sesi di kanan (layout 2 kolom). data-testid display-idle-poster. Screenshot bagus.
- Layar "Terima Kasih" (done, hijau) kini ada logo KBI di atas checkmark.
- Setelah panitia klik "Sudah Saya Serahkan" → sessionId di-reset null → panitia balik ke prompt "Pilih Sesi Dulu" (layar utama), monitor balik banner.

## Update (Jun 2026 — Kode unik walk-in QRIS/transfer + no tiket di layar bayar + monitor dikecilkan)
- KODE UNIK: backend memang sudah generate kode unik utk QRIS & transfer (gen_unique_total). Alur bayar dirombak agar order DIBUAT saat "Lanjut Bayar" (proof opsional) → dapat total_amount (incl kode unik), order_no, qty → baru tampil di layar bayar. Verified via test: base 100.000 → tampil Rp 100.095 (kode unik 095) → bisa cek mutasi.
- BACKEND: walkin_order proof jadi OPSIONAL utk qris/transfer. Tambah POST /admin/walkin/{id}/proof (attach struk setelah bayar) & DELETE /admin/walkin/{id} (cancel, require_walkin, lepas kursi). Model WalkinProof.
- FRONTEND: startPayment→doCreate (buat order dulu, proof null). Cash→langsung LUNAS. QRIS/transfer→pendingOrder+dialog bayar (tampil total incl kode unik + No.Tiket + qty + QRIS/rekening) → foto struk (webcam/upload) → confirmPayment (POST proof) → LUNAS. Batal/tutup dialog → cancelPayment (DELETE order, lepas kursi). Broadcast paying kirim orderNo+qty+total.
- MONITOR: layar paying tampilkan No.Tiket + jumlah tiket (data-testid display-pay-orderno/qty). Semua layar monitor diubah h-screen overflow-hidden + ukuran font/padding dikecilkan + seatmap tanpa scale → TIDAK perlu scroll (verified overflow=False).
- DIUJI 2-jendela: QRIS Rp100.095 + #6428 + 2 tiket tampil di dialog & monitor; monitor tanpa scroll; foto→Konfirmasi→LUNAS #6428; OK→panitia balik Pilih Sesi + monitor idle. Order uji dihapus, sesi walk-in ditutup. Catatan: ada data uji lama lain di preview (SS/a/aa/susanti/candi) belum dibersihkan (bukan dari sesi ini).

## Update (Jun 2026 — Ganti wording "Nonton Bersama" → "Film Dokumenter")
- Hapus "NOBAR/Nonton Bersama", pakai "Film Dokumenter" di semua tempat: BookingPage hero (coming-soon & aktif) "Film Dokumenter" → ASHIN JINARAKKHITA; DisplayPage banner monitor "FILM DOKUMENTER"; index.html meta description; AdminPage template WhatsApp; OrderStatusPage kalender .ics SUMMARY; CheckinPage badge. Diverifikasi screenshot halaman utama (Film Dokumenter tampil, Nonton Bersama hilang).
- Catatan: coming_soon di PREVIEW saat ini = False (OFF). Sebelumnya diset ON; kemungkinan diubah saat testing. Belum diflip balik (hindari override intent user).

## Update (Jun 2026 — Proteksi hapus pesanan TERVERIFIKASI)
- Pesanan online berstatus "verified" kini HANYA bisa dihapus Super Admin (admin utama). Admin biasa walau punya can_delete DITOLAK (403) — menghindari salah klik hapus data pembayaran yang sudah sah. Pesanan belum-verified (pending/expired/ditolak) tetap bisa dihapus oleh can_delete admin (perilaku lama).
- BACKEND delete_order (/admin/orders/{id}): cek status verified → wajib superadmin; else superadmin/can_delete. Pesan 403: "Pesanan sudah TERVERIFIKASI. Hanya Super Admin (admin utama) yang dapat menghapus." (delete_vip/delete_manual tidak berubah.)
- FRONTEND: helper canDeleteRow(o)=isSuper||(canDelete&&status!==verified). Baris verified untuk admin biasa tampil ikon Lock/"Super Admin" (bukan tombol hapus), mobile & desktop. Dialog konfirmasi hapus (deleteTarget) sudah ada sejak dulu (double-confirm). Import Lock ditambah.
- DIUJI: chelyn (admin+can_delete) DELETE verified → 403 + order tidak terhapus ✓; screenshot: 10 baris verified tampil gembok, baris pending tetap ada trash ✓.
