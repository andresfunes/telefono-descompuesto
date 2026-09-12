"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function RoomError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10">
      <section className="rounded-[2rem] border-2 border-[var(--ink)] bg-white/90 p-6 shadow-[7px_7px_0_var(--ink)]">
        <p className="text-sm font-bold uppercase tracking-widest">Problema de conexión</p>
        <h1 className="mt-1 text-3xl font-black">No pudimos cargar la sala</h1>
        <p className="mt-3 text-slate-600">
          Puede ser una demora momentánea. Reintentá sin salir de la partida.
        </p>
        <button
          className="mt-6 w-full rounded-xl bg-[var(--ink)] px-4 py-3 font-bold text-white shadow-[0_5px_0_var(--coral)]"
          onClick={() => retry()}
          type="button"
        >
          Reintentar
        </button>
        <Link className="mt-5 block text-center font-bold underline" href="/">
          Volver al inicio
        </Link>
      </section>
    </main>
  );
}
