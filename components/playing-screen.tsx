import { previousEntryForPlayer, type Game, type Player } from "@/domain/game";
import { TurnForm } from "./game-controls";

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
        </div>
      ) : (
        <TurnForm
          entryType={round.expectedEntryType}
          previousDrawingUrl={previousDrawingUrl}
          previousText={previousText}
          roomCode={game.code}
          roundNumber={round.number}
        />
      )}
    </div>
  );
}
