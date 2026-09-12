"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { startRoomGame, submitTurn, type FormState } from "@/app/actions";
import type { PlayableEntryType } from "@/domain/game";
import { GAME_ACTION_PENDING_EVENT } from "@/lib/game-client-events";
import type { DrawingCanvasHandle } from "./drawing/drawing-canvas";

const DrawingCanvas = dynamic(() => import("./drawing/drawing-canvas"), {
  ssr: false,
  loading: () => (
    <div className="grid aspect-4/3 w-full place-items-center rounded-2xl border-2 border-dashed border-slate-300 bg-white text-sm text-slate-500">
      Preparando el lienzo…
    </div>
  ),
});

const initialState: FormState = {};

function ActionButton({
  idleLabel,
  pendingLabel,
  disabled = false,
}: {
  idleLabel: string;
  pendingLabel: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(GAME_ACTION_PENDING_EVENT, { detail: { pending } }),
    );
    return () => {
      if (pending) {
        window.dispatchEvent(
          new CustomEvent(GAME_ACTION_PENDING_EVENT, { detail: { pending: false } }),
        );
      }
    };
  }, [pending]);

  return (
    <button
      className="min-h-12 w-full rounded-2xl bg-[var(--ink)] px-5 py-3 font-black text-white shadow-[0_5px_0_#ff6b4a] transition active:translate-y-1 active:shadow-none disabled:opacity-60"
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

export function StartGameForm({
  roomCode,
  hasMinimumPlayers,
}: {
  roomCode: string;
  hasMinimumPlayers: boolean;
}) {
  const [state, action] = useActionState(startRoomGame, initialState);
  return (
    <form action={action} className="space-y-3">
      <input name="roomCode" type="hidden" value={roomCode} />
      {!hasMinimumPlayers && (
        <p className="text-center text-sm font-semibold text-slate-600" role="status">
          Esperando a que se una al menos 1 jugador más…
        </p>
      )}
      {state.error && <p className="text-center text-sm font-semibold text-red-700">{state.error}</p>}
      <ActionButton
        disabled={!hasMinimumPlayers}
        idleLabel="Comenzar partida"
        pendingLabel="Comenzando…"
      />
    </form>
  );
}

interface TurnFormProps {
  roomCode: string;
  roundNumber: number;
  entryType: PlayableEntryType;
  previousText?: string;
  previousDrawingUrl?: string;
}

export function TurnForm({
  roomCode,
  roundNumber,
  entryType,
  previousText,
  previousDrawingUrl,
}: TurnFormProps) {
  const [state, action] = useActionState(submitTurn, initialState);
  const [drawingError, setDrawingError] = useState<string>();
  const drawingCanvasRef = useRef<DrawingCanvasHandle>(null);
  const drawingValueRef = useRef<HTMLInputElement>(null);

  const prepareDrawingSubmission = (event: FormEvent<HTMLFormElement>) => {
    if (entryType !== "drawing") return;
    const png = drawingCanvasRef.current?.exportPng();
    if (!png || !drawingValueRef.current) {
      event.preventDefault();
      setDrawingError("Hacé un dibujo antes de enviarlo.");
      return;
    }
    drawingValueRef.current.value = png;
    setDrawingError(undefined);
  };

  return (
    <form action={action} className="space-y-4" onSubmitCapture={prepareDrawingSubmission}>
      <input name="roomCode" type="hidden" value={roomCode} />
      <input name="roundNumber" type="hidden" value={roundNumber} />
      <input name="entryType" type="hidden" value={entryType} />

      {entryType === "drawing" ? (
        <div className="space-y-4">
          <div className="rounded-2xl bg-[var(--mint)]/60 px-4 py-3 text-center">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Dibujá esto</p>
            <p className="mt-1 text-lg font-black">“{previousText}”</p>
          </div>
          <DrawingCanvas ref={drawingCanvasRef} />
          <input name="value" ref={drawingValueRef} type="hidden" />
        </div>
      ) : (
        <div className="space-y-3">
          {roundNumber === 0 ? (
            <p className="rounded-2xl bg-[var(--mint)]/60 p-4 font-bold">
              Escribí una frase divertida, concreta y fácil de imaginar.
            </p>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-[var(--ink)] bg-[var(--cream)] p-4 text-center">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">Interpretá este dibujo</p>
              {previousDrawingUrl ? (
                <Image
                  alt="Dibujo recibido para interpretar"
                  className="mt-3 h-auto w-full rounded-xl border border-slate-200 bg-white object-contain"
                  height={720}
                  src={previousDrawingUrl}
                  unoptimized
                  width={960}
                />
              ) : (
                <p className="mt-3 text-sm text-slate-500">No se pudo cargar el dibujo.</p>
              )}
            </div>
          )}
          <label className="block text-sm font-bold" htmlFor="text-entry">
            {roundNumber === 0 ? "Tu frase original" : "¿Qué representa?"}
          </label>
          <textarea
            autoFocus
            className="min-h-32 w-full resize-none rounded-2xl border-2 border-[var(--ink)] bg-white p-4 outline-none focus:ring-4 focus:ring-[var(--mint)]"
            id="text-entry"
            maxLength={240}
            name="value"
            placeholder={roundNumber === 0 ? "Messi haciendo un asado…" : "Un hombre cocinando una vaca…"}
            required
          />
        </div>
      )}

      {(drawingError || state.error) && (
        <p className="text-sm font-semibold text-red-700">{drawingError ?? state.error}</p>
      )}
      <ActionButton
        idleLabel={entryType === "drawing" ? "Terminé mi dibujo" : "Enviar"}
        pendingLabel="Enviando…"
      />
    </form>
  );
}
