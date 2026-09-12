"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  buildGameInvitationUrl,
  buildWhatsAppInvitationUrl,
} from "@/lib/game-invitation";

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Use the fallback below for browsers that deny the Clipboard API.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("No se pudo copiar el enlace.");
}

const subscribeToOrigin = () => () => undefined;

export function RoomInvitation({ roomCode }: { roomCode: string }) {
  const feedbackTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const invitationUrl = useSyncExternalStore(
    subscribeToOrigin,
    () => buildGameInvitationUrl(window.location.origin, roomCode),
    () => "",
  );

  useEffect(() => {
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, [roomCode]);

  const handleCopy = async () => {
    if (!invitationUrl) return;
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    try {
      await copyText(invitationUrl);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
    feedbackTimer.current = setTimeout(() => setCopyStatus("idle"), 2500);
  };

  const whatsappUrl = invitationUrl
    ? buildWhatsAppInvitationUrl(invitationUrl, roomCode)
    : undefined;

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border-2 border-[var(--ink)] bg-[var(--mint)]/45 p-4 sm:p-5">
      <h2 className="text-xl font-black">Invitá a tus amigos</h2>
      <p className="mt-1 text-sm text-slate-700">
        Que escaneen el QR o mandales el enlace de la sala.
      </p>

      <div className="mt-4 flex min-w-0 flex-col items-center gap-4 sm:grid sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-5">
        <div className="grid size-48 shrink-0 place-items-center justify-self-center overflow-hidden rounded-2xl bg-[var(--cream)] shadow-sm">
          {invitationUrl ? (
            <QRCodeSVG
              bgColor="#fff8e9"
              className="size-full"
              fgColor="#18231f"
              level="M"
              marginSize={4}
              title={`QR para unirse a la sala ${roomCode}`}
              value={invitationUrl}
            />
          ) : (
            <span className="text-sm font-bold text-slate-500">Preparando QR…</span>
          )}
        </div>

        <div className="w-full min-w-0 space-y-4">
          <div className="flex w-full min-w-0 items-center overflow-hidden rounded-xl bg-white/80 shadow-sm">
            <p
              className="min-w-0 flex-1 truncate px-3 py-2 text-sm font-semibold"
              title={invitationUrl}
            >
              {invitationUrl || `/${roomCode}`}
            </p>
            <button
              aria-label={copyStatus === "copied" ? "Enlace copiado" : "Copiar enlace"}
              className="grid size-11 shrink-0 place-items-center bg-[var(--ink)] text-white transition hover:bg-slate-700 disabled:opacity-60"
              disabled={!invitationUrl}
              onClick={handleCopy}
              title={copyStatus === "copied" ? "Enlace copiado" : "Copiar enlace"}
              type="button"
            >
              {copyStatus === "copied" ? (
                <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24">
                  <path d="m5 12 4 4L19 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
                </svg>
              ) : (
                <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24">
                  <rect height="13" rx="2" stroke="currentColor" strokeWidth="2" width="13" x="8" y="8" />
                  <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
                </svg>
              )}
            </button>
          </div>

          <div className="flex items-center justify-center gap-3 sm:justify-start">
            <a
              aria-disabled={!whatsappUrl}
              aria-label="Compartir por WhatsApp"
              className="grid size-12 shrink-0 place-items-center rounded-full bg-[#25D366] text-white shadow-sm transition hover:scale-105 hover:brightness-95 aria-disabled:pointer-events-none aria-disabled:opacity-60"
              href={whatsappUrl}
              rel="noreferrer"
              target="_blank"
              title="Compartir por WhatsApp"
            >
              <svg aria-hidden="true" className="size-7" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35m-5.42 7.4h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26C2.16 6.44 6.6 2 12.05 2a9.82 9.82 0 0 1 7.02 2.91 9.83 9.83 0 0 1 2.9 7.02c0 5.45-4.44 9.88-9.89 9.88m8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89a11.82 11.82 0 0 0-3.48-8.42Z" />
              </svg>
            </a>
            <p aria-live="polite" className="text-sm font-semibold">
              {copyStatus === "copied"
                ? "¡Enlace copiado!"
                : copyStatus === "error"
                  ? "No pudimos copiarlo. Probá de nuevo."
                  : ""}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
