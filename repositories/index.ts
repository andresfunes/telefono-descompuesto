import "server-only";

import { SupabaseGameRepository } from "./supabase-game-repository";
import { SupabaseGameCommentaryStore } from "./supabase-game-commentary-store";
import { SupabaseDrawingAssetStore } from "./supabase-drawing-asset-store";
import { SupabaseSnapshotGateway } from "./supabase-snapshot-gateway";

const globalRepository = globalThis as typeof globalThis & {
  gameRepository?: SupabaseGameRepository;
  gameCommentaryStore?: SupabaseGameCommentaryStore;
  drawingAssetStore?: SupabaseDrawingAssetStore;
};

export const gameRepository =
  typeof globalRepository.gameRepository?.getRoomSession === "function"
    ? globalRepository.gameRepository
    : new SupabaseGameRepository(new SupabaseSnapshotGateway());

globalRepository.gameRepository = gameRepository;

export const gameCommentaryStore =
  globalRepository.gameCommentaryStore ?? new SupabaseGameCommentaryStore();

globalRepository.gameCommentaryStore = gameCommentaryStore;

export const drawingAssetStore =
  globalRepository.drawingAssetStore ?? new SupabaseDrawingAssetStore();

globalRepository.drawingAssetStore = drawingAssetStore;
