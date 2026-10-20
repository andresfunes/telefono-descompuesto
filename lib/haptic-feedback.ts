export function hapticFeedback(): void {
  try {
    if (typeof navigator !== "undefined") navigator.vibrate?.(10);
  } catch {
    // Optional feedback must never interrupt a drawing action.
  }
}
