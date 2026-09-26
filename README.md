# Katering Nasi Box dengan Kuota Produksi

Aplikasi pemesanan katering nasi box harian dengan kuota produksi per menu per
hari yang dijaga atomik (anti-overbooking), batas order H-1, dan rekap
kebutuhan bahan baku otomatis. Lihat PRD lengkap di [`docs/PRD.md`](docs/PRD.md).

## Stack

- Next.js 14 (App Router) + TypeScript
- Prisma 5 + SQLite (`file:./dev.db?connection_limit=1&socket_timeout=20`)
- Tailwind CSS
- Auth: bcryptjs + jsonwebtoken, JWT httpOnly cookie

## Menjalankan Secara Lokal

```bash
npm install
cp .env.example .env
npx prisma migrate deploy
npm run seed             # admin (admin/admin123) + 2 menu contoh + resep
npm run dev
```

- `/order` — publik, pesan nasi box
- `/login` — login admin (`admin` / `admin123`)
- `/dashboard` — Buka Kuota, Order Masuk, Rekap Belanja

## Arsitektur & Keputusan Desain Penting

### 1. Kuota produksi atomik (anti-overbooking)

Inti dari aplikasi ini ada di `lib/quota.ts` — fungsi `reserveQuota` mengunci
sisa kuota dengan **satu statement UPDATE** yang mengecek dan menulis
sekaligus:

```sql
UPDATE DailyQuota
SET kuotaTerpakai = kuotaTerpakai + :n
WHERE menuId = :m AND tanggal = :t AND kuotaTerpakai + :n <= kuotaMaksimal
```

dijalankan lewat `tx.$executeRaw` **di dalam** `prisma.$transaction` yang
membungkus seluruh `createOrder` (`lib/order.ts`). Kondisi
`kuotaTerpakai + :n <= kuotaMaksimal` dievaluasi oleh database pada saat
UPDATE itu sendiri — bukan hasil pembacaan `SELECT` sebelumnya yang bisa basi
saat request lain menyelinap di antaranya. Jika baris terdampak (`affected
rows`) adalah 0, berarti kuota tidak cukup, dan `reserveQuota` melempar
`QuotaFullError` yang membuat seluruh transaksi (termasuk penulisan order
menu lain dalam order yang sama) di-rollback — **all-or-nothing** lintas
menu dalam satu order.

### 2. Cutoff H-1 divalidasi di server

`createOrder` menghitung `deadline = tanggal(tanggalKirim - 1 hari) jam
20:00 WIB` (`lib/date.ts: orderDeadline`) dan menolak order yang dibuat
setelah deadline **sebelum** transaksi kuota dimulai. Validasi ini murni di
server sehingga tidak bisa dilewati dengan memanggil API langsung tanpa
lewat UI.

### 3. Buka kuota idempotent

`openQuota` (`lib/quota.ts`) memakai `upsert` berdasarkan
`unique(menuId, tanggal)`. Jika baris sudah ada, **hanya** `kuotaMaksimal`
yang diperbarui; `kuotaTerpakai` yang sudah terpakai oleh order yang masuk
tidak pernah direset. Ini penting supaya admin bisa menekan "Buka Semua
Menu" berkali-kali tanpa risiko mengembalikan/menghilangkan kuota yang
sudah terpakai pelanggan.

### 4. Rekap belanja bahan baku on-demand

`hitungRekapBelanja` (`lib/rekap.ts`) menjumlahkan porsi terjual (order
berstatus `DIPESAN`, order dibatalkan diabaikan) per menu dalam rentang
tanggal, lalu mengalikannya dengan `ResepItem.jumlahPerPorsi` **terbaru**
dari database — bukan snapshot. Artinya kalau resep menu diubah admin
setelah order masuk, rekap belanja otomatis mengikuti resep yang baru
(sesuai kebutuhan produksi aktual).

### 5. Snapshot harga

`OrderItem.namaSnapshot` dan `hargaSnapshot` disalin dari `Menu` saat order
dibuat, supaya perubahan harga menu di kemudian hari tidak mengubah nilai
order lama.

## Verifikasi Konkurensi (dijalankan terhadap database live)

Dijalankan dengan `npm run verify:concurrency`
(`scripts/verify-concurrency.ts`) — memanggil `lib/order.ts`, `lib/quota.ts`,
`lib/rekap.ts` yang hit SQLite `dev.db` sungguhan.

