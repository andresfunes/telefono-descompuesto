import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-5 text-center">
      <div>
        <p className="text-7xl font-black">404</p>
        <h1 className="mt-2 text-2xl font-black">Esa sala no existe</h1>
        <p className="mt-2 text-slate-600">Revisá el código o creá una nueva partida.</p>
        <Link className="mt-6 inline-block rounded-2xl bg-[var(--ink)] px-5 py-3 font-bold text-white" href="/">
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
