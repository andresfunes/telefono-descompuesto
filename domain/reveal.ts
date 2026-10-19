import { GameRuleError, revealChains, type Game } from "./game";

export function revealSlides(game: Game) {
  return revealChains(game).flatMap((chain, chainIndex) =>
    chain.entries.map((entry, entryIndex) => ({ chain, chainIndex, entry, entryIndex })),
  );
}

export function isRevealSummary(game: Game): boolean {
  return game.revealStep == null || game.revealStep >= revealSlides(game).length;
}

export function visibleRevealEntries(game: Game) {
  const slides = revealSlides(game);
  return (isRevealSummary(game) ? slides : slides.slice(0, (game.revealStep ?? -1) + 1))
    .map(({ entry }) => entry);
}

export function setRevealStep(game: Game, playerId: string, expectedStep: number | null, step: number): Game {
  if (game.hostPlayerId !== playerId || !game.players.some((p) => p.id === playerId && p.active)) {
    throw new GameRuleError("NOT_HOST", "Solo el anfitrión puede controlar la presentación.");
  }
  const total = revealSlides(game).length;
  if (!Number.isInteger(step) || step < -1 || step > total) {
    throw new GameRuleError("INVALID_ENTRY", "El paso de la presentación no es válido.");
  }
  if ((game.revealStep ?? null) !== expectedStep) {
    throw new GameRuleError("WRONG_ROUND", "La presentación cambió. Volvé a intentar.");
  }
  return { ...game, revealStep: step };
}
