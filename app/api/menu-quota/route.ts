import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toDateOnly, isPastDeadline } from "@/lib/date";

/**
 * Publik: daftar menu aktif beserta sisa kuota untuk tanggal kirim tertentu.
 * Dipakai halaman /order untuk menampilkan sisa kuota LIVE.
 */
export async function GET(req: NextRequest) {
  const tanggalParam = req.nextUrl.searchParams.get("tanggal");
  if (!tanggalParam) {
    return NextResponse.json({ error: "Parameter tanggal wajib diisi" }, { status: 400 });
  }
  const tanggal = toDateOnly(tanggalParam);

  const menus = await prisma.menu.findMany({ where: { aktif: true }, orderBy: { nama: "asc" } });
  const quotas = await prisma.dailyQuota.findMany({ where: { tanggal } });
  const quotaMap = new Map(quotas.map((q) => [q.menuId, q]));

  const result = menus.map((menu) => {
    const quota = quotaMap.get(menu.id);
    const sisa = quota ? quota.kuotaMaksimal - quota.kuotaTerpakai : 0;
    return {
      id: menu.id,
      nama: menu.nama,
      harga: menu.harga,
      kuotaDibuka: !!quota,
      sisaKuota: quota ? Math.max(sisa, 0) : 0,
    };
  });

  return NextResponse.json({
    tanggal: tanggalParam,
    cutoffLewat: isPastDeadline(tanggal),
    menus: result,
  });
}
