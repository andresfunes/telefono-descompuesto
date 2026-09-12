"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Circle, Layer, Line, Rect, Stage } from "react-konva";
import { DrawingToolbar } from "./drawing-toolbar";
import {
  addStroke,
  appendPoint,
  clearDrawing,
  createStroke,
  EMPTY_DRAWING_HISTORY,
  isDrawingEmpty,
  isTapStroke,
  redoDrawing,
  undoDrawing,
  type DrawingHistory,
  type DrawingPoint,
  type DrawingStroke,
  type DrawingTool,
} from "./drawing-state";
import { exportStageToPng } from "./export-drawing";

export const LOGICAL_CANVAS_WIDTH = 960;
export const LOGICAL_CANVAS_HEIGHT = 720;

export interface DrawingCanvasHandle {
  exportPng: () => string | null;
}

function clampPoint(point: DrawingPoint): DrawingPoint {
  return {
    x: Math.max(0, Math.min(LOGICAL_CANVAS_WIDTH, point.x)),
    y: Math.max(0, Math.min(LOGICAL_CANVAS_HEIGHT, point.y)),
  };
}

const DrawingCanvas = forwardRef<DrawingCanvasHandle>(function DrawingCanvas(_, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const activePointerRef = useRef<number | null>(null);
  const draftRef = useRef<DrawingStroke | null>(null);
  const historyRef = useRef<DrawingHistory>(EMPTY_DRAWING_HISTORY);
  const strokeSequenceRef = useRef(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [history, setHistory] = useState<DrawingHistory>(EMPTY_DRAWING_HISTORY);
  const [draft, setDraft] = useState<DrawingStroke | null>(null);
  const [tool, setTool] = useState<DrawingTool>("pen");
  const [color, setColor] = useState("#18231f");
  const [brushSize, setBrushSize] = useState(12);

  const replaceHistory = (nextHistory: DrawingHistory) => {
    historyRef.current = nextHistory;
    setHistory(nextHistory);
  };

  const finishStroke = (): DrawingHistory => {
    const currentDraft = draftRef.current;
    activePointerRef.current = null;
    draftRef.current = null;
    setDraft(null);
    if (!currentDraft) return historyRef.current;

    const nextHistory = addStroke(historyRef.current, currentDraft);
    replaceHistory(nextHistory);
    return nextHistory;
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = (width: number) => {
      setContainerWidth(Math.min(width, LOGICAL_CANVAS_WIDTH));
    };
    updateWidth(container.getBoundingClientRect().width);

    const observer = new ResizeObserver(([entry]) => {
      if (entry) updateWidth(entry.contentRect.width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useImperativeHandle(ref, () => ({
    exportPng: () => {
      const strokes = draftRef.current
        ? [...historyRef.current.strokes, draftRef.current]
        : historyRef.current.strokes;
      if (isDrawingEmpty(strokes) || !stageRef.current) return null;

      const png = exportStageToPng(stageRef.current, {
        width: LOGICAL_CANVAS_WIDTH,
        height: LOGICAL_CANVAS_HEIGHT,
      });
      finishStroke();
      return png;
    },
  }));

  const pointerPosition = (event: KonvaEventObject<PointerEvent>): DrawingPoint | null => {
    const stage = event.target.getStage();
    const position = stage?.getRelativePointerPosition();
    return position ? clampPoint(position) : null;
  };

  const handlePointerDown = (event: KonvaEventObject<PointerEvent>) => {
    if (!event.evt.isPrimary || activePointerRef.current !== null) return;
    event.evt.preventDefault();
    const point = pointerPosition(event);
    if (!point) return;

    activePointerRef.current = event.evt.pointerId;
    strokeSequenceRef.current += 1;
    const nextDraft = createStroke(
      `stroke-${strokeSequenceRef.current}`,
      tool,
      color,
      brushSize,
      point,
    );
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  };

  const handlePointerMove = (event: KonvaEventObject<PointerEvent>) => {
    if (activePointerRef.current !== event.evt.pointerId || !draftRef.current) return;
    event.evt.preventDefault();
    const point = pointerPosition(event);
    if (!point) return;

    const nextDraft = appendPoint(draftRef.current, point);
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  };

  const handlePointerEnd = (event: KonvaEventObject<PointerEvent>) => {
    if (activePointerRef.current !== event.evt.pointerId) return;
    event.evt.preventDefault();
    finishStroke();
  };

  const scale = containerWidth / LOGICAL_CANVAS_WIDTH;
  const visibleStrokes = draft ? [...history.strokes, draft] : history.strokes;

  return (
    <div className="space-y-4">
      <DrawingToolbar
        brushSize={brushSize}
        canClear={!isDrawingEmpty(history.strokes)}
        canRedo={history.future.length > 0}
        canUndo={history.past.length > 0}
        color={color}
        onBrushSizeChange={setBrushSize}
        onClear={() => replaceHistory(clearDrawing(finishStroke()))}
        onColorChange={setColor}
        onRedo={() => replaceHistory(redoDrawing(finishStroke()))}
        onToolChange={setTool}
        onUndo={() => replaceHistory(undoDrawing(finishStroke()))}
        tool={tool}
      />

      <div
        aria-label="Lienzo de dibujo"
        className="w-full overflow-hidden rounded-2xl border-2 border-[var(--ink)] bg-white shadow-inner"
        data-testid="drawing-canvas"
        ref={containerRef}
        role="application"
        style={{ aspectRatio: `${LOGICAL_CANVAS_WIDTH} / ${LOGICAL_CANVAS_HEIGHT}`, touchAction: "none" }}
      >
        {containerWidth > 0 && (
          <Stage
            height={LOGICAL_CANVAS_HEIGHT * scale}
            onPointerCancel={handlePointerEnd}
            onPointerDown={handlePointerDown}
            onPointerLeave={handlePointerEnd}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            ref={stageRef}
            scaleX={scale}
            scaleY={scale}
            width={containerWidth}
          >
            <Layer listening={false}>
              <Rect fill="#ffffff" height={LOGICAL_CANVAS_HEIGHT} width={LOGICAL_CANVAS_WIDTH} />
            </Layer>
            <Layer listening={false}>
              {visibleStrokes.map((stroke) => (
                isTapStroke(stroke) ? (
                  <Circle
                    fill={stroke.color}
                    globalCompositeOperation={
                      stroke.tool === "eraser" ? "destination-out" : "source-over"
                    }
                    key={stroke.id}
                    radius={stroke.width / 2}
                    x={stroke.points[0]}
                    y={stroke.points[1]}
                  />
                ) : (
                  <Line
                    globalCompositeOperation={
                      stroke.tool === "eraser" ? "destination-out" : "source-over"
                    }
                    key={stroke.id}
                    lineCap="round"
                    lineJoin="round"
                    points={stroke.points}
                    stroke={stroke.color}
                    strokeWidth={stroke.width}
                    tension={0.35}
                  />
                )
              ))}
            </Layer>
          </Stage>
        )}
      </div>
    </div>
  );
});

export default DrawingCanvas;
