/**
 * Script verifikasi konkurensi terhadap DATABASE LIVE (SQLite dev.db).
 * Jalankan: npm run verify:concurrency
 */
import { prisma } from "../lib/prisma";
import { createOrder, CutoffPassedError } from "../lib/order";
import { openQuota, QuotaFullError } from "../lib/quota";
import { hitungRekapBelanja } from "../lib/rekap";
import { toDateOnly, addDays } from "../lib/date";

let pass = 0;
let fail = 0;
function ok(desc: string) {
  pass++;
  console.log(`  PASS - ${desc}`);
}
function bad(desc: string) {
  fail++;
  console.log(`  FAIL - ${desc}`);
}

/**
 * Bersihkan data sisa dari run verifikasi sebelumnya supaya script ini aman
 * dijalankan berulang kali. Catatan: ini BUKAN reset produksi - `openQuota`
 * di aplikasi memang SENGAJA tidak pernah mereset `kuotaTerpakai` (lihat
 * lib/quota.ts). Reset di sini hanya untuk membuat setiap run verifikasi
 * mulai dari kondisi bersih yang sama.
 */
async function cleanupPreviousRun() {
  const verifyMenuIds = ["verify-menu-a", "verify-menu-b"];
  const orders = await prisma.order.findMany({
    where: { items: { some: { menuId: { in: verifyMenuIds } } } },
    select: { id: true, customerId: true },
  });
  const orderIds = orders.map((o) => o.id);
  const customerIds = orders.map((o) => o.customerId);

  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  await prisma.dailyQuota.deleteMany({ where: { menuId: { in: verifyMenuIds } } });
}

async function ensureMenuAndBahan() {
  const bahan = await prisma.bahanBaku.upsert({
    where: { id: "verify-bahan-beras" },
    update: {},
    create: { id: "verify-bahan-beras", nama: "[verify] Beras", satuan: "gram" },
  });
  const menuA = await prisma.menu.upsert({
    where: { id: "verify-menu-a" },
    update: { harga: 15000, aktif: true },
    create: { id: "verify-menu-a", nama: "[verify] Nasi A", harga: 15000, kuotaDefaultHarian: 100 },
  });
  const menuB = await prisma.menu.upsert({
    where: { id: "verify-menu-b" },
    update: { harga: 12000, aktif: true },
    create: { id: "verify-menu-b", nama: "[verify] Nasi B", harga: 12000, kuotaDefaultHarian: 100 },
  });
  await prisma.resepItem.upsert({
    where: { menuId_bahanBakuId: { menuId: menuA.id, bahanBakuId: bahan.id } },
    update: { jumlahPerPorsi: 150 },
    create: { menuId: menuA.id, bahanBakuId: bahan.id, jumlahPerPorsi: 150 },
  });
  await prisma.resepItem.upsert({
    where: { menuId_bahanBakuId: { menuId: menuB.id, bahanBakuId: bahan.id } },
    update: { jumlahPerPorsi: 100 },
    create: { menuId: menuB.id, bahanBakuId: bahan.id, jumlahPerPorsi: 100 },
  });
  return { bahan, menuA, menuB };
}

async function scenario1_quotaRace() {
  console.log("\n[Skenario 1] Kuota kecil (5), 10 order konkuren pada menu+tanggal yang sama");
  const { menuA } = await ensureMenuAndBahan();
  const tanggal = toDateOnly(addDays(new Date(), 10)); // jauh di depan, pasti sebelum cutoff
  await openQuota(menuA.id, tanggal, 5);

  const results = await Promise.allSettled(
    Array.from({ length: 10 }).map((_, i) =>
      createOrder({
        customerNama: `Verify Quota ${i}`,
        customerTelepon: "08120000000" + i,
        customerAlamat: "Jl. Verifikasi No. 1",
        tanggalKirim: tanggal,
        items: [{ menuId: menuA.id, porsi: 1 }],
      })
    )
  );

  const succeeded = results.filter((r) => r.status === "fulfilled");
  const failed = results.filter((r) => r.status === "rejected");
  const quotaFullFails = failed.filter(
    (r) => r.status === "rejected" && r.reason instanceof QuotaFullError
  );

  console.log(`  -> sukses: ${succeeded.length}, gagal: ${failed.length} (kuota penuh: ${quotaFullFails.length})`);

  if (succeeded.length === 5) ok("Tepat 5 dari 10 order berhasil (sesuai kuota maksimal)");
  else bad(`Diharapkan 5 order sukses, didapat ${succeeded.length}`);

  if (failed.length === 5 && quotaFullFails.length === 5) {
    ok("5 order lainnya ditolak dengan QuotaFullError");
  } else {
    bad(`Diharapkan 5 gagal dgn QuotaFullError, didapat ${failed.length} gagal (${quotaFullFails.length} quota full)`);
  }

  const finalQuota = await prisma.dailyQuota.findUniqueOrThrow({
    where: { menuId_tanggal: { menuId: menuA.id, tanggal } },
  });
  if (finalQuota.kuotaTerpakai === 5) {
    ok(`kuotaTerpakai akhir tepat 5 (tidak overshoot, kuotaMaksimal=${finalQuota.kuotaMaksimal})`);
  } else {
    bad(`kuotaTerpakai akhir = ${finalQuota.kuotaTerpakai}, diharapkan 5`);
  }
}

