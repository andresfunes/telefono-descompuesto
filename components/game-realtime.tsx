"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ConnectionState = "connecting" | "connected" | "disconnected";
type RealtimeStatus = "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR";

export function GameRealtime({ gameId }: { gameId: string }) {
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [connection, setConnection] = useState<ConnectionState>("connecting");

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | undefined;

    const refreshGame = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        startTransition(() => router.refresh());
      }, 80);
    };

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

    void subscribe();
    return () => {
      active = false;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [gameId, router]);

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
