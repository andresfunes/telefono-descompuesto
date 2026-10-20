import Image from "next/image";
import { isRevealSummary, revealSlides } from "@/domain/reveal";
import { RevealControls } from "./reveal-controls";
import {
  revealChains,
  type ChainEntry,
  type DrawingAsset,
  type Game,
} from "@/domain/game";
import { GameCommentary } from "./game-commentary";
import { RematchControls } from "./rematch-controls";

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
      className="max-h-[50svh] h-auto w-full rounded-xl border border-slate-200 bg-white object-contain"
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
      return <p className="text-lg font-bold">🔊 Audio</p>;
    case "emoji":
      return <p className="text-4xl">{entry.content.emoji}</p>;
  }
}

export function RevealScreen({
  game,
  drawingUrls,
  canGenerateCommentary,
  commentaryAvailable,
  initialComments,
  currentPlayerId,
}: {
  game: Game;
  drawingUrls: Record<string, string>;
  canGenerateCommentary: boolean;
  commentaryAvailable: boolean;
  initialComments: string[];
  currentPlayerId: string;
}) {
  const playerNames = new Map(game.players.map((player) => [player.id, player.name]));
  const chains = revealChains(game);
  const slides = revealSlides(game);
  const summary = isRevealSummary(game);
  const slide = slides[game.revealStep ?? -1];
  const isHost = game.hostPlayerId === currentPlayerId;
  const hostName = playerNames.get(game.hostPlayerId ?? "") ?? "El anfitrión";

  const earlyEndNotice = game.players.filter((player) => player.active).length < 2 ? (
    <p className="mb-4 rounded-xl bg-[var(--cream)] p-3 text-center text-sm text-slate-600">
      La partida terminó porque quedó un solo jugador activo. Podés ver los aportes que llegaron a enviarse.
    </p>
  ) : null;

  if (!summary) {
    return (
      <section className="py-6" aria-label="Presentación sincronizada">
        {earlyEndNotice}
        <div className="mb-5 text-center">
          <p className="text-sm font-black uppercase tracking-widest text-slate-500">Revelación en vivo</p>
          <h2 className="mt-2 text-2xl font-black">Una carta, una sorpresa</h2>
          <p className="mt-2 text-sm text-slate-600">{isHost ? "Dirigís la presentación" : `${hostName} dirige la presentación`}</p>
        </div>
        <div aria-live="polite" aria-atomic="true">
          {slide ? (
            <article key={slide.entry.id} className="rounded-3xl border-2 border-[var(--ink)] bg-[var(--cream)] p-4 sm:p-6">
              <p className="text-sm font-bold text-slate-600">Cadena {slide.chainIndex + 1} de {chains.length} · Aporte {slide.entryIndex + 1} de {slide.chain.entries.length}</p>
              <h3 className="mb-4 mt-2 text-xl font-black">
                {slide.entry.roundNumber === 0 ? "Frase original" : slide.entry.content.type === "drawing" ? "Dibujo" : slide.entry.content.type === "text" ? "Interpretación" : "Aporte"}
              </h3>
              <div className="grid min-h-40 place-items-center break-words rounded-2xl bg-white p-4 text-center">
                <EntryContent drawingUrls={drawingUrls} entry={slide.entry} />
              </div>
              <p className="mt-4 text-center text-sm">Por <strong>{playerNames.get(slide.entry.playerId) ?? "Jugador"}</strong></p>
            </article>
          ) : (
            <div className="rounded-3xl border-2 border-dashed border-slate-300 bg-[var(--cream)] p-8 text-center">
              <span className="text-5xl" aria-hidden="true">🎬</span>
              <h3 className="mt-4 text-xl font-black">{slides.length === 0 ? "No llegaron a enviarse aportes" : "¡Que empiece la revelación!"}</h3>
              <p className="mt-2 text-slate-600">{slides.length === 0 ? "Podés ir al resumen para crear una nueva partida." : isHost ? "Cuando estén todos listos, revelá la primera carta." : `Esperando a que ${hostName} revele la primera carta…`}</p>
            </div>
          )}
          <p className="mt-4 text-center text-sm text-slate-500">Carta {Math.max(0, (game.revealStep ?? -1) + 1)} de {slides.length}</p>
        </div>
        {isHost ? <RevealControls roomCode={game.code} step={game.revealStep ?? null} total={slides.length} /> :
          <p className="mt-5 text-center text-sm text-slate-600">Las cartas avanzan para todos al mismo tiempo.</p>}
      </section>
    );
  }

  return (
    <div className="py-6">
      {earlyEndNotice}
      <div className="mb-8 text-center">
        <div className="text-5xl">🎉</div>
        <h2 className="mt-3 text-3xl font-black">¡Así quedó la historia!</h2>
        <p className="mt-2 text-slate-600">De la frase original al último disparate.</p>
        {game.players.some((player) => !player.active) && (
          <p className="mx-auto mt-3 max-w-lg rounded-xl bg-slate-100 p-3 text-sm text-slate-600">
            Se saltearon los turnos de {game.players
              .filter((player) => !player.active)
              .map((player) => player.name)
              .join(", ")}. Las cadenas mantienen su orden original.
          </p>
        )}
      </div>

      {isHost && <RevealControls roomCode={game.code} step={game.revealStep ?? null} total={slides.length} />}

      <GameCommentary
        canGenerate={canGenerateCommentary}
        chainEntryIds={Object.fromEntries(
          chains.map((chain) => [chain.id, chain.entries.map((entry) => entry.id)]),
        )}
        chainIds={chains.map((chain) => chain.id)}
        commentaryAvailable={commentaryAvailable}
        initialComments={initialComments}
        roomCode={game.code}
      >
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
      </GameCommentary>

      <RematchControls
        currentPlayerName={playerNames.get(currentPlayerId) ?? "Jugador"}
        hostName={playerNames.get(game.hostPlayerId ?? "") ?? "El organizador"}
        isHost={game.hostPlayerId === currentPlayerId}
        rematchCode={game.rematchCode}
        roomCode={game.code}
      />
    </div>
  );
}
