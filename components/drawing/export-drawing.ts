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

  try {
    stage.size(logicalSize);
    stage.scale({ x: 1, y: 1 });
    stage.draw();
    return stage.toDataURL({ mimeType: "image/png", pixelRatio: 1 });
  } finally {
    stage.size(displaySize);
    stage.scale(displayScale);
    stage.draw();
  }
}
