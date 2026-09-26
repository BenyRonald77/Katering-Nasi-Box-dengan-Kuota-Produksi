# PRD — Katering Nasi Box dengan Kuota Produksi

## 1. Latar Belakang & Tujuan

Aplikasi pemesanan katering nasi box harian dengan **kuota produksi per menu per
hari** yang harus dijaga ketat (tidak boleh overbooking), batas waktu order
H-1 (cutoff jam tertentu di hari sebelum tanggal kirim), dan rekap kebutuhan
bahan baku otomatis dari total pesanan yang masuk.

Tujuan utama:
- Pelanggan bisa memesan menu untuk tanggal kirim tertentu, dengan kuota yang
  ditampilkan live dan **tidak mungkin overshoot** walau banyak pesanan masuk
  bersamaan.
- Order ditolak jika melewati cutoff (H-1 jam tertentu, misal jam 20:00).
- Admin membuka kuota harian per menu (idempotent — tidak mereset kuota yang
  sudah terpakai).
- Admin bisa melihat rekap belanja bahan baku yang dihitung otomatis dari
  order yang masuk x resep tiap menu.

## 2. Aktor

- **Admin** — login, kelola bahan baku/menu/resep, buka kuota harian, lihat
  order masuk & rekap belanja.
- **Pelanggan** — tidak login, memesan lewat halaman publik `/order`.

## 3. Model Data (Prisma / SQLite)

```
Admin
  id, username (unique), passwordHash, createdAt

BahanBaku
  id, nama, satuan (contoh: gram, ml, pcs), createdAt, updatedAt

Menu
  id, nama, harga, kuotaDefaultHarian, aktif, createdAt, updatedAt

ResepItem
  id, menuId, bahanBakuId, jumlahPerPorsi   // kebutuhan bahan baku per 1 porsi menu

DailyQuota
  id, menuId, tanggal (date-only), kuotaMaksimal, kuotaTerpakai
  unique(menuId, tanggal)

Customer
  id, nama, telepon, alamat, createdAt

Order
  id, customerId, tanggalKirim (date-only), status (DIPESAN|DIBATALKAN),
  totalHarga, createdAt

OrderItem
  id, orderId, menuId, namaSnapshot, hargaSnapshot, porsi, subtotal
```

Kunci desain: `OrderItem` menyimpan snapshot nama & harga menu saat order
dibuat, sehingga perubahan harga menu di kemudian hari tidak mengubah nilai
order lama.

## 4. Kuota Produksi (Atomik, Anti-Overbooking)

Kuota dijaga dengan **satu statement UPDATE SQL** yang mengecek dan menulis
sekaligus (check-and-write dalam satu operasi atomik di level database, bukan
read-then-write dari aplikasi):

```sql
UPDATE DailyQuota
SET kuotaTerpakai = kuotaTerpakai + :n
WHERE menuId = :m AND tanggal = :t AND kuotaTerpakai + :n <= kuotaMaksimal
```

dieksekusi lewat `tx.$executeRaw` **di dalam** `prisma.$transaction` yang
membungkus **seluruh** `createOrder` — artinya jika order berisi beberapa
menu, semua menu harus berhasil dikurangi kuotanya, atau seluruh order
dibatalkan (all-or-nothing lintas menu dalam satu order). Jika
`$executeRaw` mengembalikan jumlah baris terdampak 0 untuk salah satu menu
(kuota tidak cukup), transaksi di-rollback dan order ditolak dengan pesan
kuota menu tersebut penuh.

Ini mencegah race condition: walau 10 pelanggan memesan menu dengan kuota
tersisa 5 secara bersamaan, database menjamin hanya total 5 porsi yang lolos
—karena kondisi `kuotaTerpakai + :n <= kuotaMaksimal` dievaluasi atomik oleh
mesin database pada saat UPDATE, bukan dibaca lebih dulu oleh Node.js lalu
ditulis belakangan (yang rentan race condition antar request paralel).

## 5. Cutoff H-1

