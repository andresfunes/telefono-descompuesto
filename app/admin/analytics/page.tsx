import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isAdminAnalyticsAuthorized } from "@/lib/product-analytics/admin-auth";
import { productAnalyticsStore } from "@/repositories";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Analítica interna | Teléfono Descompuesto",
  robots: { index: false, follow: false },
};

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border-2 border-[var(--ink)] bg-white p-4 shadow-[4px_4px_0_var(--ink)]">
      <p className="text-sm font-bold text-slate-600">{label}</p>
      <p className="mt-1 text-3xl font-black">{value}</p>
    </div>
  );
}

function percentage(value: number): string {
  return `${value.toLocaleString("es-UY", { maximumFractionDigits: 1 })}%`;
}

export default async function ProductAnalyticsPage() {
  const requestHeaders = await headers();
  if (
    !isAdminAnalyticsAuthorized(
      requestHeaders.get("authorization"),
      process.env.ADMIN_ANALYTICS_SECRET,
    )
  ) {
    notFound();
  }

  const metrics = await productAnalyticsStore.getFunnelMetrics(7);
  const { summary } = metrics;

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-5 py-10 sm:py-16">
      <header>
        <p className="text-sm font-black uppercase tracking-widest text-[var(--coral)]">
          Uso interno
        </p>
        <h1 className="mt-1 text-4xl font-black">Funnel del producto</h1>
        <p className="mt-2 text-slate-600">
          Totales desde la activación de la instrumentación. Días calculados en UTC.
        </p>
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Salas creadas" value={summary.roomsCreated} />
        <MetricCard label="Jugadores unidos" value={summary.playersJoined} />
        <MetricCard label="Partidas iniciadas" value={summary.gamesStarted} />
        <MetricCard label="Partidas terminadas" value={summary.gamesFinished} />
        <MetricCard label="Revanchas creadas" value={summary.rematchesCreated} />
        <MetricCard
          label="Conversión a inicio"
          value={percentage(summary.startConversion)}
        />
        <MetricCard
          label="Conversión a final"
          value={percentage(summary.finishConversion)}
        />
        <MetricCard
          label="Conversión a revancha"
          value={percentage(summary.rematchConversion)}
        />
      </section>

      <section className="mt-8 rounded-[1.5rem] border-2 border-[var(--ink)] bg-[var(--mint)] p-5">
        <p className="text-sm font-bold text-slate-600">
          Promedio de jugadores por partida iniciada
        </p>
        <p className="mt-1 text-3xl font-black">
          {summary.averageStartedPlayers.toLocaleString("es-UY", {
            maximumFractionDigits: 2,
          })}
        </p>
      </section>

      <section className="mt-8 overflow-hidden rounded-[1.5rem] border-2 border-[var(--ink)] bg-white">
        <div className="border-b-2 border-[var(--ink)] bg-[var(--cream)] p-5">
          <h2 className="text-2xl font-black">Últimos 7 días</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-3">Fecha UTC</th>
                <th className="p-3">Salas</th>
                <th className="p-3">Jugadores</th>
                <th className="p-3">Iniciadas</th>
                <th className="p-3">1ª entrega</th>
                <th className="p-3">Terminadas</th>
                <th className="p-3">Revanchas</th>
              </tr>
            </thead>
            <tbody>
              {metrics.daily.map((day) => (
                <tr className="border-t border-slate-200" key={day.date}>
                  <th className="p-3 font-bold">{day.date}</th>
                  <td className="p-3">{day.roomCreated}</td>
                  <td className="p-3">{day.roomJoined}</td>
                  <td className="p-3">{day.gameStarted}</td>
                  <td className="p-3">{day.firstSubmission}</td>
                  <td className="p-3">{day.gameFinished}</td>
                  <td className="p-3">{day.rematchCreated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
