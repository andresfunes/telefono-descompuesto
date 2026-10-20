import { afterEach, describe, expect, it, vi } from "vitest";
import { hapticFeedback } from "@/lib/haptic-feedback";

afterEach(() => vi.unstubAllGlobals());

describe("haptic feedback", () => {
  it("requests one short pulse with the navigator as receiver", () => {
    const vibrate = vi.fn(function (this: unknown) {
      expect(this).toBe(navigator);
      return true;
    });
    vi.stubGlobal("navigator", { vibrate });
    hapticFeedback();
    expect(vibrate).toHaveBeenCalledExactlyOnceWith(10);
  });

  it("does not interrupt actions when vibration is unavailable or rejected", () => {
    for (const value of [undefined, {}, { vibrate: () => false }, { vibrate: () => { throw new Error("Blocked"); } }]) {
      vi.stubGlobal("navigator", value);
      expect(hapticFeedback).not.toThrow();
    }
  });
});
