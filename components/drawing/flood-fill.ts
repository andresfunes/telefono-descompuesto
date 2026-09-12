interface RgbaColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

function parseHexColor(color: string): RgbaColor | null {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return {
    red: (value >> 16) & 255,
    green: (value >> 8) & 255,
    blue: value & 255,
    alpha: 255,
  };
}

function matchesTarget(
  pixels: Uint8ClampedArray,
  offset: number,
  target: RgbaColor,
  tolerance: number,
): boolean {
  return (
    Math.abs(pixels[offset] - target.red) <= tolerance &&
    Math.abs(pixels[offset + 1] - target.green) <= tolerance &&
    Math.abs(pixels[offset + 2] - target.blue) <= tolerance &&
    Math.abs(pixels[offset + 3] - target.alpha) <= tolerance
  );
}

export function floodFillPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  fillColor: string,
  tolerance = 24,
): boolean {
  if (width <= 0 || height <= 0 || pixels.length !== width * height * 4) return false;
  const fill = parseHexColor(fillColor);
  if (!fill) return false;

  const x = Math.max(0, Math.min(width - 1, Math.floor(startX)));
  const y = Math.max(0, Math.min(height - 1, Math.floor(startY)));
  const startIndex = y * width + x;
  const startOffset = startIndex * 4;
  const target = {
    red: pixels[startOffset],
    green: pixels[startOffset + 1],
    blue: pixels[startOffset + 2],
    alpha: pixels[startOffset + 3],
  };
  if (
    target.red === fill.red &&
    target.green === fill.green &&
    target.blue === fill.blue &&
    target.alpha === fill.alpha
  ) {
    return false;
  }

  const visited = new Uint8Array(width * height);
  const pending = new Int32Array(width * height);
  let pendingCount = 1;
  pending[0] = startIndex;
  visited[startIndex] = 1;
  let changed = false;

  while (pendingCount > 0) {
    const pixelIndex = pending[--pendingCount];
    const offset = pixelIndex * 4;
    if (!matchesTarget(pixels, offset, target, tolerance)) continue;

    pixels[offset] = fill.red;
    pixels[offset + 1] = fill.green;
    pixels[offset + 2] = fill.blue;
    pixels[offset + 3] = fill.alpha;
    changed = true;

    const pixelX = pixelIndex % width;
    const neighbors = [
      pixelX > 0 ? pixelIndex - 1 : -1,
      pixelX < width - 1 ? pixelIndex + 1 : -1,
      pixelIndex >= width ? pixelIndex - width : -1,
      pixelIndex < width * (height - 1) ? pixelIndex + width : -1,
    ];
    for (const neighbor of neighbors) {
      if (neighbor >= 0 && visited[neighbor] === 0) {
        visited[neighbor] = 1;
        pending[pendingCount++] = neighbor;
      }
    }
  }

  return changed;
}

export async function floodFillPngDataUrl(
  source: string,
  point: { x: number; y: number },
  color: string,
): Promise<{ dataUrl: string; image: HTMLCanvasElement } | null> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("No se pudo preparar el dibujo para rellenar."));
    image.src = source;
  });

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("No se pudo preparar el relleno.");
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const changed = floodFillPixels(
    imageData.data,
    canvas.width,
    canvas.height,
    point.x,
    point.y,
    color,
  );
  if (!changed) return null;

  context.putImageData(imageData, 0, 0);
  return { dataUrl: canvas.toDataURL("image/png"), image: canvas };
}
