import { afterEach, describe, expect, it, vi } from "vitest";
import { createRealtimeRefreshQueue } from "@/lib/realtime-refresh-queue";

afterEach(() => vi.useRealTimers());

describe("realtime refresh queue", () => {
  it("coalesces a burst and serializes events arriving during a refresh", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const queue = createRealtimeRefreshQueue(refresh);
    for (let i = 0; i < 12; i++) queue.request();
    vi.advanceTimersByTime(250);
    expect(refresh).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 12; i++) queue.request();
    vi.advanceTimersByTime(1000);
    expect(refresh).toHaveBeenCalledTimes(1);
    queue.complete();
    vi.advanceTimersByTime(250);
    expect(refresh).toHaveBeenCalledTimes(2);
    queue.complete();
    vi.runAllTimers();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("does not starve updates when events continue arriving", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const queue = createRealtimeRefreshQueue(refresh);
    for (let i = 0; i < 5; i++) { queue.request(); vi.advanceTimersByTime(50); }
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("defers scheduled work during actions and discards work on unmount", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const queue = createRealtimeRefreshQueue(refresh);
    queue.request();
    queue.setActionPending(true);
    vi.advanceTimersByTime(500);
    expect(refresh).not.toHaveBeenCalled();
    queue.setActionPending(false);
    vi.advanceTimersByTime(250);
    expect(refresh).toHaveBeenCalledTimes(1);
    queue.request();
    queue.complete();
    queue.dispose();
    vi.runAllTimers();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
