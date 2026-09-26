import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 10);
  await prisma.admin.upsert({
    where: { username: "admin" },
    update: {},
    create: { username: "admin", passwordHash },
  });

  const beras = await upsertBahanBaku("Beras", "gram");
  const ayam = await upsertBahanBaku("Ayam", "gram");
  const tempe = await upsertBahanBaku("Tempe", "pcs");
  const sayur = await upsertBahanBaku("Sayur", "gram");
  const kotak = await upsertBahanBaku("Kotak Nasi", "pcs");

  const nasiAyam = await upsertMenu("Nasi Box Ayam Goreng", 18000, 50);
  const nasiTempe = await upsertMenu("Nasi Box Tempe Sayur", 14000, 30);

  await upsertResep(nasiAyam.id, beras.id, 150);
  await upsertResep(nasiAyam.id, ayam.id, 120);
  await upsertResep(nasiAyam.id, sayur.id, 50);
  await upsertResep(nasiAyam.id, kotak.id, 1);

  await upsertResep(nasiTempe.id, beras.id, 150);
  await upsertResep(nasiTempe.id, tempe.id, 2);
  await upsertResep(nasiTempe.id, sayur.id, 80);
  await upsertResep(nasiTempe.id, kotak.id, 1);

  console.log("Seed selesai. Login admin: admin / admin123");
}

async function upsertBahanBaku(nama: string, satuan: string) {
  const existing = await prisma.bahanBaku.findFirst({ where: { nama } });
  if (existing) return existing;
  return prisma.bahanBaku.create({ data: { nama, satuan } });
}

async function upsertMenu(nama: string, harga: number, kuotaDefaultHarian: number) {
  const existing = await prisma.menu.findFirst({ where: { nama } });
  if (existing) return existing;
  return prisma.menu.create({ data: { nama, harga, kuotaDefaultHarian } });
}

async function upsertResep(menuId: string, bahanBakuId: string, jumlahPerPorsi: number) {
  const existing = await prisma.resepItem.findUnique({
    where: { menuId_bahanBakuId: { menuId, bahanBakuId } },
  });
  if (existing) return existing;
  return prisma.resepItem.create({ data: { menuId, bahanBakuId, jumlahPerPorsi } });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