```
=== Verifikasi Konkurensi Katering Nasi Box (database live) ===

[Skenario 1] Kuota kecil (5), 10 order konkuren pada menu+tanggal yang sama
  -> sukses: 5, gagal: 5 (kuota penuh: 5)
  PASS - Tepat 5 dari 10 order berhasil (sesuai kuota maksimal)
  PASS - 5 order lainnya ditolak dengan QuotaFullError
  PASS - kuotaTerpakai akhir tepat 5 (tidak overshoot, kuotaMaksimal=5)

[Skenario 2] Validasi cutoff H-1 jam 20:00
  PASS - Order 1 jam sebelum deadline (H-1 jam 20:00) DITERIMA
  PASS - Order 1 menit setelah deadline (H-1 jam 20:00) DITOLAK dengan CutoffPassedError
  PASS - Order 1 detik sebelum deadline tepat DITERIMA (batas belum lewat)

[Skenario 3] Rekap belanja bahan baku dari kombinasi order berbeda
  PASS - Rekap bahan baku "Beras" = 1150 gram (manual: 1150)

=== Hasil: 7 PASS, 0 FAIL ===
```

Script ini aman dijalankan berulang kali (idempotent) — lihat bagian "Bug
Ditemukan & Diperbaiki" di bawah.

## Verifikasi UI (Playwright, browser Chromium sungguhan)

Dijalankan dengan `node scripts/e2e-playwright.js` terhadap `npm run dev` di
`localhost:3000`:

```
[1] Login admin & buka kuota untuk besok
  PASS - Berhasil login admin dan redirect ke /dashboard
  PASS - Kuota berhasil dibuka untuk semua menu aktif pada tanggal besok
[2] Logout, buka /order publik, cek sisa kuota live
  PASS - Halaman /order menampilkan sisa kuota live untuk tanggal yang dipilih
[3] Buat order (pilih 2 porsi menu pertama)
  PASS - Order berhasil dibuat lewat halaman publik /order
[4] Login lagi, cek tab Order Masuk & Rekap Belanja
  PASS - Order yang baru dibuat muncul di tab Order Masuk admin
  PASS - Tab Rekap Belanja menampilkan hasil kebutuhan bahan baku

=== Hasil E2E: 6 PASS, 0 FAIL ===
```

`npm run build` (production build) juga sukses tanpa error TypeScript/ESLint.

## Bug yang Ditemukan & Diperbaiki Selama Development

1. **Script verifikasi konkurensi tidak idempotent saat dijalankan
   berulang** — Skenario 1 & 3 memakai ID menu tetap (`verify-menu-a/b`)
   dan tanggal relatif terhadap hari ini, sehingga menjalankan
   `verify-concurrency.ts` dua kali pada hari yang sama menghasilkan
   `kuotaTerpakai` yang sudah terisi dari run sebelumnya (ini justru
   **membuktikan** `openQuota` bekerja benar - sengaja tidak mereset
   `kuotaTerpakai`), yang membuat asersi run kedua salah (0 dari 10 order
   sukses, rekap dobel). **Diagnosis**: bukan bug di aplikasi, tapi script
   uji yang berasumsi kondisi awal selalu bersih. **Fix**: menambahkan
   `cleanupPreviousRun()` di awal `main()` yang menghapus order/kuota milik
   ID menu verifikasi sebelum setiap run, sehingga script aman dijalankan
   berulang kali.
2. **`create-next-app` menimpa `.gitignore` kustom** — sama seperti proyek
   Laundry, scaffold menulis ulang `.gitignore` default yang tidak
   mengecualikan `.env` biasa atau `prisma/dev.db`. Ditemukan dari
   `git status --short` sebelum commit pertama, diperbaiki dengan
   menambahkan kembali aturan yang dibutuhkan.
3. **Flaky end-to-end test karena `waitForTimeout` tetap** — versi awal
   `scripts/e2e-playwright.js` memakai delay tetap (800ms) sebelum membaca
   konten halaman setelah navigasi/klik. Saat dijalankan berulang kali,
   salah satu langkah (cek order muncul di tab "Order Masuk") kadang gagal
   karena data belum sempat termuat. **Fix**: mengganti semua
   `waitForTimeout` di titik pemeriksaan hasil dengan
   `page.waitForFunction(...)` yang menunggu konten yang diharapkan benar-
   benar muncul di DOM (dengan timeout 8 detik), bukan menunggu waktu
   tetap. Setelah fix, test stabil lolos berkali-kali berturut-turut.

## Struktur Model Data

Lihat `prisma/schema.prisma` — `Admin`, `BahanBaku`, `Menu`, `ResepItem`,
`DailyQuota`, `Customer`, `Order`, `OrderItem`.

## Login Default (development/seed)

- Username: `admin`
- Password: `admin123`

Ganti kredensial ini sebelum deploy ke production.
