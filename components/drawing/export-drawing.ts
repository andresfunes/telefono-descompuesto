import type Konva from "konva";

interface LogicalCanvasSize {
  width: number;
  height: number;
}

export function exportStageToPng(
  stage: Konva.Stage,
  logicalSize: LogicalCanvasSize,
): string {
  const displaySize = stage.size();
  const displayScale = stage.scale();
  const displayPosition = stage.position();

  try {
    stage.size(logicalSize);
    stage.scale({ x: 1, y: 1 });
    stage.position({ x: 0, y: 0 });
    stage.draw();
    return stage.toDataURL({ mimeType: "image/png", pixelRatio: 1 });
  } finally {
    stage.size(displaySize);
    stage.scale(displayScale);
    stage.position(displayPosition);
    stage.draw();
  }
}
