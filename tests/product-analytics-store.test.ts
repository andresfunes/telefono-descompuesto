import { describe, expect, it } from "vitest";
import { parseFunnelMetrics } from "@/repositories/product-analytics-store";

const response = {
  summary: {
    rooms_created: 10,
    players_joined: 28,
    games_started: 7,
    games_finished: 5,
    rematches_created: 2,
    start_conversion: 70,
    finish_conversion: 71.4,
    rematch_conversion: 40,
    average_started_players: 4,
  },
  daily: [
    {
      date: "2026-09-12",
      room_created: 3,
      room_joined: 8,
      game_started: 2,
      first_submission: 2,
      game_finished: 1,
      rematch_created: 1,
    },
  ],
};

describe("product analytics query parsing", () => {
  it("maps the controlled database response", () => {
    expect(parseFunnelMetrics(response)).toEqual({
      summary: {
        roomsCreated: 10,
        playersJoined: 28,
        gamesStarted: 7,
        gamesFinished: 5,
        rematchesCreated: 2,
        startConversion: 70,
        finishConversion: 71.4,
        rematchConversion: 40,
        averageStartedPlayers: 4,
      },
      daily: [
        {
          date: "2026-09-12",
          roomCreated: 3,
          roomJoined: 8,
          gameStarted: 2,
          firstSubmission: 2,
          gameFinished: 1,
          rematchCreated: 1,
        },
      ],
    });
  });

  it("rejects malformed or negative metrics", () => {
    expect(() => parseFunnelMetrics({ ...response, daily: "invalid" }))
      .toThrow("daily");
    expect(() => parseFunnelMetrics({
      ...response,
      summary: { ...response.summary, games_started: -1 },
    })).toThrow("games_started");
    expect(() => parseFunnelMetrics({
      ...response,
      daily: [{ ...response.daily[0], date: "12/09/2026" }],
    })).toThrow("date");
  });
});
