"use client";

import { useEffect, useState } from "react";

interface MenuQuotaRow {
  menuId: string;
  nama: string;
  kuotaDefaultHarian: number;
  kuotaDibuka: boolean;
  kuotaMaksimal: number | null;
  kuotaTerpakai: number;
}

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function BukaKuotaTab() {
  const [tanggal, setTanggal] = useState(todayPlus(1));
  const [rows, setRows] = useState<MenuQuotaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/admin/quota?tanggal=${tanggal}`);
    const data = await res.json();
    setRows(data.menus ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tanggal]);

  async function openAll() {
    setMessage("");
    await fetch("/api/admin/quota", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tanggal, mode: "all" }),
    });
    setMessage("Kuota semua menu aktif dibuka menggunakan kuota default masing-masing.");
    await load();
  }

  async function openOne(menuId: string, kuotaMaksimal: number) {
    setMessage("");
    await fetch("/api/admin/quota", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tanggal, menuId, kuotaMaksimal }),
    });
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div>
          <label className="text-sm font-medium">Tanggal</label>
          <input
            type="date"
            className="mt-1 block rounded-md border border-slate-300 px-3 py-2"
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value)}
          />
        </div>
        <button
          onClick={openAll}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
        >
          Buka Semua Menu (pakai kuota default)
        </button>
      </div>
      {message && <p className="text-sm text-emerald-600">{message}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">Memuat...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2">Menu</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Kuota Terpakai</th>
                <th className="px-4 py-2">Kuota Maksimal</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <QuotaRow key={row.menuId} row={row} onSave={openOne} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function QuotaRow({
  row,
  onSave,
}: {
  row: MenuQuotaRow;
  onSave: (menuId: string, kuotaMaksimal: number) => void;
}) {
  const [value, setValue] = useState(row.kuotaMaksimal ?? row.kuotaDefaultHarian);

  return (
    <tr className="border-t border-slate-100">
      <td className="px-4 py-2">{row.nama}</td>
      <td className="px-4 py-2">
        {row.kuotaDibuka ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
            Sudah dibuka
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
            Belum dibuka
          </span>
        )}
      </td>
      <td className="px-4 py-2">{row.kuotaTerpakai}</td>
      <td className="px-4 py-2">
        <input
          type="number"
          min={row.kuotaTerpakai}
          className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
          value={value}
          onChange={(e) => setValue(parseInt(e.target.value) || 0)}
        />
      </td>
      <td className="px-4 py-2 text-right">
        <button
          onClick={() => onSave(row.menuId, value)}
          className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100"
        >
          Simpan
        </button>
      </td>
    </tr>
  );
}
