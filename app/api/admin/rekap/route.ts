import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { hitungRekapBelanja } from "@/lib/rekap";
import { toDateOnly } from "@/lib/date";

export async function GET(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dari = req.nextUrl.searchParams.get("dari");
  const sampai = req.nextUrl.searchParams.get("sampai");
  if (!dari || !sampai) {
    return NextResponse.json({ error: "Parameter dari dan sampai wajib diisi" }, { status: 400 });
  }

  const rekap = await hitungRekapBelanja(toDateOnly(dari), toDateOnly(sampai));
  return NextResponse.json({ rekap });
}
