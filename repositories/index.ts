import "server-only";

import { SupabaseGameRepository } from "./supabase-game-repository";
import { SupabaseGameCommentaryStore } from "./supabase-game-commentary-store";
import { SupabaseDrawingAssetStore } from "./supabase-drawing-asset-store";
import { SupabaseSnapshotGateway } from "./supabase-snapshot-gateway";
import { SupabaseProductAnalyticsStore } from "./supabase-product-analytics-store";

const globalRepository = globalThis as typeof globalThis & {
  gameRepository?: SupabaseGameRepository;
  gameCommentaryStore?: SupabaseGameCommentaryStore;
  drawingAssetStore?: SupabaseDrawingAssetStore;
  productAnalyticsStore?: SupabaseProductAnalyticsStore;
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

export const productAnalyticsStore =
  globalRepository.productAnalyticsStore ?? new SupabaseProductAnalyticsStore();

globalRepository.productAnalyticsStore = productAnalyticsStore;
