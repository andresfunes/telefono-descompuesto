import {
  groupPlayersByRoundStatus,
  previousEntryForPlayer,
  type Game,
  type Player,
} from "@/domain/game";
import { TurnForm } from "./game-controls";
import { randomExamplePrompt } from "@/lib/example-prompts";

export function PlayingScreen({
  game,
  currentPlayer,
  drawingUrls,
}: {
  game: Game;
  currentPlayer: Player;
  drawingUrls: Record<string, string>;
}) {
  if (!game.currentRound) return null;

  const round = game.currentRound;
  const previousEntry = previousEntryForPlayer(game, currentPlayer.id);
  const previousText = previousEntry?.content.type === "text"
    ? previousEntry.content.text
    : undefined;
  const previousDrawingUrl = previousEntry?.content.type === "drawing"
    ? drawingUrls[previousEntry.id]
    : undefined;
  const hasSubmitted = round.submissions.some(
    (submission) => submission.playerId === currentPlayer.id,
  );
  const completedCount = round.submissions.length;
  const playerGroups = groupPlayersByRoundStatus(game);
  const pendingActivity =
    round.expectedEntryType === "drawing" ? "Dibujando" : "Escribiendo";
  const pendingCountLabel = playerGroups.pending.length === 1
    ? "Falta 1"
    : `Faltan ${playerGroups.pending.length}`;

  return (
    <div className="py-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">
            Ronda {round.number + 1} de {game.players.length}
          </p>
          <h2 className="mt-1 text-2xl font-black">
            {round.expectedEntryType === "text" ? "Turno de texto" : "Turno de dibujo"}
          </h2>
        </div>
        <span className="rounded-full bg-[var(--mint)] px-4 py-2 text-sm font-bold">
          {completedCount} / {game.players.length}
        </span>
      </div>

      {hasSubmitted ? (
        <div className="rounded-[1.5rem] bg-[var(--cream)] p-6 text-center">
          <div className="text-4xl">⏳</div>
          <h3 className="mt-3 text-2xl font-black">Esperando al resto…</h3>
          <p className="mt-2 text-slate-600">
            {completedCount} / {game.players.length} jugadores terminaron
          </p>
          <div className="mt-6 grid gap-4 text-left sm:grid-cols-2">
            <section className="rounded-2xl border-2 border-[var(--coral)] bg-white p-4 shadow-[4px_4px_0_var(--coral)]">
              <div className="flex items-center justify-between gap-3">
                <h4 className="font-black text-[var(--coral)]">{pendingActivity}</h4>
                <span className="rounded-full bg-[var(--coral)] px-3 py-1 text-xs font-black text-white">
                  {pendingCountLabel}
                </span>
              </div>
              {playerGroups.pending.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {playerGroups.pending.map((player) => (
                    <li
                      className="flex items-center gap-2 rounded-xl bg-[var(--cream)] px-3 py-2 font-black"
                      key={player.id}
                    >
                      <span
                        aria-hidden="true"
                        className="size-2 animate-pulse rounded-full bg-[var(--coral)]"
                      />
                      {player.name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm font-semibold">Todos terminaron. Avanzando…</p>
              )}
            </section>

            <section className="rounded-2xl border-2 border-slate-200 bg-white/70 p-4">
              <h4 className="font-black text-slate-600">Ya finalizaron</h4>
              <ul className="mt-3 space-y-2">
                {playerGroups.completed.map((player) => (
                  <li
                    className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 font-semibold text-emerald-900"
                    key={player.id}
                  >
                    <span aria-hidden="true">✓</span>
                    {player.name}
                    {player.id === currentPlayer.id && (
                      <span className="ml-auto text-xs font-bold text-emerald-700">vos</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      ) : (
        <TurnForm
          entryType={round.expectedEntryType}
          initialPromptExample={round.number === 0 ? randomExamplePrompt() : undefined}
          previousDrawingUrl={previousDrawingUrl}
          previousText={previousText}
          playerId={currentPlayer.id}
          roomCode={game.code}
          roundNumber={round.number}
        />
      )}
    </div>
  );
}
