import { describe, expect, it, vi } from "vitest";
import type Konva from "konva";
import { Transform } from "konva/lib/Util";
import {
  FIT_DRAWING_VIEW, LOGICAL_CANVAS_WIDTH, LOGICAL_CANVAS_HEIGHT,
  panDrawingView, zoomDrawingView,
} from "@/components/drawing/drawing-viewport";
import { exportStageToPng } from "@/components/drawing/export-drawing";

describe("drawing viewport", () => {
  it("centers 2× zoom on the same logical point at phone and landscape widths", () => {
    for (const width of [350, 740]) {
      const view = zoomDrawingView();
      const scale = width / LOGICAL_CANVAS_WIDTH * view.zoom;
      const transform = new Transform().translate(view.offset.x * scale, view.offset.y * scale).scale(scale, scale);
      const logicalPoint = transform.copy().invert().point({ x: width / 2, y: width * 0.75 / 2 });
      expect(logicalPoint.x).toBeCloseTo(480);
      expect(logicalPoint.y).toBeCloseTo(360);
    }
  });

  it("converts finger movement to logical offsets and clamps at all four edges", () => {
    const view = zoomDrawingView();
    const moved = panDrawingView(view, { x: 35, y: -35 }, 350);
    expect(moved.offset.x).toBeCloseTo(-192);
    expect(moved.offset.y).toBeCloseTo(-228);
    expect(panDrawingView(view, { x: 9999, y: 9999 }, 350).offset).toEqual({ x: 0, y: 0 });
    expect(panDrawingView(view, { x: -9999, y: -9999 }, 350).offset).toEqual({ x: -480, y: -360 });
    expect(panDrawingView(FIT_DRAWING_VIEW, { x: 35, y: 35 }, 350)).toEqual(FIT_DRAWING_VIEW);
    expect(panDrawingView(view, { x: 35, y: 35 }, 0)).toEqual(view);
  });

  it("preserves the logical area after resizing without altering strokes", () => {
    const moved = panDrawingView(zoomDrawingView(), { x: -100, y: 70 }, 350);
    const logicalPoints = [350, 740].map((width) => {
      const scale = width / 960 * moved.zoom;
      return new Transform().translate(moved.offset.x * scale, moved.offset.y * scale)
        .scale(scale, scale).invert().point({ x: width / 2, y: width * 0.75 / 2 });
    });
    expect(logicalPoints[0].x).toBeCloseTo(logicalPoints[1].x);
    expect(logicalPoints[0].y).toBeCloseTo(logicalPoints[1].y);
  });
});

describe("full drawing export from a zoomed and panned viewport", () => {
  it.each([false, true])("restores the viewport even if export fails: %s", (fail) => {
    let size = { width: 350, height: 262.5 };
    let scale = { x: 350 / 480, y: 350 / 480 };
    let position = { x: -200, y: -100 };
    const original = { size, scale, position };
    const toDataURL = vi.fn(() => {
      expect(size).toEqual({ width: LOGICAL_CANVAS_WIDTH, height: LOGICAL_CANVAS_HEIGHT });
      expect(scale).toEqual({ x: 1, y: 1 });
      expect(position).toEqual({ x: 0, y: 0 });
      if (fail) throw new Error("Export failed");
      return "data:image/png;base64,test";
    });
    const stage = {
      size: (value?: typeof size) => value ? (size = value) : size,
      scale: (value?: typeof scale) => value ? (scale = value) : scale,
      position: (value?: typeof position) => value ? (position = value) : position,
      draw: vi.fn(), toDataURL,
    } as unknown as Konva.Stage;
    const run = () => exportStageToPng(stage, { width: 960, height: 720 });
    if (fail) expect(run).toThrow("Export failed");
    else expect(run()).toBe("data:image/png;base64,test");
    expect({ size, scale, position }).toEqual(original);
    expect(toDataURL).toHaveBeenCalledWith({ mimeType: "image/png", pixelRatio: 1 });
  });
});
