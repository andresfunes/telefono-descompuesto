import {
  isLobbyExpired,
  MAXIMUM_PLAYER_COUNT,
  MINIMUM_PLAYER_COUNT,
  type Game,
  type Player,
} from "@/domain/game";
import { LobbyLockForm, RemovePlayerForm, StartGameForm } from "./game-controls";
import { RoomInvitation } from "./room-invitation";

export function LobbyScreen({ game, currentPlayer }: { game: Game; currentPlayer: Player }) {
  const isHost = game.hostPlayerId === currentPlayer.id;
  const hasMinimumPlayers = game.players.length >= MINIMUM_PLAYER_COUNT;
  const lobbyExpired = isLobbyExpired(game);

  return (
    <>
      {!lobbyExpired && <RoomInvitation roomCode={game.code} />}

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
              {isHost && !lobbyExpired && player.id !== game.hostPlayerId && (
                <RemovePlayerForm
                  playerId={player.id}
                  playerName={player.name}
                  roomCode={game.code}
                />
              )}
            </li>
          ))}
        </ul>
      </div>

      {lobbyExpired ? (
        <div className="rounded-2xl bg-red-50 p-4 text-center text-red-800">
          <p className="font-black">Esta sala venció.</p>
          <p className="mt-1 text-sm">Volvé al inicio para crear una nueva partida.</p>
        </div>
      ) : isHost ? (
        <div className="space-y-3">
          <div className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-700">
            <p className="font-bold">
              {game.lobbyLocked
                ? "Sala bloqueada: no pueden entrar jugadores nuevos."
                : `Sala abierta · ${game.players.length} / ${MAXIMUM_PLAYER_COUNT} jugadores`}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <LobbyLockForm locked={game.lobbyLocked} roomCode={game.code} />
            <StartGameForm
              hasMinimumPlayers={hasMinimumPlayers}
              roomCode={game.code}
            />
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-slate-100 p-4 text-center">
          <p className="font-bold">
            {game.lobbyLocked
              ? "La sala está bloqueada. Esperando a que el anfitrión comience…"
              : "Esperando a que el anfitrión comience…"}
          </p>
        </div>
      )}
    </>
  );
}
