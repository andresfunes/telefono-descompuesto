"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GAME_ACTION_PENDING_EVENT } from "@/lib/game-client-events";
import { createClient } from "@/lib/supabase/client";

import { createRealtimeRefreshQueue } from "@/lib/realtime-refresh-queue";

type ConnectionState = "connecting" | "connected" | "disconnected";
type RealtimeStatus = "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR";

export function GameRealtime({ gameId }: { gameId: string }) {
  const router = useRouter();
  const [refreshPending, startRefresh] = useTransition();
  const queueRef = useRef<ReturnType<typeof createRealtimeRefreshQueue> | null>(null);

  useEffect(() => {
    if (!refreshPending) queueRef.current?.complete();
  }, [refreshPending]);
  const [connection, setConnection] = useState<ConnectionState>("connecting");

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | undefined;

    const queue = createRealtimeRefreshQueue(() => startRefresh(() => router.refresh()));
    queueRef.current = queue;
    const refreshGame = () => queue.request();

    const handleActionPending = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as { pending?: unknown };
      queue.setActionPending(detail.pending === true);
    };

    window.addEventListener(GAME_ACTION_PENDING_EVENT, handleActionPending);

    const subscribe = async () => {
      await supabase.realtime.setAuth();
      if (!active) return;

      channel = supabase
        .channel(`game:${gameId}`, { config: { private: true } })
        .on("broadcast", { event: "GAME_CHANGED" }, refreshGame)
        .subscribe((status: RealtimeStatus) => {
          if (!active) return;
          if (status === "SUBSCRIBED") {
            setConnection("connected");
            refreshGame();
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            setConnection("disconnected");
          } else {
            setConnection("connecting");
          }
        });
    };

    void subscribe().catch(() => {
      if (active) setConnection("disconnected");
    });
    return () => {
      active = false;
      window.removeEventListener(GAME_ACTION_PENDING_EVENT, handleActionPending);
      queue.dispose();
      if (queueRef.current === queue) queueRef.current = null;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [gameId, router, startRefresh]);

  return (
    <span
      aria-live="polite"
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500"
    >
      <span
        className={`size-2 rounded-full ${
          connection === "connected"
            ? "bg-emerald-500"
            : connection === "connecting"
              ? "animate-pulse bg-amber-500"
              : "bg-red-500"
        }`}
      />
      {connection === "connected"
        ? "En vivo"
        : connection === "connecting"
          ? "Conectando…"
          : "Reconectando…"}
    </span>
  );
}
