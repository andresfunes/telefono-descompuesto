"use client";

import { track } from "@vercel/analytics";
import {
  Children,
  useActionState,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import {
  generateCommentary,
  type CommentaryFormState,
} from "@/app/actions";
import {
  deserializeGameCommentaryItem,
  isGameAwardComment,
} from "@/domain/game-commentary";
import { TurnstileWidget } from "./turnstile-widget";
import { TURNSTILE_COMMENTARY_ACTION } from "@/lib/ai/turnstile-action";

const initialState: CommentaryFormState = {};

function GenerateButton({ verified }: { verified: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="min-h-12 w-full rounded-2xl bg-[var(--ink)] px-5 py-3 font-bold text-white shadow-[0_5px_0_#ff6b4a] transition active:translate-y-1 active:shadow-none disabled:opacity-60"
      disabled={pending || !verified}
      type="submit"
    >
      {pending ? "Preparando el veredicto…" : "Generar comentarios con IA"}
    </button>
  );
}

export function GameCommentary({
  roomCode,
  canGenerate,
  chainEntryIds,
  chainIds,
  commentaryAvailable,
  initialComments,
  children,
}: {
  roomCode: string;
  canGenerate: boolean;
  chainEntryIds: Record<string, string[]>;
  chainIds: string[];
  commentaryAvailable: boolean;
  initialComments: string[];
  children: ReactNode;
}) {
  const [state, action] = useActionState(generateCommentary, initialState);
  const [turnstileToken, setTurnstileToken] = useState("");
  const handleToken = useCallback((token: string) => setTurnstileToken(token), []);
  const comments = state.comments ?? initialComments;
  const decodedComments = comments.map(deserializeGameCommentaryItem);
  const awards = decodedComments.filter((comment) => isGameAwardComment(comment.text));
  const observations = decodedComments.filter(
    (comment) => !isGameAwardComment(comment.text),
  );
  const chainNodes = Children.toArray(children);
  const observationsByChain = new Map(
    chainIds.map((chainId) => [chainId, [] as typeof observations]),
  );
  const unassignedObservations = [] as typeof observations;

  for (const observation of observations) {
    const inferredChainId = observation.chainId ?? chainIds.find((chainId) =>
      observation.entryIds.some((entryId) => chainEntryIds[chainId]?.includes(entryId)),
    );
    const chainComments = inferredChainId
      ? observationsByChain.get(inferredChainId)
      : undefined;
    if (chainComments) chainComments.push(observation);
    else unassignedObservations.push(observation);
  }

  useEffect(() => {
    if (state.analytics === "generated") track("ai_commentary_generated");
    if (state.analytics === "unavailable") track("ai_commentary_unavailable");
  }, [state.analytics]);

  return (
    <>
      {comments.length === 0 && (
        <aside className="mb-8 rounded-[1.5rem] border-2 border-[var(--ink)] bg-[var(--mint)]/60 p-5">
          <h3 className="text-xl font-black">El veredicto</h3>
          {!canGenerate ? (
            <p className="mt-3 text-sm font-semibold text-slate-600">
              Solo quien creó la partida puede generar los comentarios.
            </p>
          ) : !commentaryAvailable ? (
            <p className="mt-3 text-sm font-semibold text-slate-600">
              Los comentarios automáticos no están disponibles en este momento.
            </p>
          ) : (
            <form action={action} className="mt-4 space-y-3">
              <input name="roomCode" type="hidden" value={roomCode} />
              <input name="turnstileToken" type="hidden" value={turnstileToken} />
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
              <TurnstileWidget
                action={TURNSTILE_COMMENTARY_ACTION}
                onToken={handleToken}
                resetSignal={state}
                unavailableMessage="Los comentarios automáticos no están disponibles en este momento."
              />
              {state.error && (
                <p className="text-sm font-semibold text-red-700">{state.error}</p>
              )}
              <GenerateButton verified={Boolean(turnstileToken)} />
            </form>
          )}
        </aside>
      )}

      <div className="space-y-8">
        {chainIds.map((chainId, index) => {
          const chainComments = observationsByChain.get(chainId) ?? [];
          return (
            <div className="space-y-3" key={chainId}>
              {chainNodes[index]}
              {chainComments.length > 0 && (
                <aside className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--mint)]/60 p-4 shadow-[4px_4px_0_var(--ink)]">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-600">
                    Veredicto de esta cadena
                  </p>
                  {chainComments.map((comment) => (
                    <p className="mt-2 font-semibold" key={comment.text}>{comment.text}</p>
                  ))}
                </aside>
              )}
            </div>
          );
        })}
      </div>

      {unassignedObservations.length > 0 && (
        <aside className="mt-8 rounded-2xl bg-white p-4 shadow-sm">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-600">
            Comentarios de esta partida
          </h3>
          {unassignedObservations.map((comment) => (
            <p className="mt-2 font-semibold" key={comment.text}>{comment.text}</p>
          ))}
        </aside>
      )}

      {awards.length > 0 && (
        <aside className="mt-8 rounded-[1.5rem] border-2 border-[var(--ink)] bg-[var(--mint)]/60 p-5">
          <h3 className="text-xl font-black">Premios de la partida</h3>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {awards.map((award) => (
              <li
                className="rounded-2xl border-2 border-[var(--coral)] bg-[var(--cream)] p-4 font-black shadow-[3px_3px_0_var(--coral)]"
                key={award.text}
              >
                {award.text.slice(3)}
              </li>
            ))}
          </ul>
        </aside>
      )}
    </>
  );
}
