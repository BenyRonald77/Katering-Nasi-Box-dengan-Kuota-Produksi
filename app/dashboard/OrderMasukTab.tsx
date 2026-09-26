"use client";

import { useEffect, useState } from "react";

interface OrderRow {
  id: string;
  tanggalKirim: string;
  status: string;
  totalHarga: number;
  createdAt: string;
  customer: { nama: string; telepon: string; alamat: string };
  items: { namaSnapshot: string; porsi: number; subtotal: number }[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function OrderMasukTab() {
  const [tanggal, setTanggal] = useState(today());
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/orders?tanggal=${tanggal}`);
    const data = await res.json();
    setOrders(data.orders ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tanggal]);

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">Tanggal Kirim</label>
        <input
          type="date"
          className="mt-1 block rounded-md border border-slate-300 px-3 py-2"
          value={tanggal}
          onChange={(e) => setTanggal(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Memuat...</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-slate-500">Belum ada order untuk tanggal ini.</p>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex justify-between">
                <div>
                  <p className="font-medium">{o.customer.nama}</p>
                  <p className="text-sm text-slate-500">
                    {o.customer.telepon} - {o.customer.alamat}
                  </p>
                </div>
                <div className="text-right">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{o.status}</span>
                  <p className="mt-1 font-medium">Rp{o.totalHarga.toLocaleString("id-ID")}</p>
                </div>
              </div>
              <ul className="mt-2 space-y-0.5 text-sm text-slate-600">
                {o.items.map((it, idx) => (
                  <li key={idx}>
                    {it.namaSnapshot} x{it.porsi} = Rp{it.subtotal.toLocaleString("id-ID")}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
