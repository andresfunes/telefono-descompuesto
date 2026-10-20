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
import { Circle, Image as KonvaImage, Layer, Line, Rect, Stage } from "react-konva";
import { DrawingToolbar } from "./drawing-toolbar";
import { hapticFeedback } from "@/lib/haptic-feedback";
import { DrawingViewControls } from "./drawing-view-controls";
import { floodFillPngDataUrl } from "./flood-fill";
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
  replaceDrawingWithRaster,
  serializeDrawingDraft,
  undoDrawing,
  type DrawingHistory,
  type DrawingPoint,
  type DrawingStroke,
  type DrawingTool,
} from "./drawing-state";
import { exportStageToPng } from "./export-drawing";
import { readTurnDraft, writeTurnDraft } from "@/lib/turn-draft";

import {
  FIT_DRAWING_VIEW,
  LOGICAL_CANVAS_WIDTH,
  LOGICAL_CANVAS_HEIGHT,
  panDrawingView,
  zoomDrawingView,
  type DrawingViewport,
} from "./drawing-viewport";

export { LOGICAL_CANVAS_WIDTH, LOGICAL_CANVAS_HEIGHT } from "./drawing-viewport";

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
  const capturedPointerRef = useRef<HTMLElement | null>(null);
  const panPointRef = useRef<DrawingPoint | null>(null);
  const [view, setView] = useState<DrawingViewport>(FIT_DRAWING_VIEW);
  const [movingCanvas, setMovingCanvas] = useState(false);
  const fillPendingRef = useRef(false);
  const draftRef = useRef<DrawingStroke | null>(null);
  const historyRef = useRef<DrawingHistory>(EMPTY_DRAWING_HISTORY);
  const [containerWidth, setContainerWidth] = useState(0);
  const [history, setHistory] = useState<DrawingHistory>(EMPTY_DRAWING_HISTORY);
  const [draft, setDraft] = useState<DrawingStroke | null>(null);
  const [tool, setTool] = useState<DrawingTool>("pen");
  const [color, setColor] = useState("#18231f");
  const [brushSize, setBrushSize] = useState(12);
  const [cursorPoint, setCursorPoint] = useState<DrawingPoint | null>(null);
  const [rasterImage, setRasterImage] = useState<{
    source: string;
    image: CanvasImageSource;
  } | null>(null);

  const replaceHistory = (nextHistory: DrawingHistory) => {
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    writeTurnDraft(storageKey, serializeDrawingDraft(nextHistory.strokes));
  };

  const finishStroke = (): DrawingHistory => {
    const currentDraft = draftRef.current;
    const pointerId = activePointerRef.current;
    const captured = capturedPointerRef.current;
    activePointerRef.current = null;
    capturedPointerRef.current = null;
    panPointRef.current = null;
    if (pointerId !== null && captured?.hasPointerCapture(pointerId)) {
      captured.releasePointerCapture(pointerId);
    }
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

  const raster = history.strokes.findLast((element) => element.tool === "raster");

  useEffect(() => {
    if (!raster) return;
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (active) setRasterImage({ source: raster.dataUrl, image });
    };
    image.src = raster.dataUrl;
    return () => {
      active = false;
    };
  }, [raster]);

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
      try {
        const png = exportStageToPng(stageRef.current, {
          width: LOGICAL_CANVAS_WIDTH,
          height: LOGICAL_CANVAS_HEIGHT,
        });
        finishStroke();
        return png;
      } finally {
        cursor?.show();
        cursor?.getLayer()?.draw();
      }
    },
  }));

  const pointerPosition = (event: KonvaEventObject<PointerEvent>): DrawingPoint | null => {
    const stage = event.target.getStage();
    const position = stage?.getRelativePointerPosition();
    return position ? clampPoint(position) : null;
  };

  const fillRegion = async (point: DrawingPoint) => {
    const stage = stageRef.current;
    if (!stage || fillPendingRef.current) return;
    hapticFeedback();
    fillPendingRef.current = true;
    try {
      const source = exportStageToPng(stage, {
        width: LOGICAL_CANVAS_WIDTH,
        height: LOGICAL_CANVAS_HEIGHT,
      });
      const result = await floodFillPngDataUrl(source, point, color);
      if (!result) return;
      const nextRaster = {
        id: `raster-${crypto.randomUUID()}`,
        tool: "raster" as const,
        dataUrl: result.dataUrl,
      };
      setRasterImage({ source: result.dataUrl, image: result.image });
      replaceHistory(replaceDrawingWithRaster(historyRef.current, nextRaster));
    } finally {
      fillPendingRef.current = false;
    }
  };

  const capturePointer = (event: PointerEvent) => {
    if (event.target instanceof HTMLElement) {
      event.target.setPointerCapture(event.pointerId);
      capturedPointerRef.current = event.target;
    }
  };

  const handlePointerDown = (event: KonvaEventObject<PointerEvent>) => {
    if (!event.evt.isPrimary || event.evt.button !== 0 || activePointerRef.current !== null || fillPendingRef.current) return;
    event.evt.preventDefault();
    if (movingCanvas) {
      activePointerRef.current = event.evt.pointerId;
      panPointRef.current = { x: event.evt.clientX, y: event.evt.clientY };
      capturePointer(event.evt);
      setCursorPoint(null);
      return;
    }
    const point = pointerPosition(event);
    if (!point) return;
    setCursorPoint(point);

    if (tool === "fill") {
      void fillRegion(point);
      return;
    }

    activePointerRef.current = event.evt.pointerId;
    capturePointer(event.evt);
    const nextDraft = createStroke(
      `stroke-${crypto.randomUUID()}`,
      tool,
      color,
      brushSize,
      point,
    );
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  };

  const handlePointerMove = (event: KonvaEventObject<PointerEvent>) => {
    if (movingCanvas) {
      const previous = panPointRef.current;
      if (activePointerRef.current !== event.evt.pointerId || !previous) return;
      event.evt.preventDefault();
      const next = { x: event.evt.clientX, y: event.evt.clientY };
      setView((current) => panDrawingView(current, { x: next.x - previous.x, y: next.y - previous.y }, containerWidth));
      panPointRef.current = next;
      return;
    }
    if (!event.evt.isPrimary) return;
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
    if (!movingCanvas || !capturedPointerRef.current) handlePointerEnd(event);
  };

  const handlePointerCancel = (event: KonvaEventObject<PointerEvent>) => {
    setCursorPoint(null);
    handlePointerEnd(event);
  };

  const changeView = (nextView: DrawingViewport) => {
    finishStroke();
    setCursorPoint(null);
    setView(nextView);
    if (nextView.zoom === 1) setMovingCanvas(false);
  };

  const selectTool = (nextTool: DrawingTool) => {
    finishStroke();
    setCursorPoint(null);
    setMovingCanvas(false);
    setTool(nextTool);
  };

  const baseScale = containerWidth / LOGICAL_CANVAS_WIDTH;
  const scale = baseScale * view.zoom;
  const visibleStrokes = draft ? [...history.strokes, draft] : history.strokes;
  const lastRasterIndex = visibleStrokes.findLastIndex((element) => element.tool === "raster");
  const visibleElements = lastRasterIndex >= 0
    ? visibleStrokes.slice(lastRasterIndex)
    : visibleStrokes;

  return (
    <div className="space-y-4">
      <DrawingToolbar
        drawingPaused={movingCanvas}
        brushSize={brushSize}
        canvasScale={scale}
        canClear={!isDrawingEmpty(history.strokes)}
        canRedo={history.future.length > 0}
        canUndo={history.past.length > 0}
        color={color}
        onBrushSizeChange={setBrushSize}
        onClear={() => replaceHistory(clearDrawing(finishStroke()))}
        onColorChange={setColor}
        onRedo={() => replaceHistory(redoDrawing(finishStroke()))}
        onToolChange={selectTool}
        onUndo={() => replaceHistory(undoDrawing(finishStroke()))}
        tool={tool}
      />

      <DrawingViewControls
        zoomed={view.zoom === 2}
        moving={movingCanvas}
        onZoom={() => changeView(view.zoom === 1 ? zoomDrawingView() : FIT_DRAWING_VIEW)}
        onMove={() => {
          finishStroke();
          setCursorPoint(null);
          setMovingCanvas(!movingCanvas);
        }}
        onFit={() => changeView(FIT_DRAWING_VIEW)}
      />
      <p className="text-sm text-slate-600" aria-live="polite">
        {movingCanvas ? "Arrastrá para recorrer el lienzo. Elegí el lápiz, borrador o relleno para seguir dibujando." :
          view.zoom === 2 ? "Zoom 2×: dibujá los detalles o tocá las cuatro flechas para cambiar de zona." :
            "Tocá la lupa para ampliar y dibujar detalles."}
      </p>

      <div
        aria-label="Lienzo de dibujo"
        className={`w-full overflow-hidden rounded-2xl border-2 border-[var(--ink)] bg-white shadow-inner ${
          movingCanvas ? "cursor-grab active:cursor-grabbing" : tool === "fill" ? "cursor-crosshair" : "cursor-none"
        }`}
        data-testid="drawing-canvas"
        ref={containerRef}
        onLostPointerCapture={(event) => {
          if (activePointerRef.current === event.pointerId) finishStroke();
        }}
        onPointerCancel={(event) => {
          if (activePointerRef.current === event.pointerId) {
            setCursorPoint(null);
            finishStroke();
          }
        }}
        role="application"
        style={{ aspectRatio: `${LOGICAL_CANVAS_WIDTH} / ${LOGICAL_CANVAS_HEIGHT}`, touchAction: "none" }}
      >
        {containerWidth > 0 && (
          <Stage
            height={LOGICAL_CANVAS_HEIGHT * baseScale}
            onPointerCancel={handlePointerCancel}
            onPointerDown={handlePointerDown}
            onPointerEnter={(event) => !movingCanvas && setCursorPoint(pointerPosition(event))}
            onPointerLeave={handlePointerLeave}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            ref={stageRef}
            scaleX={scale}
            scaleY={scale}
            width={containerWidth}
            x={view.offset.x * scale}
            y={view.offset.y * scale}
          >
            <Layer listening={false}>
              <Rect fill="#ffffff" height={LOGICAL_CANVAS_HEIGHT} width={LOGICAL_CANVAS_WIDTH} />
            </Layer>
            <Layer listening={false}>
              {visibleElements.map((stroke) => (
                stroke.tool === "raster" ? (
                  rasterImage?.source === stroke.dataUrl && (
                    <KonvaImage
                      height={LOGICAL_CANVAS_HEIGHT}
                      image={rasterImage.image}
                      key={stroke.id}
                      width={LOGICAL_CANVAS_WIDTH}
                    />
                  )
                ) : isTapStroke(stroke) ? (
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
              {cursorPoint && !movingCanvas && tool !== "fill" && (
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
