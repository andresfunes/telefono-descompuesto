import {
  previousEntryForPlayer,
  type ChainEntry,
  type Game,
  type Player,
} from "@/domain/game";
import { RefreshGameButton, TurnForm } from "./game-controls";

function visibleEntryValue(entry: ChainEntry | null): string {
  if (!entry) return "";
  switch (entry.content.type) {
    case "text":
      return entry.content.text;
    case "drawing":
      return entry.content.data;
    case "audio":
      return "Audio";
    case "emoji":
      return entry.content.emoji;
  }
}

export function PlayingScreen({ game, currentPlayer }: { game: Game; currentPlayer: Player }) {
  if (!game.currentRound) return null;

  const round = game.currentRound;
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
          <RefreshGameButton />
        </div>
      ) : (
        <TurnForm
          entryType={round.expectedEntryType}
          previousText={visibleEntryValue(previousEntryForPlayer(game, currentPlayer.id))}
          roomCode={game.code}
          roundNumber={round.number}
        />
      )}
    </div>
  );
}
