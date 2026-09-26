import { prisma } from "./prisma";
import { toDateOnly, isPastDeadline, orderDeadline } from "./date";
import { reserveQuota } from "./quota";
import { ORDER_STATUS } from "./constants";

interface OrderItemInput {
  menuId: string;
  porsi: number;
}

interface CreateOrderInput {
  customerNama: string;
  customerTelepon: string;
  customerAlamat: string;
  tanggalKirim: string | Date;
  items: OrderItemInput[];
  /** Hanya untuk testing cutoff - default waktu sungguhan (new Date()) */
  now?: Date;
}

export class EmptyOrderError extends Error {
  constructor() {
    super("Order harus memiliki minimal 1 item menu");
  }
}

export class MenuNotFoundError extends Error {
  constructor(id: string) {
    super(`Menu ${id} tidak ditemukan atau tidak aktif`);
  }
}

export class CutoffPassedError extends Error {
  constructor(deadline: Date) {
    super(
      `Order untuk tanggal kirim ini sudah ditutup. Batas order adalah ${deadline.toISOString()} (H-1 jam 20:00)`
    );
  }
}

/**
 * Membuat order baru.
 *
 * 1. Validasi cutoff H-1 di server (tidak bisa dilewati lewat manipulasi UI).
 * 2. Semua reservasi kuota per menu dijalankan di dalam SATU
 *    `prisma.$transaction`, memakai `reserveQuota` (atomic conditional
 *    UPDATE). Jika salah satu menu kuotanya penuh, seluruh transaksi
 *    di-rollback -> order bersifat all-or-nothing lintas menu.
 * 3. Harga dihitung & di-snapshot di server dari `Menu.harga` saat ini.
 */
export async function createOrder(input: CreateOrderInput) {
  if (!input.items || input.items.length === 0) {
    throw new EmptyOrderError();
  }

  const tanggalKirim = toDateOnly(input.tanggalKirim);

  if (isPastDeadline(tanggalKirim, input.now ?? new Date())) {
    throw new CutoffPassedError(orderDeadline(tanggalKirim));
  }

  const menuIds = Array.from(new Set(input.items.map((i) => i.menuId)));
  const menus = await prisma.menu.findMany({ where: { id: { in: menuIds }, aktif: true } });
  const menuMap = new Map(menus.map((m) => [m.id, m]));

  for (const id of menuIds) {
    if (!menuMap.has(id)) throw new MenuNotFoundError(id);
  }

  const itemsWithSubtotal = input.items.map((item) => {
    const menu = menuMap.get(item.menuId)!;
    const subtotal = menu.harga * item.porsi;
    return {
      menuId: menu.id,
      namaSnapshot: menu.nama,
      hargaSnapshot: menu.harga,
      porsi: item.porsi,
      subtotal,
    };
  });

  const totalHarga = itemsWithSubtotal.reduce((sum, i) => sum + i.subtotal, 0);

  const order = await prisma.$transaction(
    async (tx) => {
      for (const item of input.items) {
        const menu = menuMap.get(item.menuId)!;
        await reserveQuota(tx, item.menuId, tanggalKirim, item.porsi, menu.nama);
      }

      const customer = await tx.customer.create({
        data: {
          nama: input.customerNama,
          telepon: input.customerTelepon,
          alamat: input.customerAlamat,
        },
      });

      return tx.order.create({
        data: {
          customerId: customer.id,
          tanggalKirim,
          status: ORDER_STATUS.DIPESAN,
          totalHarga,
          items: { create: itemsWithSubtotal },
        },
        include: { items: true, customer: true },
      });
    },
    { maxWait: 15000, timeout: 15000 }
  );

  return order;
}
