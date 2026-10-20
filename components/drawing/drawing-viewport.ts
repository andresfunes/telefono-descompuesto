import type { DrawingPoint } from "./drawing-state";

export const LOGICAL_CANVAS_WIDTH = 960;
export const LOGICAL_CANVAS_HEIGHT = 720;

export interface DrawingViewport {
  zoom: 1 | 2;
  offset: DrawingPoint;
}

export const FIT_DRAWING_VIEW: DrawingViewport = { zoom: 1, offset: { x: 0, y: 0 } };

export function zoomDrawingView(): DrawingViewport {
  return { zoom: 2, offset: { x: -240, y: -180 } };
}

/** Offsets are logical coordinates, so rotating/resizing preserves the viewed area. */
export function panDrawingView(view: DrawingViewport, delta: DrawingPoint, displayWidth: number): DrawingViewport {
  if (displayWidth <= 0 || view.zoom === 1) return view;
  const scale = displayWidth / LOGICAL_CANVAS_WIDTH * view.zoom;
  return {
    ...view,
    offset: {
      x: Math.max(-LOGICAL_CANVAS_WIDTH * (1 - 1 / view.zoom), Math.min(0, view.offset.x + delta.x / scale)),
      y: Math.max(-LOGICAL_CANVAS_HEIGHT * (1 - 1 / view.zoom), Math.min(0, view.offset.y + delta.y / scale)),
    },
  };
}
