interface DrawingPlaceholderInputProps {
  describedText: string;
}

/**
 * Temporary drawing adapter. A future react-konva canvas only needs to replace
 * this field and submit serialized drawing data under the same `value` name.
 */
export function DrawingPlaceholderInput({ describedText }: DrawingPlaceholderInputProps) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border-2 border-dashed border-[var(--ink)] bg-[var(--cream)] p-5 text-center">
        <p className="text-xs font-black uppercase tracking-widest text-slate-500">Dibujá esto</p>
        <p className="mt-2 text-xl font-black">“{describedText}”</p>
      </div>
      <label className="block text-sm font-bold" htmlFor="mock-drawing">
        Boceto temporal
      </label>
      <textarea
        className="min-h-32 w-full resize-none rounded-2xl border-2 border-[var(--ink)] bg-white p-4 outline-none focus:ring-4 focus:ring-[var(--mint)]"
        id="mock-drawing"
        maxLength={240}
        name="value"
        placeholder="Describí brevemente el dibujo que harías…"
        required
      />
      <p className="text-xs text-slate-500">
        Este campo reemplaza temporalmente al lienzo. La próxima versión guardará el dibujo real.
      </p>
    </div>
  );
}
