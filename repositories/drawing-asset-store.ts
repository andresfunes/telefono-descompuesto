import type { DrawingAsset } from "@/domain/game";

export interface StoreDrawingInput {
  gameId: string;
  playerId: string;
  roundNumber: number;
  png: Uint8Array;
}

export interface DrawingAssetStore {
  storeDrawing(input: StoreDrawingInput): Promise<DrawingAsset>;
  removeDrawing(asset: DrawingAsset): Promise<void>;
  resolveDrawingUrl(asset: DrawingAsset): Promise<string | null>;
}
