"use client";

import { useActionState, useEffect } from "react";
import { changeRevealStep, type FormState } from "@/app/actions";
import { GAME_ACTION_PENDING_EVENT } from "@/lib/game-client-events";

export function RevealControls({ roomCode, step, total }: {
  roomCode: string;
  step: number | null;
  total: number;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(changeRevealStep, {});
  const summary = step === null || step >= total;
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(GAME_ACTION_PENDING_EVENT, { detail: { pending } }));
    return () => {
      window.dispatchEvent(new CustomEvent(GAME_ACTION_PENDING_EVENT, { detail: { pending: false } }));
    };
  }, [pending]);
  const buttonClass = "min-h-12 rounded-2xl border-2 border-[var(--ink)] px-4 py-3 text-sm font-black disabled:opacity-40";
  return (
    <form action={action} className="mt-5 space-y-3">
      <input type="hidden" name="roomCode" value={roomCode} />
      <input type="hidden" name="expectedStep" value={step ?? "summary"} />
      <div className="flex flex-wrap justify-center gap-3">
        {summary ? (
          <button className={buttonClass} disabled={pending || total === 0} name="step" value={-1}>
            Volver a presentar
          </button>
        ) : (
          <>
            <button className={buttonClass} disabled={pending || step < 0} name="step" value={step - 1}>
              ← Anterior
            </button>
            <button className={`${buttonClass} bg-[var(--ink)] text-white`} disabled={pending} name="step" value={step + 1}>
              {step < 0 ? "Revelar primera carta" : step + 1 === total ? "Ver resumen y premios" : "Siguiente carta →"}
            </button>
            {step + 1 < total && (
              <button className={`${buttonClass} bg-white`} disabled={pending} name="step" value={total}>
                Mostrar todo
              </button>
            )}
          </>
        )}
      </div>
      <p aria-live="polite" className="text-center text-sm text-slate-600">
        {pending ? "Sincronizando…" : "Vos elegís cuándo revelar cada carta para todos."}
      </p>
      {state.error && <p role="alert" className="text-center text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
