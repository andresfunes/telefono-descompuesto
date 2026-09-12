import "server-only";

export interface CommentaryProtectionConfig {
  enabled: boolean;
  turnstileSecretKey: string | null;
  userPerHour: number;
  ipPerHour: number;
  gameTotal: number;
  dailyGlobalLimit: number;
}

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export function getCommentaryProtectionConfig(): CommentaryProtectionConfig {
  return {
    enabled: process.env.AI_ENABLED?.toLowerCase() !== "false",
    turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY?.trim() || null,
    userPerHour: positiveInteger("AI_RATE_LIMIT_USER_PER_HOUR", 10),
    ipPerHour: positiveInteger("AI_RATE_LIMIT_IP_PER_HOUR", 20),
    gameTotal: positiveInteger("AI_RATE_LIMIT_GAME_TOTAL", 5),
    dailyGlobalLimit: positiveInteger("AI_DAILY_GLOBAL_LIMIT", 1_000),
  };
}
