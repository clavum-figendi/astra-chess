// Procedural, local-only cues. No AudioContext is created before a user gesture.
export function createSound({storage, makeContext = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)()} = {}) {
  let enabled = false, context = null;
  const voices = new Set();
  try { storage ??= globalThis.localStorage; enabled = storage?.getItem('chess-lab-sound') === 'on'; } catch {}
  function unlock() {
    if (!enabled) return;
    try { context ??= makeContext(); if (context.state === 'suspended') context.resume().catch(() => {}); } catch {}
  }
  return {
    get enabled() { return enabled; },
    unlock,
    setEnabled(value) {
      enabled = Boolean(value);
      try { storage?.setItem('chess-lab-sound', enabled ? 'on' : 'off'); } catch {}
      if (enabled) unlock();
      else { for (const oscillator of voices) { try { oscillator.stop(); } catch {} } voices.clear(); }
    },
    play(kind = 'move') {
      if (!enabled || !context || context.state !== 'running') return;
      const tones = {move:[420],capture:[210,310],check:[660,880],end:[440,330,220]}[kind] || [420];
      try { tones.forEach((frequency,index) => {
        const oscillator = context.createOscillator(), gain = context.createGain();
        const start = context.currentTime + index * .055;
        oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency,start);
        gain.gain.setValueAtTime(.0001,start); gain.gain.exponentialRampToValueAtTime(.12,start+.008); gain.gain.exponentialRampToValueAtTime(.0001,start+.10);
        oscillator.connect(gain); gain.connect(context.destination); voices.add(oscillator);
        oscillator.onended = () => voices.delete(oscillator);
        oscillator.start(start); oscillator.stop(start+.11);
      }); } catch { /* Audio is optional; never stop a game for a device failure. */ }
    },
  };
}
