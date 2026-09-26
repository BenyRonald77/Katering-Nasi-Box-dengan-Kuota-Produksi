import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { toDateOnly } from "@/lib/date";
import { openQuota } from "@/lib/quota";
import { openQuotaForAllActiveMenus } from "@/lib/openQuotaBulk";

export async function GET(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tanggalParam = req.nextUrl.searchParams.get("tanggal");
  if (!tanggalParam) {
    return NextResponse.json({ error: "Parameter tanggal wajib diisi" }, { status: 400 });
  }
  const tanggal = toDateOnly(tanggalParam);

  const menus = await prisma.menu.findMany({ where: { aktif: true }, orderBy: { nama: "asc" } });
  const quotas = await prisma.dailyQuota.findMany({ where: { tanggal } });
  const quotaMap = new Map(quotas.map((q) => [q.menuId, q]));

  const result = menus.map((menu) => ({
    menuId: menu.id,
    nama: menu.nama,
    kuotaDefaultHarian: menu.kuotaDefaultHarian,
    kuotaDibuka: !!quotaMap.get(menu.id),
    kuotaMaksimal: quotaMap.get(menu.id)?.kuotaMaksimal ?? null,
    kuotaTerpakai: quotaMap.get(menu.id)?.kuotaTerpakai ?? 0,
  }));

  return NextResponse.json({ tanggal: tanggalParam, menus: result });
}

export async function POST(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.tanggal) {
    return NextResponse.json({ error: "Parameter tanggal wajib diisi" }, { status: 400 });
  }
  const tanggal = toDateOnly(body.tanggal);

  if (body.mode === "all") {
    await openQuotaForAllActiveMenus(tanggal);
    return NextResponse.json({ ok: true });
  }

  if (!body.menuId || typeof body.kuotaMaksimal !== "number") {
    return NextResponse.json({ error: "menuId dan kuotaMaksimal wajib diisi" }, { status: 400 });
  }
  await openQuota(body.menuId, tanggal, body.kuotaMaksimal);
  return NextResponse.json({ ok: true });
}
