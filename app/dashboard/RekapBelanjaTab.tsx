"use client";

import { useState } from "react";

interface RekapRow {
  bahanBakuId: string;
  nama: string;
  satuan: string;
  totalDibutuhkan: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function RekapBelanjaTab() {
  const [dari, setDari] = useState(today());
  const [sampai, setSampai] = useState(todayPlus(7));
  const [rekap, setRekap] = useState<RekapRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleFetch() {
    setLoading(true);
    const res = await fetch(`/api/admin/rekap?dari=${dari}&sampai=${sampai}`);
    const data = await res.json();
    setRekap(data.rekap ?? []);
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div>
          <label className="text-sm font-medium">Dari</label>
          <input
            type="date"
            className="mt-1 block rounded-md border border-slate-300 px-3 py-2"
            value={dari}
            onChange={(e) => setDari(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Sampai</label>
          <input
            type="date"
            className="mt-1 block rounded-md border border-slate-300 px-3 py-2"
            value={sampai}
            onChange={(e) => setSampai(e.target.value)}
          />
        </div>
        <button
          onClick={handleFetch}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
        >
          Hitung Rekap
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Menghitung...</p>
      ) : rekap.length === 0 ? (
        <p className="text-sm text-slate-500">Belum ada data. Klik &quot;Hitung Rekap&quot;.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2">Bahan Baku</th>
                <th className="px-4 py-2 text-right">Total Dibutuhkan</th>
              </tr>
            </thead>
            <tbody>
              {rekap.map((r) => (
                <tr key={r.bahanBakuId} className="border-t border-slate-100">
                  <td className="px-4 py-2">{r.nama}</td>
                  <td className="px-4 py-2 text-right">
                    {r.totalDibutuhkan.toLocaleString("id-ID")} {r.satuan}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
