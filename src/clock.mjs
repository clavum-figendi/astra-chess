// Elapsed time is read from one monotonic anchor, never from timer ticks.
export function createClock({ initialMs = 300000, incrementMs = 0, now = () => performance.now() } = {}) {
  let remaining = { w: initialMs, b: initialMs };
  let active = null;
  let flagged = null;
  let anchor = now();
  function settle() {
    const instant = now();
    if (active && remaining[active] !== null) {
      remaining[active] = Math.max(0, remaining[active] - (instant - anchor));
      if (remaining[active] === 0) { flagged = active; active = null; }
    }
    anchor = instant;
  }
  return {
    start(color) { if (!flagged && !active) { active = color; anchor = now(); } },
    completeMove(color) {
      settle();
      if (active !== color) return false;
      if (remaining[color] !== null) remaining[color] += incrementMs;
      active = color === 'w' ? 'b' : 'w';
      return true;
    },
    stop() { settle(); active = null; },
    reset(config = {}) {
      initialMs = Object.hasOwn(config, 'initialMs') ? config.initialMs : initialMs;
      incrementMs = config.incrementMs ?? incrementMs;
      remaining = { w: initialMs, b: initialMs };
      active = null; flagged = null; anchor = now();
    },
    snapshot() { settle(); return { ...remaining, active, flagged }; },
  };
}
