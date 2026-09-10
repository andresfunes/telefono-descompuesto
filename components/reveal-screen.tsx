import Image from "next/image";
import {
  revealChains,
  type ChainEntry,
  type DrawingAsset,
  type Game,
} from "@/domain/game";
import { GameCommentary } from "./game-commentary";

function DrawingReveal({
  asset,
  resolvedUrl,
}: {
  asset: DrawingAsset;
  resolvedUrl?: string;
}) {
  const source = resolvedUrl ?? (asset.kind === "storage-path" ? null : asset.value);
  return source ? (
    <Image
      alt="Dibujo de la cadena"
      className="h-auto w-full rounded-xl border border-slate-200 bg-white object-contain"
      height={720}
      src={source}
      unoptimized
      width={960}
    />
  ) : (
    <p className="text-sm text-slate-500">Dibujo no disponible</p>
  );
}

function EntryContent({
  entry,
  drawingUrls,
}: {
  entry: ChainEntry;
  drawingUrls: Record<string, string>;
}) {
  switch (entry.content.type) {
    case "text":
      return <p className="text-lg font-bold">“{entry.content.text}”</p>;
    case "drawing":
      return (
        <DrawingReveal
          asset={entry.content.asset}
          resolvedUrl={drawingUrls[entry.id]}
        />
      );
    case "audio":
      return <p className="text-lg font-bold">🔊 {entry.content.storagePath}</p>;
    case "emoji":
      return <p className="text-4xl">{entry.content.emoji}</p>;
  }
}

export function RevealScreen({
  game,
  drawingUrls,
}: {
  game: Game;
  drawingUrls: Record<string, string>;
}) {
  const playerNames = new Map(game.players.map((player) => [player.id, player.name]));
  const chains = revealChains(game);

  return (
    <div className="py-6">
      <div className="mb-8 text-center">
        <div className="text-5xl">🎉</div>
        <h2 className="mt-3 text-3xl font-black">¡Así quedó la historia!</h2>
        <p className="mt-2 text-slate-600">De la frase original al último disparate.</p>
      </div>

      <GameCommentary roomCode={game.code} />

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
                    <EntryContent drawingUrls={drawingUrls} entry={entry} />
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
