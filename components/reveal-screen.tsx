import { revealChains, type ChainEntry, type Game } from "@/domain/game";

function entryLabel(entry: ChainEntry): string {
  switch (entry.content.type) {
    case "text":
      return `“${entry.content.text}”`;
    case "drawing":
      return `🎨 ${entry.content.data}`;
    case "audio":
      return `🔊 ${entry.content.storagePath}`;
    case "emoji":
      return entry.content.emoji;
  }
}

export function RevealScreen({ game }: { game: Game }) {
  const playerNames = new Map(game.players.map((player) => [player.id, player.name]));
  const chains = revealChains(game);

  return (
    <div className="py-6">
      <div className="mb-8 text-center">
        <div className="text-5xl">🎉</div>
        <h2 className="mt-3 text-3xl font-black">¡Así quedó la historia!</h2>
        <p className="mt-2 text-slate-600">De la frase original al último disparate.</p>
      </div>

      <div className="space-y-8">
        {chains.map((chain, chainIndex) => (
          <article
            className="rounded-[1.5rem] border-2 border-[var(--ink)] bg-[var(--cream)] p-5"
            key={chain.id}
          >
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">
              Cadena {chainIndex + 1}
            </h3>
            <ol className="mt-4 space-y-3">
              {chain.entries.map((entry, entryIndex) => (
                <li key={entry.id}>
                  {entryIndex > 0 && <div className="mb-3 text-center text-2xl">↓</div>}
                  <div className="rounded-2xl bg-white p-4 text-center shadow-sm">
                    <p className="text-lg font-bold">{entryLabel(entry)}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {entryIndex === 0 ? "Original" : entry.content.type === "drawing" ? "Dibujo" : "Interpretación"}
                      {" por "}
                      <strong>{playerNames.get(entry.playerId) ?? "Jugador"}</strong>
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </article>
        ))}
      </div>
    </div>
  );
}
