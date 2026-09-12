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
  deserializeDrawingDraft,
  EMPTY_DRAWING_HISTORY,
  isDrawingEmpty,
  isTapStroke,
  redoDrawing,
  serializeDrawingDraft,
  undoDrawing,
  type DrawingHistory,
  type DrawingPoint,
  type DrawingStroke,
  type DrawingTool,
} from "./drawing-state";
import { exportStageToPng } from "./export-drawing";
import { readTurnDraft, writeTurnDraft } from "@/lib/turn-draft";

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

const DrawingCanvas = forwardRef<DrawingCanvasHandle, { storageKey: string }>(function DrawingCanvas(
  { storageKey },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const cursorRef = useRef<Konva.Circle>(null);
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
  const [cursorPoint, setCursorPoint] = useState<DrawingPoint | null>(null);

  const replaceHistory = (nextHistory: DrawingHistory) => {
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    writeTurnDraft(storageKey, serializeDrawingDraft(nextHistory.strokes));
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
    const strokes = deserializeDrawingDraft(readTurnDraft(storageKey) ?? "");
    const restoredHistory = { strokes, past: [], future: [] };
    historyRef.current = restoredHistory;
    setHistory(restoredHistory);
  }, [storageKey]);

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

      const cursor = cursorRef.current;
      cursor?.hide();
      cursor?.getLayer()?.draw();
      const png = exportStageToPng(stageRef.current, {
        width: LOGICAL_CANVAS_WIDTH,
        height: LOGICAL_CANVAS_HEIGHT,
      });
      cursor?.show();
      cursor?.getLayer()?.draw();
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
    setCursorPoint(point);

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
    const point = pointerPosition(event);
    if (!point) return;
    setCursorPoint(point);
    if (activePointerRef.current !== event.evt.pointerId || !draftRef.current) return;
    event.evt.preventDefault();

    const nextDraft = appendPoint(draftRef.current, point);
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  };

  const handlePointerEnd = (event: KonvaEventObject<PointerEvent>) => {
    if (activePointerRef.current !== event.evt.pointerId) return;
    event.evt.preventDefault();
    finishStroke();
  };

  const handlePointerLeave = (event: KonvaEventObject<PointerEvent>) => {
    setCursorPoint(null);
    handlePointerEnd(event);
  };

  const handlePointerCancel = (event: KonvaEventObject<PointerEvent>) => {
    setCursorPoint(null);
    handlePointerEnd(event);
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
        className="w-full cursor-none overflow-hidden rounded-2xl border-2 border-[var(--ink)] bg-white shadow-inner"
        data-testid="drawing-canvas"
        ref={containerRef}
        role="application"
        style={{ aspectRatio: `${LOGICAL_CANVAS_WIDTH} / ${LOGICAL_CANVAS_HEIGHT}`, touchAction: "none" }}
      >
        {containerWidth > 0 && (
          <Stage
            height={LOGICAL_CANVAS_HEIGHT * scale}
            onPointerCancel={handlePointerCancel}
            onPointerDown={handlePointerDown}
            onPointerEnter={(event) => setCursorPoint(pointerPosition(event))}
            onPointerLeave={handlePointerLeave}
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
            <Layer listening={false}>
              {cursorPoint && (
                <Circle
                  dash={tool === "eraser" ? [6 / scale, 4 / scale] : undefined}
                  fill={tool === "eraser" ? "#ffffff" : color}
                  opacity={tool === "eraser" ? 0.8 : 0.55}
                  radius={brushSize / 2}
                  ref={cursorRef}
                  stroke={tool === "eraser" ? "#18231f" : color}
                  strokeWidth={2 / scale}
                  x={cursorPoint.x}
                  y={cursorPoint.y}
                />
              )}
            </Layer>
          </Stage>
        )}
      </div>
    </div>
  );
});

export default DrawingCanvas;
