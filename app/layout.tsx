import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Katering Nasi Box - Kuota Produksi",
  description: "Pemesanan katering nasi box harian dengan kuota produksi",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-screen text-slate-900">{children}</body>
    </html>
  );
}
