"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createGame, joinGame, type FormState } from "@/app/actions";

const initialState: FormState = {};

function SubmitButton({ idleLabel, pendingLabel }: { idleLabel: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="min-h-12 w-full rounded-2xl bg-[var(--ink)] px-5 py-3 font-bold text-white shadow-[0_5px_0_#ff6b4a] transition active:translate-y-1 active:shadow-none disabled:opacity-60"
      disabled={pending}
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
        placeholder="ABCD"
        required
        maxLength={4}
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
      {state.error && <p className="text-sm font-semibold text-red-700">{state.error}</p>}
      <SubmitButton idleLabel="Entrar a la sala" pendingLabel="Entrando…" />
    </form>
  );
}
