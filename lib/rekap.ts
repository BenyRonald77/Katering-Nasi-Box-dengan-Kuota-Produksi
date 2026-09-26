import { prisma } from "./prisma";
import { toDateOnly } from "./date";
import { ORDER_STATUS } from "./constants";

export interface RekapBahanBaku {
  bahanBakuId: string;
  nama: string;
  satuan: string;
  totalDibutuhkan: number;
}

/**
 * Menghitung rekap kebutuhan bahan baku on-demand (tidak disimpan permanen)
 * untuk rentang tanggal kirim [dari, sampai], HANYA dari order berstatus
 * DIPESAN (order yang dibatalkan tidak dihitung):
 *
 *   total_bahan_baku[bahanBakuId] = SUM per menu (
 *     total_porsi_terjual(menu, tanggal_dalam_rentang) x jumlahPerPorsi(menu, bahanBaku)
 *   )
 *
 * Karena resep (`ResepItem`) dibaca dari data TERBARU (bukan snapshot saat
 * order dibuat), rekap otomatis mengikuti resep terkini.
 */
export async function hitungRekapBelanja(dari: Date, sampai: Date): Promise<RekapBahanBaku[]> {
  const dariTgl = toDateOnly(dari);
  const sampaiTgl = toDateOnly(sampai);

  const orderItems = await prisma.orderItem.findMany({
    where: {
      order: {
        status: ORDER_STATUS.DIPESAN,
        tanggalKirim: { gte: dariTgl, lte: sampaiTgl },
      },
    },
    select: { menuId: true, porsi: true },
  });

  const porsiPerMenu = new Map<string, number>();
  for (const item of orderItems) {
    porsiPerMenu.set(item.menuId, (porsiPerMenu.get(item.menuId) ?? 0) + item.porsi);
  }

  if (porsiPerMenu.size === 0) return [];

  const resepItems = await prisma.resepItem.findMany({
    where: { menuId: { in: Array.from(porsiPerMenu.keys()) } },
    include: { bahanBaku: true },
  });

  const totals = new Map<string, RekapBahanBaku>();
  for (const resep of resepItems) {
    const totalPorsi = porsiPerMenu.get(resep.menuId) ?? 0;
    const kebutuhan = totalPorsi * resep.jumlahPerPorsi;
    const existing = totals.get(resep.bahanBakuId);
    if (existing) {
      existing.totalDibutuhkan += kebutuhan;
    } else {
      totals.set(resep.bahanBakuId, {
        bahanBakuId: resep.bahanBakuId,
        nama: resep.bahanBaku.nama,
        satuan: resep.bahanBaku.satuan,
        totalDibutuhkan: kebutuhan,
      });
    }
  }

  return Array.from(totals.values()).sort((a, b) => a.nama.localeCompare(b.nama));
}
