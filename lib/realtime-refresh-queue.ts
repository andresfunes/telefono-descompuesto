/** Coalesce invalidations while retaining one refresh after ongoing work finishes. */
export function createRealtimeRefreshQueue(refresh: () => void, delay = 250) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let queued = false;
  let actionPending = false;
  let refreshing = false;
  let disposed = false;

  const schedule = () => {
    if (disposed || !queued || actionPending || refreshing || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (disposed || actionPending || refreshing) return;
      queued = false;
      refreshing = true;
      refresh();
    }, delay);
  };

  return {
    request() { queued = true; schedule(); },
    setActionPending(pending: boolean) { actionPending = pending; schedule(); },
    complete() { refreshing = false; schedule(); },
    dispose() { disposed = true; if (timer !== undefined) clearTimeout(timer); },
  };
}
