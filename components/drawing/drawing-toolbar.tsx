"use client";

import { useRef } from "react";
import type { DrawingTool } from "./drawing-state";

interface DrawingColor {
  label: string;
  value: string;
}

export const PRIMARY_DRAWING_COLORS: readonly DrawingColor[] = [
  { label: "Negro", value: "#18231f" },
  { label: "Rojo", value: "#ef4444" },
  { label: "Azul", value: "#2563eb" },
  { label: "Verde", value: "#16a34a" },
];

export const EXTRA_DRAWING_COLORS: readonly DrawingColor[] = [
  { label: "Violeta", value: "#7c3aed" },
  { label: "Naranja", value: "#f97316" },
  { label: "Amarillo", value: "#eab308" },
  { label: "Rosa", value: "#ec4899" },
  { label: "Celeste", value: "#06b6d4" },
  { label: "Turquesa", value: "#0f766e" },
  { label: "Marrón", value: "#92400e" },
  { label: "Gris", value: "#64748b" },
];

export const DRAWING_COLORS = [
  ...PRIMARY_DRAWING_COLORS,
  ...EXTRA_DRAWING_COLORS,
].map(({ value }) => value);
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
  "grid min-h-11 min-w-11 place-items-center rounded-xl border-2 border-[var(--ink)] bg-white px-3 text-sm font-black transition aria-pressed:bg-[var(--mint)] aria-pressed:shadow-[inset_0_0_0_3px_var(--coral)] disabled:cursor-not-allowed disabled:opacity-35";
const colorButtonClass =
  "size-11 rounded-full border-2 border-white shadow-[0_0_0_2px_var(--ink)] transition aria-pressed:scale-90 aria-pressed:shadow-[0_0_0_4px_var(--coral)]";

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
  const extraColorsRef = useRef<HTMLDetailsElement>(null);
  const selectedExtraColor = EXTRA_DRAWING_COLORS.find((option) => option.value === color);

  const selectColor = (value: string, closeExtraColors = false) => {
    onColorChange(value);
    onToolChange("pen");
    if (closeExtraColors) extraColorsRef.current?.removeAttribute("open");
  };

  return (
    <div className="space-y-3" aria-label="Herramientas de dibujo">
      <div className="flex flex-wrap gap-2">
        <button
          aria-pressed={tool === "pen"}
          className={buttonClass}
          onClick={() => onToolChange("pen")}
          type="button"
        >
          ✏️ Lápiz
        </button>
        <button
          aria-pressed={tool === "eraser"}
          className={buttonClass}
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
          {PRIMARY_DRAWING_COLORS.map((option) => (
            <button
              aria-label={`Color ${option.label}`}
              aria-pressed={color === option.value && tool === "pen"}
              className={colorButtonClass}
              key={option.value}
              onClick={() => selectColor(option.value)}
              style={{ backgroundColor: option.value }}
              type="button"
            />
          ))}

          <details className="relative" ref={extraColorsRef}>
            <summary
              aria-label={
                selectedExtraColor
                  ? `Más colores. Seleccionado: ${selectedExtraColor.label}`
                  : "Más colores"
              }
              className={`${colorButtonClass} grid cursor-pointer list-none place-items-center [&::-webkit-details-marker]:hidden ${
                selectedExtraColor && tool === "pen"
                  ? "scale-90 shadow-[0_0_0_4px_var(--coral)]"
                  : ""
              }`}
              style={{
                background: selectedExtraColor
                  ? selectedExtraColor.value
                  : "conic-gradient(#7c3aed, #ec4899, #f97316, #eab308, #06b6d4, #7c3aed)",
              }}
              title="Más colores"
            >
              <span className="grid size-5 place-items-center rounded-full bg-white/90 text-base font-black leading-none text-[var(--ink)] shadow-sm">
                +
              </span>
            </summary>
            <div className="absolute right-0 top-full z-20 mt-3 grid w-60 max-w-[calc(100vw-2.5rem)] grid-cols-4 place-items-center gap-3 rounded-2xl border-2 border-[var(--ink)] bg-white p-3 shadow-[5px_5px_0_var(--ink)]">
              {EXTRA_DRAWING_COLORS.map((option) => (
                <button
                  aria-label={`Color ${option.label}`}
                  aria-pressed={color === option.value && tool === "pen"}
                  className={colorButtonClass}
                  key={option.value}
                  onClick={() => selectColor(option.value, true)}
                  style={{ backgroundColor: option.value }}
                  title={option.label}
                  type="button"
                />
              ))}
            </div>
          </details>
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
