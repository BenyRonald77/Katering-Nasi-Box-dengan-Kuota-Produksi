import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { toDateOnly } from "./date";

type TxClient = Prisma.TransactionClient;

/**
 * Admin membuka/menetapkan kuota harian untuk satu menu pada satu tanggal.
 * Idempotent: upsert berdasarkan unique(menuId, tanggal). Jika baris sudah
 * ada, HANYA `kuotaMaksimal` yang diperbarui - `kuotaTerpakai` yang sudah
 * terpakai oleh order yang masuk TIDAK PERNAH direset oleh operasi ini.
 */
export async function openQuota(menuId: string, tanggal: Date, kuotaMaksimal: number) {
  const tgl = toDateOnly(tanggal);
  return prisma.dailyQuota.upsert({
    where: { menuId_tanggal: { menuId, tanggal: tgl } },
    update: { kuotaMaksimal },
    create: { menuId, tanggal: tgl, kuotaMaksimal, kuotaTerpakai: 0 },
  });
}

export class QuotaNotOpenError extends Error {
  constructor(menuNama: string) {
    super(`Kuota untuk menu "${menuNama}" pada tanggal tersebut belum dibuka`);
  }
}

export class QuotaFullError extends Error {
  constructor(menuNama: string) {
    super(`Kuota untuk menu "${menuNama}" pada tanggal tersebut sudah penuh`);
  }
}

/**
 * Mengunci & mengurangi (menambah kuotaTerpakai) sisa kuota harian menu
 * secara ATOMIK dengan SATU statement UPDATE yang mengecek dan menulis
 * sekaligus:
 *
 *   UPDATE DailyQuota
 *   SET kuotaTerpakai = kuotaTerpakai + :n
 *   WHERE menuId = :m AND tanggal = :t AND kuotaTerpakai + :n <= kuotaMaksimal
 *
 * Kondisi `kuotaTerpakai + :n <= kuotaMaksimal` dievaluasi oleh mesin
 * database PADA SAAT UPDATE (bukan dibaca dulu oleh Node.js), sehingga aman
 * dari race condition: jika 10 request bersamaan mencoba mengurangi kuota
 * yang sama, database menjamin total yang berhasil tidak akan pernah
 * melebihi kuotaMaksimal.
 *
 * HARUS dipanggil dengan `tx` dari dalam `prisma.$transaction(...)` supaya
 * satu order dengan beberapa menu bersifat all-or-nothing.
 */
export async function reserveQuota(
  tx: TxClient,
  menuId: string,
  tanggal: Date,
  porsi: number,
  menuNama: string
) {
  const tgl = toDateOnly(tanggal);

  const existing = await tx.dailyQuota.findUnique({
    where: { menuId_tanggal: { menuId, tanggal: tgl } },
  });
  if (!existing) {
    throw new QuotaNotOpenError(menuNama);
  }

  const affected = await tx.$executeRaw`
    UPDATE DailyQuota
    SET kuotaTerpakai = kuotaTerpakai + ${porsi}
    WHERE menuId = ${menuId}
      AND tanggal = ${tgl}
      AND kuotaTerpakai + ${porsi} <= kuotaMaksimal
  `;

  if (affected === 0) {
    throw new QuotaFullError(menuNama);
  }
}

export { Prisma };
