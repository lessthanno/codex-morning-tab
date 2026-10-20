/** Keep an existing view current. This controller only reads state; it never opens a view or sends a chat message. */
export function createStateSync({
  readState,
  onState,
  onError = () => {},
  isVisible = () => true,
  interval = 4000,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let stopped = true;
  let timer = null;
  let running = false;
  let requested = false;
  function clear() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }
  function schedule(delay) {
    clear();
    if (!stopped) timer = setTimer(tick, delay);
  }
  async function tick() {
    timer = null;
    if (stopped || running || !isVisible()) return;
    running = true;
    try {
      const state = await readState();
      if (!stopped) onState(state);
    } catch (error) {
      if (!stopped) onError(error);
    } finally {
      running = false;
      if (!stopped) schedule(requested ? 0 : interval);
      requested = false;
    }
  }
  return {
    start() {
      stopped = false;
      schedule(0);
    },
    request() {
      if (stopped) return;
      if (running) requested = true;
      else schedule(0);
    },
    stop() {
      stopped = true;
      requested = false;
      clear();
    },
  };
}
