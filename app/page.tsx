import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-bold">Katering Nasi Box</h1>
      <p className="max-w-md text-slate-600">
        Pesan nasi box harian dengan kuota produksi yang selalu akurat, tidak
        pernah overbooking.
      </p>
      <div className="flex gap-4">
        <Link
          href="/order"
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-white hover:bg-slate-700"
        >
          Pesan Sekarang
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-slate-300 px-5 py-2.5 hover:bg-slate-100"
        >
          Login Admin
        </Link>
      </div>
    </main>
  );
}
