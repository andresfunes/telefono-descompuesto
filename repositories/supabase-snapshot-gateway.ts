import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  rpcFailure,
  serializeChains,
  serializeEntries,
  type GameSnapshotGateway,
  type PersistedGameCommit,
} from "./supabase-game-repository";

export class SupabaseSnapshotGateway implements GameSnapshotGateway {
  async createGameWithHost(
    code: string,
    authUserId: string,
    playerName: string,
  ): Promise<void> {
    const { error } = await createAdminClient().rpc("create_game_with_host", {
      p_auth_user_id: authUserId,
      p_code: code,
      p_player_name: playerName,
    });
    if (error) throw error;
  }

  async createRematch(
    sourceCode: string,
    authUserId: string,
    newCode: string,
  ): Promise<string> {
    const { data, error } = await createAdminClient().rpc("create_game_rematch", {
      p_auth_user_id: authUserId,
      p_new_code: newCode,
      p_source_code: sourceCode,
    });
    if (error) throw error;
    if (typeof data !== "string") throw new Error("Supabase no devolvió la nueva sala.");
    return data;
  }

  async joinGame(code: string, authUserId: string, playerName: string): Promise<void> {
    const { error } = await createAdminClient().rpc("join_game", {
      p_auth_user_id: authUserId,
      p_code: code,
      p_player_name: playerName,
    });
    if (error) throw error;
  }

  async loadGame(code: string): Promise<unknown | null> {
    const { data, error } = await createAdminClient().rpc("load_game_snapshot", {
      p_code: code,
    });
    if (error) throw rpcFailure(error);
    return data;
  }

  async commitGame({ game, expectedVersion, event }: PersistedGameCommit): Promise<boolean> {
    const { data, error } = await createAdminClient().rpc("commit_game_snapshot", {
      p_chains: serializeChains(game.chains),
      p_current_entry_type: game.currentRound?.expectedEntryType ?? null,
      p_current_round: game.currentRound?.number ?? null,
      p_entries: serializeEntries(game.chains),
      p_event: event,
      p_expected_version: expectedVersion,
      p_game_id: game.id,
      p_phase: game.phase,
    });
    if (error) throw rpcFailure(error);
    return typeof data === "number";
  }
}
