import "server-only";

import type { DrawingAsset } from "@/domain/game";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DrawingAssetStore, StoreDrawingInput } from "./drawing-asset-store";

const DRAWING_BUCKET = "game-drawings";
const SIGNED_URL_SECONDS = 60 * 60;

export class SupabaseDrawingAssetStore implements DrawingAssetStore {
  async storeDrawing({
    gameId,
    playerId,
    roundNumber,
    png,
  }: StoreDrawingInput): Promise<DrawingAsset> {
    const assetId = crypto.randomUUID();
    const path = [
      "games",
      gameId,
      "rounds",
      String(roundNumber),
      "players",
      playerId,
      `${assetId}.png`,
    ].join("/");
    const { error } = await createAdminClient().storage
      .from(DRAWING_BUCKET)
      .upload(path, png, { contentType: "image/png", upsert: false });
    if (error) throw new Error(`No se pudo guardar el dibujo: ${error.message}`);

    return { kind: "storage-path", value: path, mimeType: "image/png" };
  }

  async removeDrawing(asset: DrawingAsset): Promise<void> {
    if (asset.kind !== "storage-path") return;
    const { error } = await createAdminClient().storage
      .from(DRAWING_BUCKET)
      .remove([asset.value]);
    if (error) console.error("No se pudo limpiar un dibujo sin referencia", error.message);
  }

  async resolveDrawingUrl(asset: DrawingAsset): Promise<string | null> {
    if (asset.kind !== "storage-path") return asset.value;
    const { data, error } = await createAdminClient().storage
      .from(DRAWING_BUCKET)
      .createSignedUrl(asset.value, SIGNED_URL_SECONDS);
    return error ? null : data.signedUrl;
  }
}