async function scenario2_cutoff() {
  console.log("\n[Skenario 2] Validasi cutoff H-1 jam 20:00");
  const { menuA } = await ensureMenuAndBahan();

  // tanggalKirim besok; deadline = hari ini jam 20:00 WIB = 13:00 UTC
  const besok = addDays(toDateOnly(new Date()), 1);
  const deadlineUtc = new Date(besok);
  deadlineUtc.setUTCDate(deadlineUtc.getUTCDate() - 1);
  deadlineUtc.setUTCHours(13, 0, 0, 0);

  const sebelumDeadline = new Date(deadlineUtc.getTime() - 60 * 60 * 1000); // -1 jam
  const setelahDeadline = new Date(deadlineUtc.getTime() + 60 * 1000); // +1 menit
  await openQuota(menuA.id, besok, 100);

  try {
    await createOrder({
      customerNama: "Verify Cutoff Sebelum",
      customerTelepon: "081200001111",
      customerAlamat: "Jl. Cutoff",
      tanggalKirim: besok,
      items: [{ menuId: menuA.id, porsi: 1 }],
      now: sebelumDeadline,
    });
    ok("Order 1 jam sebelum deadline (H-1 jam 20:00) DITERIMA");
  } catch (e) {
    bad(`Order sebelum deadline seharusnya diterima, malah error: ${(e as Error).message}`);
  }

  try {
    await createOrder({
      customerNama: "Verify Cutoff Setelah",
      customerTelepon: "081200002222",
      customerAlamat: "Jl. Cutoff",
      tanggalKirim: besok,
      items: [{ menuId: menuA.id, porsi: 1 }],
      now: setelahDeadline,
    });
    bad("Order 1 menit setelah deadline seharusnya DITOLAK, malah diterima");
  } catch (e) {
    if (e instanceof CutoffPassedError) {
      ok("Order 1 menit setelah deadline (H-1 jam 20:00) DITOLAK dengan CutoffPassedError");
    } else {
      bad(`Order setelah deadline gagal, tapi bukan CutoffPassedError: ${(e as Error).message}`);
    }
  }

  try {
    await createOrder({
      customerNama: "Verify Cutoff Tepat",
      customerTelepon: "081200003333",
      customerAlamat: "Jl. Cutoff",
      tanggalKirim: besok,
      items: [{ menuId: menuA.id, porsi: 1 }],
      now: new Date(deadlineUtc.getTime() - 1000), // 1 detik sebelum deadline tepat
    });
    ok("Order 1 detik sebelum deadline tepat DITERIMA (batas belum lewat)");
  } catch (e) {
    bad(`Order tepat sebelum deadline seharusnya diterima: ${(e as Error).message}`);
  }
}

async function scenario3_rekapBelanja() {
  console.log("\n[Skenario 3] Rekap belanja bahan baku dari kombinasi order berbeda");
  const { bahan, menuA, menuB } = await ensureMenuAndBahan();
  const tanggal = toDateOnly(addDays(new Date(), 20));
  await openQuota(menuA.id, tanggal, 100);
  await openQuota(menuB.id, tanggal, 100);

  await createOrder({
    customerNama: "Rekap 1",
    customerTelepon: "081200004444",
    customerAlamat: "Jl. Rekap",
    tanggalKirim: tanggal,
    items: [{ menuId: menuA.id, porsi: 3 }],
  });
  await createOrder({
    customerNama: "Rekap 2",
    customerTelepon: "081200005555",
    customerAlamat: "Jl. Rekap",
    tanggalKirim: tanggal,
    items: [
      { menuId: menuA.id, porsi: 2 },
      { menuId: menuB.id, porsi: 4 },
    ],
  });

  const rekap = await hitungRekapBelanja(tanggal, tanggal);
  const berasRekap = rekap.find((r) => r.bahanBakuId === bahan.id);

  // manual: menuA total porsi = 3+2=5 x 150 = 750; menuB total porsi=4 x 100=400; total=1150
  const expected = 5 * 150 + 4 * 100;
  if (berasRekap && berasRekap.totalDibutuhkan === expected) {
    ok(`Rekap bahan baku "Beras" = ${berasRekap.totalDibutuhkan} gram (manual: ${expected})`);
  } else {
    bad(`Rekap salah: got ${berasRekap?.totalDibutuhkan}, expected ${expected}`);
  }
}

async function main() {
  console.log("=== Verifikasi Konkurensi Katering Nasi Box (database live) ===");
  await cleanupPreviousRun();
  await scenario1_quotaRace();
  await scenario2_cutoff();
  await scenario3_rekapBelanja();

  console.log(`\n=== Hasil: ${pass} PASS, ${fail} FAIL ===`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("Verifikasi crash:", e);
  await prisma.$disconnect();
  process.exit(1);
});
