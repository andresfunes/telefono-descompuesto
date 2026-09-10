import type { DrawingTool } from "./drawing-state";

export const DRAWING_COLORS = ["#18231f", "#ef4444", "#2563eb", "#16a34a", "#7c3aed"];
export const BRUSH_SIZES = [6, 12, 24];

interface DrawingToolbarProps {
  tool: DrawingTool;
  color: string;
  brushSize: number;
  canUndo: boolean;
  canRedo: boolean;
  canClear: boolean;
  onToolChange: (tool: DrawingTool) => void;
  onColorChange: (color: string) => void;
  onBrushSizeChange: (size: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
}

const buttonClass =
  "grid min-h-11 min-w-11 place-items-center rounded-xl border-2 border-[var(--ink)] bg-white px-3 text-sm font-black disabled:cursor-not-allowed disabled:opacity-35";

export function DrawingToolbar({
  tool,
  color,
  brushSize,
  canUndo,
  canRedo,
  canClear,
  onToolChange,
  onColorChange,
  onBrushSizeChange,
  onUndo,
  onRedo,
  onClear,
}: DrawingToolbarProps) {
  return (
    <div className="space-y-3" aria-label="Herramientas de dibujo">
      <div className="flex flex-wrap gap-2">
        <button
          aria-pressed={tool === "pen"}
          className={`${buttonClass} ${tool === "pen" ? "bg-[var(--mint)]" : ""}`}
          onClick={() => onToolChange("pen")}
          type="button"
        >
          ✏️ Lápiz
        </button>
        <button
          aria-pressed={tool === "eraser"}
          className={`${buttonClass} ${tool === "eraser" ? "bg-[var(--mint)]" : ""}`}
          onClick={() => onToolChange("eraser")}
          type="button"
        >
          Borrador
        </button>
        <button aria-label="Deshacer" className={buttonClass} disabled={!canUndo} onClick={onUndo} type="button">
          ↶
        </button>
        <button aria-label="Rehacer" className={buttonClass} disabled={!canRedo} onClick={onRedo} type="button">
          ↷
        </button>
        <button className={buttonClass} disabled={!canClear} onClick={onClear} type="button">
          Limpiar
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <fieldset className="flex items-center gap-2">
          <legend className="sr-only">Color</legend>
          {DRAWING_COLORS.map((option) => (
            <button
              aria-label={`Color ${option}`}
              aria-pressed={color === option && tool === "pen"}
              className="size-11 rounded-full border-2 border-white shadow-[0_0_0_2px_var(--ink)] transition aria-pressed:scale-90 aria-pressed:shadow-[0_0_0_4px_var(--coral)]"
              key={option}
              onClick={() => {
                onColorChange(option);
                onToolChange("pen");
              }}
              style={{ backgroundColor: option }}
              type="button"
            />
          ))}
        </fieldset>

        <fieldset className="flex items-center gap-2">
          <legend className="sr-only">Grosor</legend>
          {BRUSH_SIZES.map((size) => (
            <button
              aria-label={`Grosor ${size}`}
              aria-pressed={brushSize === size}
              className={`${buttonClass} p-0`}
              key={size}
              onClick={() => onBrushSizeChange(size)}
              type="button"
            >
              <span
                className="block rounded-full bg-[var(--ink)]"
                style={{ height: Math.max(5, size / 2), width: Math.max(5, size / 2) }}
              />
            </button>
          ))}
        </fieldset>
      </div>
    </div>
  );
}
