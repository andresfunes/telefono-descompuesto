import "server-only";

export type AiGenerationLogCategory =
  | "ai_generation_allowed"
  | "ai_generation_reused"
  | "ai_generation_turnstile_failed"
  | "ai_generation_rate_limited"
  | "ai_generation_daily_cap_reached"
  | "ai_generation_disabled"
  | "ai_generation_protection_failed"
  | "ai_generation_openai_failed"
  | "ai_generation_succeeded";

export function logAiGeneration(
  category: AiGenerationLogCategory,
  context: {
    gameId: string;
    chainIds?: readonly string[];
    reason?: string;
  },
): void {
  console.info(JSON.stringify({
    category,
    gameId: context.gameId,
    chainIds: context.chainIds,
    reason: context.reason,
  }));
}
