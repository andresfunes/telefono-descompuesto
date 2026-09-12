"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { createRematch, joinRematch, type FormState } from "@/app/actions";

const initialState: FormState = {};

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="min-h-12 w-full rounded-2xl bg-[var(--ink)] px-5 py-3 font-black text-white shadow-[0_5px_0_#ff6b4a] transition active:translate-y-1 active:shadow-none disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export function RematchControls({
  roomCode,
  rematchCode,
  hostName,
  currentPlayerName,
  isHost,
}: {
  roomCode: string;
  rematchCode: string | null;
  hostName: string;
  currentPlayerName: string;
  isHost: boolean;
}) {
  const [createState, createAction] = useActionState(createRematch, initialState);
  const [joinState, joinAction] = useActionState(joinRematch, initialState);
  const [dismissedRematchCode, setDismissedRematchCode] = useState<string | null>(null);
  const modalTitleId = useId();
  const showInvitationModal = Boolean(
    rematchCode && !isHost && dismissedRematchCode !== rematchCode,
  );

  useEffect(() => {
    if (!showInvitationModal) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setDismissedRematchCode(rematchCode);
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [rematchCode, showInvitationModal]);

  if (rematchCode && !isHost) {
    if (!showInvitationModal) {
      return (
        <aside className="mt-8 rounded-[1.5rem] border-2 border-[var(--ink)] bg-[var(--mint)] p-5 shadow-[5px_5px_0_var(--ink)]">
          <p className="text-sm font-black uppercase tracking-widest">Nueva partida</p>
          <h3 className="mt-1 text-xl font-black">
            {hostName} creó la sala {rematchCode}
          </h3>
          <p className="mb-4 mt-1 text-sm text-slate-700">
            Sumate con el mismo nombre: {currentPlayerName}.
          </p>
          <form action={joinAction} className="space-y-3">
            <input name="roomCode" type="hidden" value={roomCode} />
            {joinState.error && (
              <p className="text-sm font-semibold text-red-700">{joinState.error}</p>
            )}
            <SubmitButton label="Unirme a la nueva partida" pendingLabel="Entrando…" />
          </form>
        </aside>
      );
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[rgba(18,36,31,0.55)] p-4 backdrop-blur-sm">
        <section
          aria-labelledby={modalTitleId}
          aria-modal="true"
          className="relative w-full max-w-md rounded-[1.5rem] border-2 border-[var(--ink)] bg-[var(--mint)] p-6 shadow-[7px_8px_0_var(--ink)]"
          role="dialog"
        >
          <button
            aria-label="Cerrar invitación"
            className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full border-2 border-[var(--ink)] bg-white text-2xl font-black leading-none transition hover:bg-[var(--cream)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            onClick={() => setDismissedRematchCode(rematchCode)}
            type="button"
          >
            ×
          </button>
          <div aria-live="polite" role="status">
            <p className="pr-12 text-sm font-black uppercase tracking-widest">
              Nueva partida
            </p>
            <h3 className="mt-1 pr-12 text-2xl font-black" id={modalTitleId}>
              {hostName} creó la sala {rematchCode}
            </h3>
          </div>
          <p className="mb-5 mt-2 text-sm text-slate-700">
            Podés sumarte con el mismo nombre: {currentPlayerName}.
          </p>
          <form action={joinAction} className="space-y-3">
            <input name="roomCode" type="hidden" value={roomCode} />
            {joinState.error && (
              <p className="text-sm font-semibold text-red-700">{joinState.error}</p>
            )}
            <SubmitButton label="Unirme a la nueva partida" pendingLabel="Entrando…" />
          </form>
        </section>
      </div>
    );
  }

  if (rematchCode) {
    return (
      <aside className="mt-8 rounded-[1.5rem] border-2 border-[var(--ink)] bg-[var(--mint)] p-5 shadow-[5px_5px_0_var(--ink)]">
        <p className="text-sm font-black uppercase tracking-widest">Nueva partida</p>
        <h3 className="mt-1 text-xl font-black">La nueva sala ya está lista.</h3>
        <Link
          className="mt-4 block min-h-12 rounded-2xl bg-[var(--ink)] px-5 py-3 text-center font-black text-white shadow-[0_5px_0_#ff6b4a]"
          href={`/${rematchCode}`}
        >
          Ir a la nueva sala
        </Link>
      </aside>
    );
  }

  if (!isHost) return null;

  return (
    <aside className="mt-8 rounded-[1.5rem] border-2 border-[var(--ink)] bg-[var(--mint)] p-5">
      <h3 className="text-xl font-black">¿Otra partida?</h3>
      <p className="mb-4 mt-1 text-sm text-slate-700">
        Creá una sala nueva e invitaremos a quienes jugaron esta partida.
      </p>
      <form action={createAction} className="space-y-3">
        <input name="roomCode" type="hidden" value={roomCode} />
        {createState.error && (
          <p className="text-sm font-semibold text-red-700">{createState.error}</p>
        )}
        <SubmitButton label="Crear nueva partida" pendingLabel="Creando…" />
      </form>
    </aside>
  );
}
