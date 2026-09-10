import { describe, expect, it } from "vitest";
import { decodePngDataUrl, MAX_DRAWING_BYTES } from "@/lib/png-data-url";

const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("decodePngDataUrl", () => {
  it("decodes a PNG data URL", () => {
    const bytes = decodePngDataUrl(`data:image/png;base64,${ONE_PIXEL_PNG}`);
    expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  it("rejects a malformed or incorrectly typed image", () => {
    expect(() => decodePngDataUrl("data:image/jpeg;base64,abcd")).toThrow(
      "El dibujo no es un PNG válido.",
    );
    expect(() => decodePngDataUrl("data:image/png;base64,abcd")).toThrow(
      "El dibujo no es un PNG válido.",
    );
  });

  it("rejects drawings above the storage limit", () => {
    const oversized = Buffer.alloc(MAX_DRAWING_BYTES + 1);
    oversized.set([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(() =>
      decodePngDataUrl(`data:image/png;base64,${oversized.toString("base64")}`),
    ).toThrow("El dibujo supera el límite de 4 MB.");
  });
});
