import type { Game, Player } from "@/domain/game";
import { RefreshGameButton, StartGameForm } from "./game-controls";

export function LobbyScreen({ game, currentPlayer }: { game: Game; currentPlayer: Player }) {
  const isHost = game.hostPlayerId === currentPlayer.id;

  return (
    <>
      <div className="py-6">
        <h2 className="text-xl font-black">Jugadores · {game.players.length}</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {game.players.map((player, index) => (
            <li
              className="flex items-center gap-3 rounded-2xl bg-[var(--cream)] p-3 font-bold"
              key={player.id}
            >
              <span className="grid size-9 place-items-center rounded-full bg-[var(--coral)] text-white">
                {index + 1}
              </span>
              {player.name}
              {player.id === game.hostPlayerId && <span title="Anfitrión">👑</span>}
              {player.id === currentPlayer.id && (
                <span className="ml-auto text-xs text-slate-500">vos</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {isHost ? (
        <StartGameForm roomCode={game.code} />
      ) : (
        <div className="rounded-2xl bg-slate-100 p-4 text-center">
          <p className="font-bold">Esperando a que el anfitrión comience…</p>
          <RefreshGameButton />
        </div>
      )}

      <p className="mt-5 text-center text-sm text-slate-600">
        Compartí <strong>/{game.code}</strong> con tus amigos.
      </p>
    </>
  );
}
