export type DrawingTool = "pen" | "eraser";

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface DrawingStroke {
  id: string;
  tool: DrawingTool;
  color: string;
  width: number;
  points: number[];
}

export interface DrawingHistory {
  strokes: DrawingStroke[];
  past: DrawingStroke[][];
  future: DrawingStroke[][];
}

export const EMPTY_DRAWING_HISTORY: DrawingHistory = {
  strokes: [],
  past: [],
  future: [],
};

export function createStroke(
  id: string,
  tool: DrawingTool,
  color: string,
  width: number,
  point: DrawingPoint,
): DrawingStroke {
  // Duplicating the first point makes a short tap render as a round dot.
  return { id, tool, color, width, points: [point.x, point.y, point.x, point.y] };
}

export function appendPoint(stroke: DrawingStroke, point: DrawingPoint): DrawingStroke {
  return { ...stroke, points: [...stroke.points, point.x, point.y] };
}

export function addStroke(history: DrawingHistory, stroke: DrawingStroke): DrawingHistory {
  return {
    strokes: [...history.strokes, stroke],
    past: [...history.past, history.strokes],
    future: [],
  };
}

export function undoDrawing(history: DrawingHistory): DrawingHistory {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    strokes: previous,
    past: history.past.slice(0, -1),
    future: [history.strokes, ...history.future],
  };
}

export function redoDrawing(history: DrawingHistory): DrawingHistory {
  const next = history.future[0];
  if (!next) return history;
  return {
    strokes: next,
    past: [...history.past, history.strokes],
    future: history.future.slice(1),
  };
}

export function clearDrawing(history: DrawingHistory): DrawingHistory {
  if (history.strokes.length === 0) return history;
  return {
    strokes: [],
    past: [...history.past, history.strokes],
    future: [],
  };
}

export function isDrawingEmpty(strokes: readonly DrawingStroke[]): boolean {
  return !strokes.some((stroke) => stroke.tool === "pen" && stroke.points.length >= 4);
}
