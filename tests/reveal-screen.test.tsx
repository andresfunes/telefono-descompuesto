import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RevealScreen } from "@/components/reveal-screen";
import { createLobbyGame, type Game } from "@/domain/game";

vi.mock("@/app/actions", () => ({ changeRevealStep: vi.fn() }));
vi.mock("@/components/game-commentary", () => ({ GameCommentary: ({ children }: { children: React.ReactNode }) => <div>Premios{children}</div> }));
vi.mock("@/components/rematch-controls", () => ({ RematchControls: () => <div>Revancha</div> }));

const game: Game = {
  ...createLobbyGame("ABC234"), phase: "REVEAL", revealStep: 0, hostPlayerId: "host",
  players: [{ id: "host", name: "Ana", active: true, joinedAt: new Date(0) }],
  chains: [{ id: "chain", originPlayerId: "host", entries: [
    { id: "first", roundNumber: 0, playerId: "host", createdAt: new Date(0), content: { type: "text", text: "Un pingüino vendiendo helados en la luna" } },
    { id: "second", roundNumber: 2, playerId: "host", createdAt: new Date(0), content: { type: "text", text: "FUTURE_SECRET" } },
  ] }],
};

function render(revealStep: number | null, playerId = "host") {
  return renderToStaticMarkup(<RevealScreen game={{ ...game, revealStep }} drawingUrls={{}}
    currentPlayerId={playerId} canGenerateCommentary={true} commentaryAvailable={true} initialComments={[]} />);
}

describe("reveal server rendering", () => {
  it("does not serialize future cards, commentary or rematch controls", () => {
    const html = render(0);
    expect(html).toContain("Un pingüino");
    expect(html).not.toContain("FUTURE_SECRET");
    expect(html).not.toContain("Premios");
    expect(html).not.toContain("Revancha");
    expect(html).toContain("Siguiente carta");
  });
  it("renders the curtain without any entries and gives guests no controls", () => {
    const html = render(-1, "guest");
    expect(html).toContain("Esperando a que Ana");
    expect(html).not.toContain("Un pingüino");
    expect(html).not.toContain("<button");
  });
  it("reveals the full summary and awards at the end, including legacy games", () => {
    for (const step of [2, null]) {
      const html = render(step);
      expect(html).toContain("FUTURE_SECRET");
      expect(html).toContain("Premios");
      expect(html).toContain("Revancha");
    }
  });
});
