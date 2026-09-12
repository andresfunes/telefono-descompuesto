import Link from "next/link";
import { notFound } from "next/navigation";
import { GameRealtime } from "@/components/game-realtime";
import { JoinGameForm } from "@/components/game-form";
import { LobbyScreen } from "@/components/lobby-screen";
import { PlayingScreen } from "@/components/playing-screen";
import { RevealScreen } from "@/components/reveal-screen";
import { isValidRoomCode, normalizeRoomCode } from "@/domain/game";
import { canGenerateGameCommentary } from "@/domain/game-commentary";
import { getCommentaryProtectionConfig } from "@/lib/ai/commentary-protection-config";
import { resolveVisibleDrawingUrls } from "@/lib/game-view";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import { gameCommentaryStore, gameRepository } from "@/repositories";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const code = normalizeRoomCode((await params).code);
  if (!isValidRoomCode(code)) notFound();

  const authUserId = await getAuthenticatedUserId();
  const roomSession = await gameRepository.getRoomSession(code, authUserId);
  if (!roomSession?.player) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
        <Link className="mb-6 font-bold underline" href="/">← Inicio</Link>
        <section className="rounded-[2rem] border-2 border-[var(--ink)] bg-white p-6 shadow-[7px_7px_0_var(--ink)]">
          <p className="text-sm font-bold uppercase tracking-widest">Ingresar a una sala</p>
          <h1 className="mb-5 mt-1 text-3xl font-black">¿Cómo te llamás?</h1>
          <JoinGameForm defaultCode={code} />
        </section>
      </main>
    );
  }

  const { game, player: currentPlayer } = roomSession;

  const drawingUrls = await resolveVisibleDrawingUrls(game, currentPlayer.id);
  const commentaryConfig = getCommentaryProtectionConfig();
  const commentaryAvailable = Boolean(
    commentaryConfig.enabled &&
      commentaryConfig.turnstileSecretKey &&
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  );
  const savedCommentary =
    game.phase === "REVEAL" || game.phase === "FINISHED"
      ? await gameCommentaryStore.getByRoomCode(code)
      : null;
  const isDrawingTurn =
    game.phase === "PLAYING" && game.currentRound?.expectedEntryType === "drawing";

  return (
    <main
      className={`mx-auto min-h-screen w-full max-w-2xl sm:px-5 sm:py-16 ${
        isDrawingTurn ? "drawing-room-page px-2 py-6" : "px-5 py-10"
      }`}
    >
      <Link className="font-bold underline" href="/">← Salir</Link>
      <section
        className={`border-2 border-[var(--ink)] bg-white/90 sm:mt-6 sm:rounded-[2rem] sm:p-9 sm:shadow-[8px_8px_0_var(--ink)] ${
          isDrawingTurn
            ? "drawing-room-panel mt-4 rounded-[1.5rem] p-3 shadow-[5px_5px_0_var(--ink)]"
            : "mt-6 rounded-[2rem] p-6 shadow-[8px_8px_0_var(--ink)]"
        }`}
      >
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
            commentaryAvailable={commentaryAvailable}
            currentPlayerId={currentPlayer.id}
            initialComments={savedCommentary?.comments ?? []}
            drawingUrls={drawingUrls}
            game={game}
          />
        )}
      </section>
    </main>
  );
}
