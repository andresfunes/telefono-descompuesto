import { CreateGameForm, JoinGameForm } from "@/components/game-form";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-5 py-10 sm:px-8">
      <header className="mb-9 max-w-2xl">
        <p className="mb-3 inline-block -rotate-2 rounded-full bg-[var(--coral)] px-4 py-2 text-sm font-black text-white">
          DECILO · DIBUJALO · PASALO
        </p>
        <h1 className="text-5xl font-black leading-[0.92] tracking-tight sm:text-7xl">
          Teléfono
          <br />
          Descompuesto
        </h1>
        <p className="mt-5 max-w-lg text-lg leading-relaxed">
          Creá una sala, invitá a tus amigos y descubrí cuánto puede cambiar una idea al pasar de mano en mano.
        </p>
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-[2rem] border-2 border-[var(--ink)] bg-white/85 p-6 shadow-[7px_7px_0_var(--ink)]">
          <h2 className="mb-1 text-2xl font-black">Nueva partida</h2>
          <p className="mb-5 text-sm text-slate-600">Creá una sala y compartí el código.</p>
          <CreateGameForm />
        </section>
        <section className="rounded-[2rem] border-2 border-[var(--ink)] bg-[var(--mint)]/65 p-6 shadow-[7px_7px_0_var(--ink)]">
          <h2 className="mb-1 text-2xl font-black">Unirme</h2>
          <p className="mb-5 text-sm text-slate-700">Solo necesitás el código y tu nombre.</p>
          <JoinGameForm />
        </section>
      </div>
    </main>
  );
}
