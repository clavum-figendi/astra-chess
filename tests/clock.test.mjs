import test from 'node:test';
import assert from 'node:assert/strict';

test('a completed legal turn charges thinking time, credits increment, and starts the opponent', async () => {
  const { createClock } = await import('../src/clock.mjs');
  let now = 0;
  const clock = createClock({ initialMs: 180000, incrementMs: 2000, now: () => now });
  clock.start('w');
  now = 1100;
  assert.equal(clock.completeMove('b'), false);
  assert.equal(clock.completeMove('w'), true);
  now = 3400;
  assert.deepEqual(clock.snapshot(), { w: 180900, b: 177700, active: 'b', flagged: null });
});

test('flagging is irreversible and a late move cannot gain increment or restart time', async () => {
  const { createClock } = await import('../src/clock.mjs');
  let now = 0;
  const clock = createClock({ initialMs: 1000, incrementMs: 2000, now: () => now });
  clock.start('b');
  now = 1000;
  assert.deepEqual(clock.snapshot(), { w: 1000, b: 0, active: null, flagged: 'b' });
  assert.equal(clock.completeMove('b'), false);
  clock.start('w');
  now = 5000;
  assert.deepEqual(clock.snapshot(), { w: 1000, b: 0, active: null, flagged: 'b' });
});

test('stopping freezes a settled clock and reset starts a fresh inactive game', async () => {
  const { createClock } = await import('../src/clock.mjs');
  let now = 0;
  const clock = createClock({ initialMs: 5000, now: () => now });
  clock.start('w');
  now = 1234;
  clock.stop();
  now = 4000;
  assert.deepEqual(clock.snapshot(), { w: 3766, b: 5000, active: null, flagged: null });
  clock.reset({ initialMs: 10000, incrementMs: 100 });
  assert.deepEqual(clock.snapshot(), { w: 10000, b: 10000, active: null, flagged: null });
  clock.start('b');
  now += 20;
  clock.completeMove('b');
  assert.equal(clock.snapshot().b, 10080);
});

test('unlimited clocks preserve null through turns, stop, and resetting a timed clock', async () => {
  const { createClock } = await import('../src/clock.mjs');
  let now = 0;
  const clock = createClock({ initialMs: null, now: () => now });
  clock.start('w'); now = 999999;
  assert.equal(clock.completeMove('w'), true);
  assert.deepEqual(clock.snapshot(), { w: null, b: null, active: 'b', flagged: null });
  clock.reset({ initialMs: 1000 }); clock.reset({ initialMs: null });
  clock.start('b'); now += 999999; clock.stop();
  assert.deepEqual(clock.snapshot(), { w: null, b: null, active: null, flagged: null });
});

test('only the active side loses actual monotonic elapsed time, even without ticks', async () => {
  const { createClock } = await import('../src/clock.mjs');
  let now = 100;
  const clock = createClock({ initialMs: 60000, incrementMs: 0, now: () => now });
  assert.deepEqual(clock.snapshot(), { w: 60000, b: 60000, active: null, flagged: null });
  clock.start('w');
  now += 17543;
  assert.deepEqual(clock.snapshot(), { w: 42457, b: 60000, active: 'w', flagged: null });
});
