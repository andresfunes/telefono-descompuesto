import "server-only";

import { SupabaseGameRepository } from "./supabase-game-repository";
import { SupabaseDrawingAssetStore } from "./supabase-drawing-asset-store";
import { SupabaseSnapshotGateway } from "./supabase-snapshot-gateway";

const globalRepository = globalThis as typeof globalThis & {
  gameRepository?: SupabaseGameRepository;
  drawingAssetStore?: SupabaseDrawingAssetStore;
};

export const gameRepository =
  globalRepository.gameRepository ??
  new SupabaseGameRepository(new SupabaseSnapshotGateway());

globalRepository.gameRepository = gameRepository;

export const drawingAssetStore =
  globalRepository.drawingAssetStore ?? new SupabaseDrawingAssetStore();

globalRepository.drawingAssetStore = drawingAssetStore;
