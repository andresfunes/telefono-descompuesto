export type DrawingTool = "pen" | "eraser" | "fill";
export type DrawingStrokeTool = Exclude<DrawingTool, "fill">;

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface DrawingStroke {
  id: string;
  tool: DrawingStrokeTool;
  color: string;
  width: number;
  points: number[];
}

export interface DrawingRaster {
  id: string;
  tool: "raster";
  dataUrl: string;
}

export type DrawingElement = DrawingStroke | DrawingRaster;

export interface DrawingHistory {
  strokes: DrawingElement[];
  past: DrawingElement[][];
  future: DrawingElement[][];
}

export const EMPTY_DRAWING_HISTORY: DrawingHistory = {
  strokes: [],
  past: [],
  future: [],
};

export function createStroke(
  id: string,
  tool: DrawingStrokeTool,
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

export function isTapStroke(stroke: DrawingStroke): boolean {
  const [initialX, initialY] = stroke.points;
  if (initialX === undefined || initialY === undefined) return false;

  for (let index = 2; index < stroke.points.length; index += 2) {
    if (stroke.points[index] !== initialX || stroke.points[index + 1] !== initialY) {
      return false;
    }
  }

  return stroke.points.length >= 4;
}

export function addStroke(history: DrawingHistory, stroke: DrawingStroke): DrawingHistory {
  return {
    strokes: [...history.strokes, stroke],
    past: [...history.past, history.strokes],
    future: [],
  };
}

export function replaceDrawingWithRaster(
  history: DrawingHistory,
  raster: DrawingRaster,
): DrawingHistory {
  return {
    strokes: [raster],
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

export function isDrawingEmpty(strokes: readonly DrawingElement[]): boolean {
  return !strokes.some((stroke) =>
    stroke.tool === "raster" || (stroke.tool === "pen" && stroke.points.length >= 4),
  );
}

export function serializeDrawingDraft(strokes: readonly DrawingElement[]): string {
  return JSON.stringify({ version: 1, strokes });
}

export function deserializeDrawingDraft(value: string): DrawingElement[] {
  try {
    const parsed = JSON.parse(value) as { version?: unknown; strokes?: unknown };
    if (parsed.version !== 1 || !Array.isArray(parsed.strokes)) return [];

    return parsed.strokes.filter((candidate): candidate is DrawingElement => {
      if (!candidate || typeof candidate !== "object") return false;
      const stroke = candidate as Record<string, unknown>;
      if (stroke.tool === "raster") {
        return (
          typeof stroke.id === "string" &&
          typeof stroke.dataUrl === "string" &&
          stroke.dataUrl.startsWith("data:image/png;base64,") &&
          stroke.dataUrl.length <= 4_000_000
        );
      }
      return (
        typeof stroke.id === "string" &&
        (stroke.tool === "pen" || stroke.tool === "eraser") &&
        typeof stroke.color === "string" &&
        typeof stroke.width === "number" &&
        Number.isFinite(stroke.width) &&
        stroke.width > 0 &&
        Array.isArray(stroke.points) &&
        stroke.points.length >= 4 &&
        stroke.points.length % 2 === 0 &&
        stroke.points.every((point: unknown) =>
          typeof point === "number" && Number.isFinite(point),
        )
      );
    });
  } catch {
    return [];
  }
}
