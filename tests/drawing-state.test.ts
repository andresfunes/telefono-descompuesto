import { describe, expect, it } from "vitest";
import {
  addStroke,
  appendPoint,
  clearDrawing,
  createStroke,
  EMPTY_DRAWING_HISTORY,
  isDrawingEmpty,
  redoDrawing,
  undoDrawing,
} from "@/components/drawing/drawing-state";

function penStroke(id: string) {
  return createStroke(id, "pen", "#18231f", 12, { x: 10, y: 20 });
}

describe("drawing state", () => {
  it("creates tap-safe strokes and adds vector points", () => {
    const stroke = appendPoint(penStroke("one"), { x: 30, y: 40 });
    const history = addStroke(EMPTY_DRAWING_HISTORY, stroke);

    expect(stroke.points).toEqual([10, 20, 10, 20, 30, 40]);
    expect(history.strokes).toEqual([stroke]);
    expect(history.past).toEqual([[]]);
  });

  it("undoes and redoes complete stroke actions", () => {
    const oneStroke = addStroke(EMPTY_DRAWING_HISTORY, penStroke("one"));
    const twoStrokes = addStroke(oneStroke, penStroke("two"));

    const undone = undoDrawing(twoStrokes);
    expect(undone.strokes.map(({ id }) => id)).toEqual(["one"]);
    expect(redoDrawing(undone).strokes.map(({ id }) => id)).toEqual(["one", "two"]);
  });

  it("invalidates redo history after a new stroke", () => {
    const withTwo = addStroke(
      addStroke(EMPTY_DRAWING_HISTORY, penStroke("one")),
      penStroke("two"),
    );
    const undone = undoDrawing(withTwo);
    const branched = addStroke(undone, penStroke("three"));

    expect(branched.future).toEqual([]);
    expect(redoDrawing(branched)).toBe(branched);
    expect(branched.strokes.map(({ id }) => id)).toEqual(["one", "three"]);
  });

  it("treats clear as an undoable action", () => {
    const drawn = addStroke(EMPTY_DRAWING_HISTORY, penStroke("one"));
    const cleared = clearDrawing(drawn);

    expect(cleared.strokes).toEqual([]);
    expect(undoDrawing(cleared).strokes).toEqual(drawn.strokes);
    expect(redoDrawing(undoDrawing(cleared)).strokes).toEqual([]);
  });

  it("detects empty and non-empty drawings", () => {
    const eraser = createStroke("eraser", "eraser", "#ffffff", 24, { x: 5, y: 5 });

    expect(isDrawingEmpty([])).toBe(true);
    expect(isDrawingEmpty([eraser])).toBe(true);
    expect(isDrawingEmpty([penStroke("pen")])).toBe(false);
    expect(isDrawingEmpty(clearDrawing(addStroke(EMPTY_DRAWING_HISTORY, penStroke("pen"))).strokes)).toBe(true);
  });
});
