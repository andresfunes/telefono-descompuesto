import { hapticFeedback } from "@/lib/haptic-feedback";

interface DrawingViewControlsProps {
  zoomed: boolean;
  moving: boolean;
  onZoom: () => void;
  onMove: () => void;
  onFit: () => void;
}

const buttonClass = "grid size-12 shrink-0 place-items-center rounded-xl border-2 border-[var(--ink)] bg-white p-0 transition aria-pressed:bg-[var(--mint)] aria-pressed:shadow-[inset_0_0_0_3px_var(--coral)] disabled:cursor-not-allowed disabled:opacity-35 sm:size-[3.25rem]";

export function DrawingViewControls({ zoomed, moving, onZoom, onMove, onFit }: DrawingViewControlsProps) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Vista del lienzo">
      <button type="button" aria-label="Zoom 2×" title="Zoom 2×" aria-pressed={zoomed} className={buttonClass} onClick={() => { hapticFeedback(); onZoom(); }}>
        <svg aria-hidden="true" className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10" cy="10" r="6.5" />
          <path d="m15 15 6 6M7 10h6" />
          {!zoomed && <path d="M10 7v6" />}
        </svg>
      </button>
      <button type="button" aria-label="Mover lienzo" title="Mover lienzo" aria-pressed={moving} disabled={!zoomed} className={buttonClass} onClick={() => { hapticFeedback(); onMove(); }}>
        <svg aria-hidden="true" className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
        </svg>
      </button>
      <button type="button" aria-label="Ver todo" title="Ver todo" disabled={!zoomed} className={buttonClass} onClick={() => { hapticFeedback(); onFit(); }}>
        <svg aria-hidden="true" className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" />
          <rect x="7" y="8" width="10" height="8" rx="1" />
        </svg>
      </button>
    </div>
  );
}
