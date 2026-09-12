import { CreateGameForm, JoinGameForm } from "@/components/game-form";
import phoneIllustration from "@/public/images/rotary-phone.png";
import Image from "next/image";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-5 py-10 sm:px-8">
      <header className="mb-9 grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_minmax(18rem,0.72fr)] md:gap-8">
        <div className="max-w-2xl">
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
        </div>

        <div className="mx-auto -my-2 w-full max-w-64 sm:max-w-72 md:my-0 md:max-w-sm">
          <Image
            alt=""
            className="h-auto w-full"
            placeholder="blur"
            preload
            sizes="(min-width: 768px) 384px, 288px"
            src={phoneIllustration}
          />
        </div>
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
