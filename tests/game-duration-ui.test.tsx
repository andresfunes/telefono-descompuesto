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


describe("duration options for small groups", () => {
  it.each([2, 3, 4])("hides the selector with %i players while retaining a rematch preference", (count) => {
    const game = fixture();
    game.players = game.players.slice(0, count);
    for (const currentPlayer of game.players.slice(0, 2)) {
      const html = renderToStaticMarkup(<LobbyScreen game={game} currentPlayer={currentPlayer} />);
      expect(html).not.toContain('name="roundLimit"');
      expect(html).toContain("Duración: Partida completa");
      expect(html).toContain(`Con este grupo: ${count} rondas`);
      expect(html).toContain("Todos participan en cada cadena.");
      expect(html).not.toContain("desde 5 jugadores");
      expect(html).not.toContain("Preferencia para grupos más grandes");
    }
    expect(game.roundLimit).toBe(4);
  });

  it.each([5, 6, 7])("offers only shorter options with %i players", (count) => {
    const game = fixture();
    game.players = game.players.slice(0, count);
    game.roundLimit = 6;
    const html = renderToStaticMarkup(<LobbyScreen game={game} currentPlayer={game.players[0]} />);
    const sixRoundButton = html.match(/<button[^>]*value="6"[^>]*>/)?.[0];
    expect(sixRoundButton).toBeDefined();
    if (count <= 6) {
      expect(sixRoundButton).toContain('disabled=""');
      expect(html).toContain('value="full" aria-pressed="true"');
      expect(html).toContain(`Con este grupo: ${count} rondas`);
    } else {
      expect(sixRoundButton).not.toContain('disabled=""');
      expect(sixRoundButton).toContain('aria-pressed="true"');
      expect(html).toContain("Con este grupo: 6 rondas");
    }
  });
});
