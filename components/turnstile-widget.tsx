"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      appearance: "interaction-only";
      execution: "render";
      language: string;
      size: "flexible";
      callback(token: string): void;
      "expired-callback"(): void;
      "error-callback"(): void;
    },
  ): string;
  remove(widgetId: string): void;
  reset(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function TurnstileWidget({
  onToken,
  resetSignal,
  action,
  unavailableMessage = "La verificación no está disponible en este momento.",
}: {
  onToken(token: string): void;
  resetSignal: unknown;
  action: string;
  unavailableMessage?: string;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string>(undefined);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const renderWidget = useCallback(() => {
    if (!siteKey || !containerRef.current || !window.turnstile || widgetIdRef.current) {
      return;
    }
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      action,
      appearance: "interaction-only",
      execution: "render",
      language: "es",
      size: "flexible",
      callback: (token) => {
        onToken(token);
        setStatus("ready");
      },
      "expired-callback": () => {
        onToken("");
        setStatus("loading");
      },
      "error-callback": () => {
        onToken("");
        setStatus("error");
      },
    });
  }, [action, onToken, siteKey]);

  useEffect(() => {
    return () => {
      if (widgetIdRef.current) window.turnstile?.remove(widgetIdRef.current);
    };
  }, []);

  useEffect(() => {
    if (!widgetIdRef.current || !resetSignal) return;
    onToken("");
    setStatus("loading");
    window.turnstile?.reset(widgetIdRef.current);
  }, [onToken, resetSignal]);

  if (!siteKey) {
    return (
      <p className="text-sm font-semibold text-slate-600">
        {unavailableMessage}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Script
        onError={() => setStatus("error")}
        onLoad={renderWidget}
        onReady={renderWidget}
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
      />
      <div ref={containerRef} />
      {status === "loading" && (
        <p className="text-xs font-semibold text-slate-500">Verificando que seas humano…</p>
      )}
      {status === "error" && (
        <p className="text-sm font-semibold text-red-700">
          La verificación no está disponible. Podés seguir viendo la partida normalmente.
        </p>
      )}
    </div>
  );
}
