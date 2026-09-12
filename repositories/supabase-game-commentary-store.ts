import "server-only";

import { parseHumorIntensity } from "@/domain/game-commentary";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AiGenerationReservation,
  AiRateLimitInput,
  AiRateLimitResult,
  CompleteGameCommentaryInput,
  GameCommentaryStore,
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

  async recordRateLimitedAttempt(input: AiRateLimitInput): Promise<AiRateLimitResult> {
    const { data, error } = await createAdminClient().rpc(
      "record_ai_commentary_attempt",
      {
        p_auth_user_id: input.authUserId,
        p_game_id: input.gameId,
        p_game_limit: input.gameTotal,
        p_ip_hash: input.ipHash,
        p_ip_limit: input.ipPerHour,
        p_user_limit: input.userPerHour,
      },
    );
    if (error) throw rpcFailure(error);
    const status = String(data ?? "");
    if (status === "allowed") return { status };
    if (status === "rate_limited:user") {
      return { status: "rate_limited", dimension: "user" };
    }
    if (status === "rate_limited:ip") {
      return { status: "rate_limited", dimension: "ip" };
    }
    if (status === "rate_limited:game") {
      return { status: "rate_limited", dimension: "game" };
    }
    throw new Error("Resultado inválido del límite de comentarios.");
  }

  async reserveGeneration(input: {
    gameId: string;
    authUserId: string;
    dailyLimit: number;
  }): Promise<AiGenerationReservation> {
    const { data, error } = await createAdminClient().rpc(
      "reserve_ai_commentary_generation",
      {
        p_auth_user_id: input.authUserId,
        p_daily_limit: input.dailyLimit,
        p_game_id: input.gameId,
      },
    );
    if (error) throw rpcFailure(error);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Reserva de comentarios inválida.");
    }
    const row = data as Record<string, unknown>;
    const status = row.status;
    if (status === "reused" || status === "in_progress" || status === "daily_cap") {
      return { status };
    }
    if (status === "allowed" && typeof row.reservation_token === "string") {
      return { status, reservationToken: row.reservation_token };
    }
    throw new Error("Reserva de comentarios inválida.");
  }

  async completeGeneration(
    input: CompleteGameCommentaryInput,
  ): Promise<StoredGameCommentary> {
    const { data, error } = await createAdminClient().rpc("complete_ai_commentary", {
      p_auth_user_id: input.authUserId,
      p_comments: input.comments.map((comment) => comment.text),
      p_game_id: input.gameId,
      p_intensity: input.intensity,
      p_reservation_token: input.reservationToken,
    });
    if (error) throw rpcFailure(error);
    return deserializeStoredCommentary(data);
  }

  async failGeneration(input: {
    gameId: string;
    reservationToken: string;
  }): Promise<void> {
    const { error } = await createAdminClient().rpc("fail_ai_commentary_generation", {
      p_game_id: input.gameId,
      p_reservation_token: input.reservationToken,
    });
    if (error) throw rpcFailure(error);
  }
}
