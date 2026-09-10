const PNG_PREFIX = "data:image/png;base64,";
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
export const MAX_DRAWING_BYTES = 4 * 1024 * 1024;

export function decodePngDataUrl(value: string): Uint8Array {
  if (!value.startsWith(PNG_PREFIX)) throw new Error("El dibujo no es un PNG válido.");
  const encoded = value.slice(PNG_PREFIX.length);
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error("El dibujo no es un PNG válido.");
  }

  const png = Buffer.from(encoded, "base64");
  if (png.byteLength > MAX_DRAWING_BYTES) {
    throw new Error("El dibujo supera el límite de 4 MB.");
  }
  if (PNG_SIGNATURE.some((byte, index) => png[index] !== byte)) {
    throw new Error("El dibujo no es un PNG válido.");
  }
  return png;
}
