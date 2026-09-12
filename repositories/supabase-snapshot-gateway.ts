import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  rpcFailure,
  serializeChains,
  serializeEntries,
  type GameSnapshotGateway,
  type JoinGameGatewayResult,
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

  async joinGame(
    code: string,
    authUserId: string,
    playerName: string,
    protection: { ipHash: string; challengeVerified: boolean },
  ): Promise<JoinGameGatewayResult> {
    const { data, error } = await createAdminClient().rpc("join_game", {
      p_auth_user_id: authUserId,
      p_challenge_verified: protection.challengeVerified,
      p_code: code,
      p_ip_hash: protection.ipHash,
      p_player_name: playerName,
    });
    if (error) throw error;
    if (
      data !== "joined" &&
      data !== "unavailable" &&
      data !== "name_taken" &&
      data !== "challenge_required" &&
      data !== "rate_limited"
    ) {
      throw new Error("Supabase devolvió un resultado de unión inválido.");
    }
    return data;
  }

  async loadGame(code: string): Promise<unknown | null> {
    const { data, error } = await createAdminClient().rpc("load_game_snapshot", {
      p_code: code,
    });
    if (error) throw rpcFailure(error);
    return data;
  }

  async loadGameForUser(code: string, authUserId: string): Promise<unknown | null> {
    const { data, error } = await createAdminClient().rpc("load_game_snapshot_for_user", {
      p_auth_user_id: authUserId,
      p_code: code,
    });
    if (error) throw rpcFailure(error);
    return data;
  }

  async setLobbyLocked(
    code: string,
    authUserId: string,
    locked: boolean,
  ): Promise<void> {
    const { error } = await createAdminClient().rpc("set_game_lobby_locked", {
      p_auth_user_id: authUserId,
      p_code: code,
      p_locked: locked,
    });
    if (error) throw error;
  }

  async removePlayer(code: string, authUserId: string, playerId: string): Promise<void> {
    const { error } = await createAdminClient().rpc("remove_game_player", {
      p_auth_user_id: authUserId,
      p_code: code,
      p_player_id: playerId,
    });
    if (error) throw error;
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
