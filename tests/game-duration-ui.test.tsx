import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LobbyScreen } from "@/components/lobby-screen";
import { PlayingScreen } from "@/components/playing-screen";
import { createLobbyGame, startGame, type Game } from "@/domain/game";

vi.mock("@/app/actions", () => ({
  setRoomRoundLimit: vi.fn(), setRoomLock: vi.fn(), removeRoomPlayer: vi.fn(),
  startRoomGame: vi.fn(), submitTurn: vi.fn(),
}));
vi.mock("@/components/room-invitation", () => ({ RoomInvitation: () => null }));

function fixture(): Game {
  return { ...createLobbyGame("ABC234"), hostPlayerId: "p0", roundLimit: 4,
    players: Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, joinedAt: new Date(), active: true })) };
}

describe("duration UI", () => {
  it("shows the host three saved options and explains the actual round count", () => {
    const game = fixture();
    const html = renderToStaticMarkup(<LobbyScreen game={game} currentPlayer={game.players[0]} />);
    expect(html).toContain('name="roundLimit"');
    expect(html).toContain("Partida completa");
    expect(html).toContain("Rápida · 4 rondas");
    expect(html).toContain("Rápida · 6 rondas");
    expect(html).toContain('value="4" aria-pressed="true"');
    expect(html).toContain("Con este grupo: 4 rondas");
  });
  it("shows guests the setting without mutation controls", () => {
    const game = fixture();
    const html = renderToStaticMarkup(<LobbyScreen game={game} currentPlayer={game.players[1]} />);
    expect(html).toContain("Rápida · 4 rondas");
    expect(html).not.toContain('name="roundLimit"');
  });
  it("uses the configured limit in the round counter", () => {
    const game = startGame(fixture(), "p0");
    const html = renderToStaticMarkup(<PlayingScreen game={game} currentPlayer={game.players[0]} drawingUrls={{}} />);
    expect(html).toMatch(/Ronda 1 de 4/);
  });
});
