import "server-only";

import {
  previousEntryForPlayer,
  type ChainEntry,
  type DrawingEntry,
  type Game,
} from "@/domain/game";
import { drawingAssetStore } from "@/repositories";

export async function resolveVisibleDrawingUrls(
  game: Game,
  playerId: string,
): Promise<Record<string, string>> {
  let entries: ChainEntry[] = [];
  if (game.phase === "REVEAL" || game.phase === "FINISHED") {
    entries = game.chains.flatMap((chain) => chain.entries);
  } else if (game.phase === "PLAYING") {
    const previousEntry = previousEntryForPlayer(game, playerId);
    if (previousEntry) entries = [previousEntry];
  }

  const drawings = entries.filter(
    (entry): entry is DrawingEntry => entry.content.type === "drawing",
  );
  const resolved = await Promise.all(
    drawings.map(async (entry) => ({
      entryId: entry.id,
      url: await drawingAssetStore.resolveDrawingUrl(entry.content.asset),
    })),
  );

  return Object.fromEntries(
    resolved
      .filter((item): item is { entryId: string; url: string } => Boolean(item.url))
      .map(({ entryId, url }) => [entryId, url]),
  );
}

export async function resolveRevealDrawingAnalysisInputs(
  game: Game,
): Promise<Record<string, string>> {
  if (game.phase !== "REVEAL" && game.phase !== "FINISHED") return {};
  const drawings = game.chains
    .flatMap((chain) => chain.entries)
    .filter((entry): entry is DrawingEntry => entry.content.type === "drawing");
  const resolved = await Promise.all(
    drawings.map(async (entry) => ({
      entryId: entry.id,
      input: await drawingAssetStore.resolveDrawingAnalysisInput(entry.content.asset),
    })),
  );

  return Object.fromEntries(
    resolved
      .filter((item): item is { entryId: string; input: string } => Boolean(item.input))
      .map(({ entryId, input }) => [entryId, input]),
  );
}
