/**
 * Semua tanggal disimpan sebagai DateTime jam 00:00:00 UTC (date-only) supaya
 * perbandingan & unique constraint (menuId, tanggal) konsisten terlepas dari
 * jam pembuatan record.
 */
export function toDateOnly(input: string | Date): Date {
  const d = typeof input === "string" ? new Date(input) : input;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function formatDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

/**
 * Deadline order untuk `tanggalKirim` adalah jam CUTOFF_HOUR pada H-1
 * (tanggalKirim - 1 hari), dalam waktu lokal WIB (UTC+7) sesuai target
 * pengguna. Disimpan/dibandingkan dalam UTC secara konsisten.
 */
export const CUTOFF_HOUR_LOCAL = 20; // jam 20:00 waktu lokal
const LOCAL_UTC_OFFSET_HOURS = 7; // WIB

export function orderDeadline(tanggalKirim: Date): Date {
  const hMinus1 = addDays(toDateOnly(tanggalKirim), -1);
  // jam 20:00 WIB == jam 13:00 UTC
  const deadlineUtc = new Date(hMinus1);
  deadlineUtc.setUTCHours(CUTOFF_HOUR_LOCAL - LOCAL_UTC_OFFSET_HOURS, 0, 0, 0);
  return deadlineUtc;
}

export function isPastDeadline(tanggalKirim: Date, now: Date = new Date()): boolean {
  return now.getTime() > orderDeadline(tanggalKirim).getTime();
}
