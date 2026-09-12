"use client";

import { useActionState, useCallback, useState } from "react";
import { useFormStatus } from "react-dom";
import { createGame, joinGame, type FormState } from "@/app/actions";
import { TURNSTILE_JOIN_ACTION } from "@/lib/ai/turnstile-action";
import { ROOM_CODE_LENGTH } from "@/domain/game";
import { TurnstileWidget } from "./turnstile-widget";

const initialState: FormState = {};

function SubmitButton({
  idleLabel,
  pendingLabel,
  disabled = false,
}: {
  idleLabel: string;
  pendingLabel: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className="min-h-12 w-full rounded-2xl bg-[var(--ink)] px-5 py-3 font-bold text-white shadow-[0_5px_0_#ff6b4a] transition active:translate-y-1 active:shadow-none disabled:opacity-60"
      disabled={pending || disabled}
      type="submit"
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

export function CreateGameForm() {
  const [state, action] = useActionState(createGame, initialState);
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm font-bold" htmlFor="create-player-name">
        Tu nombre
      </label>
      <input
        className="min-h-12 w-full rounded-2xl border-2 border-[var(--ink)] bg-white px-4 outline-none focus:ring-4 focus:ring-[var(--mint)]"
        id="create-player-name"
        name="playerName"
        placeholder="Ej. Sofi"
        required
        maxLength={24}
      />
      {state.error && <p className="text-sm font-semibold text-red-700">{state.error}</p>}
      <SubmitButton idleLabel="Crear partida" pendingLabel="Creando…" />
    </form>
  );
}

export function JoinGameForm({ defaultCode = "" }: { defaultCode?: string }) {
  const [state, action] = useActionState(joinGame, initialState);
  const [turnstileToken, setTurnstileToken] = useState("");
  const handleToken = useCallback((token: string) => setTurnstileToken(token), []);
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm font-bold" htmlFor="room-code">
        Código de sala
      </label>
      <input
        autoCapitalize="characters"
        className="min-h-12 w-full rounded-2xl border-2 border-[var(--ink)] bg-white px-4 font-mono text-lg uppercase tracking-[0.25em] outline-none focus:ring-4 focus:ring-[var(--mint)]"
        defaultValue={defaultCode}
        id="room-code"
        name="roomCode"
        placeholder="ABC234"
        required
        minLength={4}
        maxLength={ROOM_CODE_LENGTH}
      />
      <label className="block text-sm font-bold" htmlFor="join-player-name">
        Tu nombre
      </label>
      <input
        className="min-h-12 w-full rounded-2xl border-2 border-[var(--ink)] bg-white px-4 outline-none focus:ring-4 focus:ring-[var(--mint)]"
        id="join-player-name"
        name="playerName"
        placeholder="Ej. Nico"
        required
        maxLength={24}
      />
      {state.challengeRequired && (
        <TurnstileWidget
          action={TURNSTILE_JOIN_ACTION}
          onToken={handleToken}
          resetSignal={state}
          unavailableMessage="No podemos verificar el ingreso en este momento. Probá de nuevo más tarde."
        />
      )}
      <input name="turnstileToken" type="hidden" value={turnstileToken} />
      {state.error && <p className="text-sm font-semibold text-red-700">{state.error}</p>}
      <SubmitButton
        disabled={state.challengeRequired === true && !turnstileToken}
        idleLabel="Entrar a la sala"
        pendingLabel="Entrando…"
      />
    </form>
  );
}
