"use client";

import { useEffect, useState } from "react";

interface MenuQuota {
  id: string;
  nama: string;
  harga: number;
  kuotaDibuka: boolean;
  sisaKuota: number;
}

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function OrderPage() {
  const [tanggal, setTanggal] = useState(todayPlus(1));
  const [menus, setMenus] = useState<MenuQuota[]>([]);
  const [cutoffLewat, setCutoffLewat] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [nama, setNama] = useState("");
  const [telepon, setTelepon] = useState("");
  const [alamat, setAlamat] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadQuota() {
    const res = await fetch(`/api/menu-quota?tanggal=${tanggal}`);
    const data = await res.json();
    setMenus(data.menus ?? []);
    setCutoffLewat(!!data.cutoffLewat);
  }

  useEffect(() => {
    loadQuota();
    setCart({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tanggal]);

  function setQty(menuId: string, qty: number) {
    setCart((prev) => ({ ...prev, [menuId]: Math.max(0, qty) }));
  }

  const total = menus.reduce((sum, m) => sum + (cart[m.id] ?? 0) * m.harga, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    const items = Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([menuId, porsi]) => ({ menuId, porsi }));

    if (items.length === 0) {
      setError("Pilih minimal 1 menu");
      return;
    }
    if (!nama || !telepon || !alamat) {
      setError("Data pelanggan wajib diisi");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerNama: nama,
        customerTelepon: telepon,
        customerAlamat: alamat,
        tanggalKirim: tanggal,
        items,
      }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Gagal membuat order");
      await loadQuota();
      return;
    }

    setMessage("Order berhasil dibuat! Terima kasih.");
    setCart({});
    setNama("");
    setTelepon("");
    setAlamat("");
    await loadQuota();
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Pesan Nasi Box</h1>

      <div>
        <label className="text-sm font-medium">Tanggal Kirim</label>
        <input
          type="date"
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
          value={tanggal}
          min={todayPlus(0)}
          onChange={(e) => setTanggal(e.target.value)}
        />
        {cutoffLewat && (
          <p className="mt-1 text-sm text-red-600">
            Batas order (H-1 jam 20:00) untuk tanggal ini sudah lewat.
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          {menus.length === 0 && (
            <p className="text-sm text-slate-500">Belum ada menu untuk tanggal ini.</p>
          )}
          {menus.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4"
            >
              <div>
                <p className="font-medium">{m.nama}</p>
                <p className="text-sm text-slate-500">Rp{m.harga.toLocaleString("id-ID")}</p>
                <p className="text-xs text-slate-400">
                  {m.kuotaDibuka
                    ? `Sisa kuota: ${m.sisaKuota}`
                    : "Kuota belum dibuka untuk tanggal ini"}
                </p>
              </div>
              <input
                type="number"
                min={0}
                max={m.sisaKuota}
                disabled={!m.kuotaDibuka || m.sisaKuota === 0 || cutoffLewat}
                className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100"
                value={cart[m.id] ?? 0}
                onChange={(e) => setQty(m.id, parseInt(e.target.value) || 0)}
              />
            </div>
          ))}
        </div>

        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="font-medium">Data Pelanggan</h2>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="Nama"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
          />
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="Telepon"
            value={telepon}
            onChange={(e) => setTelepon(e.target.value)}
          />
          <textarea
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="Alamat"
            value={alamat}
            onChange={(e) => setAlamat(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="font-medium">Total: Rp{total.toLocaleString("id-ID")}</span>
          <button
            type="submit"
            disabled={submitting || cutoffLewat}
            className="rounded-md bg-slate-900 px-5 py-2 text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {submitting ? "Memproses..." : "Pesan"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-emerald-600">{message}</p>}
      </form>
    </main>
  );
}
