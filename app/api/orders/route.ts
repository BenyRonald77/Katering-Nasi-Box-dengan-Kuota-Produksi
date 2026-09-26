import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { toDateOnly } from "@/lib/date";
import {
  createOrder,
  EmptyOrderError,
  MenuNotFoundError,
  CutoffPassedError,
} from "@/lib/order";
import { QuotaFullError, QuotaNotOpenError } from "@/lib/quota";

export async function GET(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tanggalParam = req.nextUrl.searchParams.get("tanggal");
  const orders = await prisma.order.findMany({
    where: tanggalParam ? { tanggalKirim: toDateOnly(tanggalParam) } : undefined,
    include: { customer: true, items: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ orders });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (
    !body?.customerNama ||
    !body?.customerTelepon ||
    !body?.customerAlamat ||
    !body?.tanggalKirim ||
    !Array.isArray(body?.items)
  ) {
    return NextResponse.json({ error: "Data order tidak lengkap" }, { status: 400 });
  }

  try {
    const order = await createOrder({
      customerNama: body.customerNama,
      customerTelepon: body.customerTelepon,
      customerAlamat: body.customerAlamat,
      tanggalKirim: body.tanggalKirim,
      items: body.items,
    });
    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    if (
      err instanceof EmptyOrderError ||
      err instanceof MenuNotFoundError ||
      err instanceof CutoffPassedError ||
      err instanceof QuotaFullError ||
      err instanceof QuotaNotOpenError
    ) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Gagal membuat order" }, { status: 500 });
  }
}
