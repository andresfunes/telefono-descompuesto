import "server-only";

import { parseHumorIntensity } from "@/domain/game-commentary";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  GameCommentaryStore,
  SaveGameCommentaryInput,
  StoredGameCommentary,
} from "./game-commentary-store";
import { rpcFailure } from "./supabase-game-repository";

function deserializeStoredCommentary(value: unknown): StoredGameCommentary {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Comentario guardado inválido.");
  }
  const row = value as Record<string, unknown>;
  const comments = row.comments;
  const generatedAt = new Date(String(row.generated_at ?? ""));
  if (
    !Array.isArray(comments) ||
    comments.length === 0 ||
    comments.some((comment) => typeof comment !== "string" || !comment.trim()) ||
    Number.isNaN(generatedAt.valueOf())
  ) {
    throw new Error("Comentario guardado inválido.");
  }

  return {
    comments: comments as string[],
    intensity: parseHumorIntensity(row.intensity),
    generatedAt,
  };
}

export class SupabaseGameCommentaryStore implements GameCommentaryStore {
  async getByRoomCode(code: string): Promise<StoredGameCommentary | null> {
    const { data, error } = await createAdminClient().rpc("load_game_commentary", {
      p_code: code,
    });
    if (error) throw rpcFailure(error);
    return data ? deserializeStoredCommentary(data) : null;
  }

  async save(input: SaveGameCommentaryInput): Promise<StoredGameCommentary> {
    const { data, error } = await createAdminClient().rpc("save_game_commentary", {
      p_auth_user_id: input.authUserId,
      p_comments: input.comments.map((comment) => comment.text),
      p_game_id: input.gameId,
      p_intensity: input.intensity,
    });
    if (error) throw rpcFailure(error);
    return deserializeStoredCommentary(data);
  }
}
