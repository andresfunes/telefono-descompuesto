export interface FunnelSummary {
  roomsCreated: number;
  playersJoined: number;
  gamesStarted: number;
  gamesFinished: number;
  rematchesCreated: number;
  startConversion: number;
  finishConversion: number;
  rematchConversion: number;
  averageStartedPlayers: number;
}

export interface DailyFunnelCounts {
  date: string;
  roomCreated: number;
  roomJoined: number;
  gameStarted: number;
  firstSubmission: number;
  gameFinished: number;
  rematchCreated: number;
}

export interface FunnelMetrics {
  summary: FunnelSummary;
  daily: DailyFunnelCounts[];
}

export interface ProductAnalyticsStore {
  getFunnelMetrics(days?: number): Promise<FunnelMetrics>;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Métricas de producto inválidas: ${label}.`);
  }
  return value as Record<string, unknown>;
}

function finiteNumber(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Métricas de producto inválidas: ${key}.`);
  }
  return value;
}

function dateString(row: Record<string, unknown>): string {
  const value = row.date;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Métricas de producto inválidas: date.");
  }
  return value;
}

export function parseFunnelMetrics(value: unknown): FunnelMetrics {
  const root = record(value, "root");
  const summary = record(root.summary, "summary");
  if (!Array.isArray(root.daily)) {
    throw new Error("Métricas de producto inválidas: daily.");
  }

  return {
    summary: {
      roomsCreated: finiteNumber(summary, "rooms_created"),
      playersJoined: finiteNumber(summary, "players_joined"),
      gamesStarted: finiteNumber(summary, "games_started"),
      gamesFinished: finiteNumber(summary, "games_finished"),
      rematchesCreated: finiteNumber(summary, "rematches_created"),
      startConversion: finiteNumber(summary, "start_conversion"),
      finishConversion: finiteNumber(summary, "finish_conversion"),
      rematchConversion: finiteNumber(summary, "rematch_conversion"),
      averageStartedPlayers: finiteNumber(summary, "average_started_players"),
    },
    daily: root.daily.map((value) => {
      const day = record(value, "daily item");
      return {
        date: dateString(day),
        roomCreated: finiteNumber(day, "room_created"),
        roomJoined: finiteNumber(day, "room_joined"),
        gameStarted: finiteNumber(day, "game_started"),
        firstSubmission: finiteNumber(day, "first_submission"),
        gameFinished: finiteNumber(day, "game_finished"),
        rematchCreated: finiteNumber(day, "rematch_created"),
      };
    }),
  };
}
