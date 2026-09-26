import { prisma } from "./prisma";
import { openQuota } from "./quota";
import { toDateOnly } from "./date";

/**
 * Membuka kuota untuk semua menu aktif pada satu tanggal sekaligus, memakai
 * `kuotaDefaultHarian` masing-masing menu sebagai kuota maksimal. Idempotent
 * (lihat `openQuota`) - aman dipanggil berulang tanpa mereset kuotaTerpakai.
 */
export async function openQuotaForAllActiveMenus(tanggal: Date) {
  const tgl = toDateOnly(tanggal);
  const menus = await prisma.menu.findMany({ where: { aktif: true } });
  const results = [];
  for (const menu of menus) {
    results.push(await openQuota(menu.id, tgl, menu.kuotaDefaultHarian));
  }
  return results;
}
