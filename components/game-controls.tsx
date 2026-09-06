"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { startRoomGame, submitTurn, type FormState } from "@/app/actions";
import type { PlayableEntryType } from "@/domain/game";
import { DrawingPlaceholderInput } from "./drawing/drawing-placeholder-input";

const initialState: FormState = {};

function ActionButton({ idleLabel, pendingLabel }: { idleLabel: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="min-h-12 w-full rounded-2xl bg-[var(--ink)] px-5 py-3 font-black text-white shadow-[0_5px_0_#ff6b4a] transition active:translate-y-1 active:shadow-none disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

export function StartGameForm({ roomCode }: { roomCode: string }) {
  const [state, action] = useActionState(startRoomGame, initialState);
  return (
    <form action={action} className="space-y-3">
      <input name="roomCode" type="hidden" value={roomCode} />
      {state.error && <p className="text-center text-sm font-semibold text-red-700">{state.error}</p>}
      <ActionButton idleLabel="Comenzar partida" pendingLabel="Comenzando…" />
    </form>
  );
}

interface TurnFormProps {
  roomCode: string;
  roundNumber: number;
  entryType: PlayableEntryType;
  previousText?: string;
}

export function TurnForm({ roomCode, roundNumber, entryType, previousText }: TurnFormProps) {
  const [state, action] = useActionState(submitTurn, initialState);
  return (
    <form action={action} className="space-y-4">
      <input name="roomCode" type="hidden" value={roomCode} />
      <input name="roundNumber" type="hidden" value={roundNumber} />
      <input name="entryType" type="hidden" value={entryType} />

      {entryType === "drawing" ? (
        <DrawingPlaceholderInput describedText={previousText ?? ""} />
      ) : (
        <div className="space-y-3">
          {roundNumber === 0 ? (
            <p className="rounded-2xl bg-[var(--mint)]/60 p-4 font-bold">
              Escribí una frase divertida, concreta y fácil de imaginar.
            </p>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-[var(--ink)] bg-[var(--cream)] p-5 text-center">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">Interpretá este dibujo</p>
              <p className="mt-2 text-xl font-black">🎨 {previousText}</p>
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

      {state.error && <p className="text-sm font-semibold text-red-700">{state.error}</p>}
      <ActionButton idleLabel="Enviar" pendingLabel="Enviando…" />
    </form>
  );
}

export function RefreshGameButton() {
  const router = useRouter();
  return (
    <button
      className="mt-5 rounded-2xl border-2 border-[var(--ink)] bg-white px-5 py-3 font-bold"
      onClick={() => router.refresh()}
      type="button"
    >
      Actualizar estado
    </button>
  );
}
