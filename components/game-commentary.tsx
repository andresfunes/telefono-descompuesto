"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  generateCommentary,
  type CommentaryFormState,
} from "@/app/actions";

const initialState: CommentaryFormState = {};

function GenerateButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="min-h-12 w-full rounded-2xl bg-[var(--ink)] px-5 py-3 font-bold text-white shadow-[0_5px_0_#ff6b4a] transition active:translate-y-1 active:shadow-none disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Preparando el veredicto…" : "Generar comentarios con IA"}
    </button>
  );
}

export function GameCommentary({
  roomCode,
  canGenerate,
  initialComments,
}: {
  roomCode: string;
  canGenerate: boolean;
  initialComments: string[];
}) {
  const [state, action] = useActionState(generateCommentary, initialState);
  const comments = state.comments ?? initialComments;

  return (
    <aside className="mb-8 rounded-[1.5rem] border-2 border-[var(--ink)] bg-[var(--mint)]/60 p-5">
      <h3 className="text-xl font-black">El veredicto</h3>
      {comments.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {comments.map((comment, index) => (
            <li className="rounded-2xl bg-white p-4 font-semibold shadow-sm" key={`${index}-${comment}`}>
              {comment}
            </li>
          ))}
        </ul>
      ) : canGenerate ? (
        <form action={action} className="mt-4 space-y-3">
          <input name="roomCode" type="hidden" value={roomCode} />
          <label className="block text-sm font-bold" htmlFor="humor-intensity">
            Intensidad del humor
          </label>
          <select
            className="min-h-12 w-full rounded-2xl border-2 border-[var(--ink)] bg-white px-4 font-semibold"
            defaultValue="STANDARD"
            id="humor-intensity"
            name="intensity"
          >
            <option value="GENTLE">Suave</option>
            <option value="STANDARD">Ácido</option>
            <option value="STRONG">Sin piedad</option>
          </select>
          <p className="text-xs text-slate-600">
            Al generarlos, los nombres, textos y dibujos de esta partida se envían a OpenAI.
          </p>
          {state.error && <p className="text-sm font-semibold text-red-700">{state.error}</p>}
          <GenerateButton />
        </form>
      ) : (
        <p className="mt-3 text-sm font-semibold text-slate-600">
          Solo quien creó la partida puede generar los comentarios.
        </p>
      )}
    </aside>
  );
}