- Setiap menu punya `tanggalKirim` yang dipilih pelanggan.
- Deadline order = **jam 20:00 pada tanggal (tanggalKirim - 1 hari)**.
- Validasi cutoff dilakukan **di server** (dalam fungsi `createOrder`,
  sebelum memulai transaksi kuota), bukan hanya di UI — supaya tidak bisa
  dilewati dengan memanipulasi request langsung ke API.
- Order yang mencoba dibuat setelah deadline ditolak dengan pesan error yang
  jelas.

## 6. Buka Kuota oleh Admin (Idempotent)

- Admin memilih tanggal + menu untuk dibuka kuotanya (atau "buka semua menu
  aktif" untuk tanggal tersebut sekaligus, memakai `kuotaDefaultHarian` per
  menu sebagai default kuota maksimal, bisa diedit).
- Operasi ini **upsert** berdasarkan `unique(menuId, tanggal)`:
  - Jika `DailyQuota` untuk kombinasi tersebut belum ada -> buat baru.
  - Jika sudah ada -> hanya update `kuotaMaksimal` (jika admin mengubahnya),
    **tidak pernah** mereset `kuotaTerpakai` yang sudah terpakai oleh order
    yang masuk.

## 7. Rekap Belanja Bahan Baku

- Dihitung on-demand (bukan disimpan permanen) untuk rentang tanggal kirim
  yang dipilih admin:
  ```
  total_bahan_baku[bahanBakuId] = SUM per menu (
    total_porsi_terjual(menu, tanggal) x jumlahPerPorsi(menu, bahanBaku)
  )
  ```
- `total_porsi_terjual` dihitung dari SUM `OrderItem.porsi` untuk order
  dengan status `DIPESAN` (order yang dibatalkan tidak dihitung) pada
  menu & tanggal terkait.
- Karena dihitung on-demand dari resep **terbaru**, jika admin mengubah resep
  setelah order masuk, rekap akan otomatis mengikuti resep baru (bahan baku
  yang dibeli mengikuti kebutuhan produksi aktual, bukan snapshot lama).

## 8. Verifikasi Wajib (dijalankan sebagai script terhadap database live)

1. **Kuota kecil (misal 5)**: 10 order konkuren memesan menu yang sama pada
   tanggal & kuota yang sama -> tepat 5 berhasil, 5 ditolak karena kuota
   penuh; `kuotaTerpakai` akhir tepat 5 (tidak overshoot, tidak race).
2. **Cutoff H-1**: order yang dibuat sebelum, tepat pada, dan setelah
   deadline (jam 20:00 H-1) diterima/ditolak dengan benar sesuai waktu
   simulasi.
3. **Rekap bahan baku**: beberapa order dengan kombinasi menu berbeda dibuat,
   rekap dihitung dan dicocokkan manual terhadap SUM(porsi x resep).

Hasil verifikasi didokumentasikan di README (termasuk bug yang ditemukan &
fix-nya).

## 9. Autentikasi

- Admin login via `/login` — JWT httpOnly cookie (bcryptjs + jsonwebtoken).
- `/dashboard/**` dan API mutasi admin memerlukan sesi valid.
- `/order` bersifat publik, tanpa login.

## 10. Halaman (UI)

- `/order` — publik: pilih tanggal kirim, lihat daftar menu dengan sisa
  kuota **live** (dan status "penuh" jika habis), tambah ke keranjang, isi
  data pelanggan, submit.
- `/login` — form login admin.
- `/dashboard` — admin, dengan tab:
  - **Buka Kuota** — pilih tanggal, atur kuota per menu, simpan (idempotent).
  - **Order Masuk** — daftar order per tanggal kirim.
  - **Rekap Belanja** — pilih rentang tanggal, tampilkan total bahan baku
    yang perlu dibeli.

## 11. Stack Teknis

- Next.js 14 (App Router) + TypeScript
- Prisma + SQLite (`DATABASE_URL="file:./dev.db?connection_limit=1&socket_timeout=20"`)
- Tailwind CSS
- Auth: bcryptjs + jsonwebtoken, JWT httpOnly cookie

## 12. Non-Goals

- Tidak ada pembayaran online (asumsi bayar di tempat/transfer manual).
- Tidak ada multi-cabang/multi-tenant.
- Tidak ada pengiriman/tracking kurir.
