import { describe, expect, it } from "vitest";
import { floodFillPixels } from "@/components/drawing/flood-fill";

function pixelOffset(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

function setPixel(
  pixels: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  color: [number, number, number, number],
) {
  pixels.set(color, pixelOffset(width, x, y));
}

function getPixel(
  pixels: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
) {
  return [...pixels.slice(pixelOffset(width, x, y), pixelOffset(width, x, y) + 4)];
}

describe("flood fill", () => {
  it("fills only the connected region without crossing an outline", () => {
    const width = 3;
    const height = 3;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        setPixel(pixels, width, x, y, [255, 255, 255, 255]);
      }
      setPixel(pixels, width, 1, y, [0, 0, 0, 255]);
    }

    expect(floodFillPixels(pixels, width, height, 0, 0, "#ef4444")).toBe(true);
    expect(getPixel(pixels, width, 0, 2)).toEqual([239, 68, 68, 255]);
    expect(getPixel(pixels, width, 1, 2)).toEqual([0, 0, 0, 255]);
    expect(getPixel(pixels, width, 2, 2)).toEqual([255, 255, 255, 255]);
  });

  it("does nothing when the selected color already matches the region", () => {
    const pixels = new Uint8ClampedArray([239, 68, 68, 255]);
    expect(floodFillPixels(pixels, 1, 1, 0, 0, "#ef4444")).toBe(false);
  });
});
