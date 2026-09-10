import Link from "next/link";
import { notFound } from "next/navigation";
import { GameRealtime } from "@/components/game-realtime";
import { JoinGameForm } from "@/components/game-form";
import { LobbyScreen } from "@/components/lobby-screen";
import { PlayingScreen } from "@/components/playing-screen";
import { RevealScreen } from "@/components/reveal-screen";
import { isValidRoomCode, normalizeRoomCode } from "@/domain/game";
import { canGenerateGameCommentary } from "@/domain/game-commentary";
import { resolveVisibleDrawingUrls } from "@/lib/game-view";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import { gameCommentaryStore, gameRepository } from "@/repositories";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const code = normalizeRoomCode((await params).code);
  if (!isValidRoomCode(code)) notFound();

  const [game, authUserId] = await Promise.all([
    gameRepository.getRoom(code),
    getAuthenticatedUserId(),
  ]);
  if (!game) notFound();

  const currentPlayer = authUserId
    ? await gameRepository.getPlayerForUser(code, authUserId)
    : null;

  if (!currentPlayer) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
        <Link className="mb-6 font-bold underline" href="/">← Inicio</Link>
        <section className="rounded-[2rem] border-2 border-[var(--ink)] bg-white p-6 shadow-[7px_7px_0_var(--ink)]">
          <p className="text-sm font-bold uppercase tracking-widest">Sala {code}</p>
          {game.phase === "LOBBY" ? (
            <>
              <h1 className="mb-5 mt-1 text-3xl font-black">¿Cómo te llamás?</h1>
              <JoinGameForm defaultCode={code} />
            </>
          ) : (
            <>
              <h1 className="mt-1 text-3xl font-black">La partida ya comenzó</h1>
              <p className="mt-3 text-slate-600">
                Solo pueden continuar los jugadores que ya estaban en la sala.
              </p>
            </>
          )}
        </section>
      </main>
    );
  }

  const drawingUrls = await resolveVisibleDrawingUrls(game, currentPlayer.id);
  const savedCommentary =
    game.phase === "REVEAL" || game.phase === "FINISHED"
      ? await gameCommentaryStore.getByRoomCode(code)
      : null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-5 py-10 sm:py-16">
      <Link className="font-bold underline" href="/">← Salir</Link>
      <section className="mt-6 rounded-[2rem] border-2 border-[var(--ink)] bg-white/90 p-6 shadow-[8px_8px_0_var(--ink)] sm:p-9">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-dashed border-slate-300 pb-6">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest">Sala</p>
            <h1 className="font-mono text-5xl font-black tracking-[0.18em]">{code}</h1>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="rounded-full bg-[var(--mint)] px-4 py-2 text-sm font-bold">
              {game.phase === "LOBBY"
                ? "Esperando jugadores"
                : game.phase === "PLAYING"
                  ? "Partida en curso"
                  : "Revelación"}
            </span>
            <GameRealtime gameId={game.id} />
          </div>
        </header>

        {game.phase === "LOBBY" && (
          <LobbyScreen currentPlayer={currentPlayer} game={game} />
        )}
        {game.phase === "PLAYING" && (
          <PlayingScreen
            currentPlayer={currentPlayer}
            drawingUrls={drawingUrls}
            game={game}
          />
        )}
        {(game.phase === "REVEAL" || game.phase === "FINISHED") && (
          <RevealScreen
            canGenerateCommentary={canGenerateGameCommentary(game, currentPlayer.id)}
            initialComments={savedCommentary?.comments ?? []}
            drawingUrls={drawingUrls}
            game={game}
          />
        )}
      </section>
    </main>
  );
}
