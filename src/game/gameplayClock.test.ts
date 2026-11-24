import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMonotonicBeatTracker,
  createMonotonicCountdownClock,
  waitMonotonicBeat,
} from './gameplayClock';

test('BUG-03: monotonic match clock loses 0 seconds across frequent phase transitions (every 450ms for 10s)', () => {
  let nowMs = 10_000;
  const matchClock = createMonotonicCountdownClock(1200, nowMs);

  // Simulate 10,000ms of gameplay with phase transitions every 450ms (which used to reset setInterval(1000) and drop 100% of time!)
  const phases = ['AWAIT_ROLL', 'ROLLING_DICE', 'MOVING_TOKEN', 'BUY_DECISION'] as const;
  let phaseIdx = 0;
  for (let elapsed = 0; elapsed < 10_000; elapsed += 200) {
    nowMs += 200;
    if (elapsed > 0 && elapsed % 450 < 200) {
      phaseIdx = (phaseIdx + 1) % phases.length;
    }
    const phase = phases[phaseIdx];
    matchClock.advance(nowMs, phase !== 'GAME_OVER' as string);
  }

  assert.equal(matchClock.getRemainingSeconds(), 1190, 'Exactly 10 seconds must elapse over 10,000ms');
  assert.equal(matchClock.getCarryMs(), 0);
});

test('BUG-03: match clock and turn clock are separate — turn clock freezes during animations while preserving sub-second carry', () => {
  let nowMs = 5_000;
  const matchClock = createMonotonicCountdownClock(1200, nowMs);
  const turnClock = createMonotonicCountdownClock(45, nowMs);

  // 1. Spend 1,600ms in AWAIT_ROLL -> both drop 1s and retain 600ms carry
  nowMs += 1_600;
  matchClock.advance(nowMs, true);
  turnClock.advance(nowMs, true);
  assert.equal(matchClock.getRemainingSeconds(), 1199);
  assert.equal(turnClock.getRemainingSeconds(), 44);
  assert.equal(turnClock.getCarryMs(), 600);

  // 2. Spend 2,500ms in ROLLING_DICE + MOVING_TOKEN -> matchClock advances, turnClock freezes & preserves 600ms carry!
  for (let i = 0; i < 10; i++) {
    nowMs += 250;
    matchClock.advance(nowMs, true);
    turnClock.advance(nowMs, false);
  }
  assert.equal(matchClock.getRemainingSeconds(), 1196); // 1.6s + 2.5s = 4.1s -> 4s consumed (1200 - 4 = 1196)
  assert.equal(matchClock.getCarryMs(), 100);
  assert.equal(turnClock.getRemainingSeconds(), 44, 'Turn clock must freeze during ROLLING_DICE/MOVING_TOKEN');
  assert.equal(turnClock.getCarryMs(), 600, 'Turn clock must keep sub-second carry across animation');

  // 3. Resume in BUY_DECISION for 500ms -> 600ms + 500ms = 1,100ms -> turn clock drops 1s (44 -> 43) with 100ms carry
  nowMs += 500;
  matchClock.advance(nowMs, true);
  const res = turnClock.advance(nowMs, true);
  assert.equal(res.changed, true);
  assert.equal(res.remainingSeconds, 43);
  assert.equal(turnClock.getCarryMs(), 100);
});

test('BUG-03: Pause/Resume, timer throttling, tab switch bursts, reset, and ensureFloor work accurately', () => {
  let nowMs = 1_000;
  const clock = createMonotonicCountdownClock(45, nowMs);

  // Run 750ms
  nowMs += 750;
  clock.advance(nowMs, true);
  assert.equal(clock.getRemainingSeconds(), 45);
  assert.equal(clock.getCarryMs(), 750);

  // Pause for 4,300ms (interval stopped during pause, then syncTimestamp on Resume)
  nowMs += 4_300;
  clock.syncTimestamp(nowMs);
  assert.equal(clock.getRemainingSeconds(), 45, 'Pause duration must not deduct seconds');
  assert.equal(clock.getCarryMs(), 750, 'Pre-pause fractional carry must survive Pause/Resume');

  // Resume for 300ms -> 750 + 300 = 1,050ms -> drops 1s
  nowMs += 300;
  clock.advance(nowMs, true);
  assert.equal(clock.getRemainingSeconds(), 44);
  assert.equal(clock.getCarryMs(), 50);

  // Timer throttling / background tab burst: single callback arrives 5,400ms later!
  nowMs += 5_400;
  const burst = clock.advance(nowMs, true);
  assert.equal(burst.wholeSecondsConsumed, 5);
  assert.equal(burst.remainingSeconds, 39);
  assert.equal(clock.getCarryMs(), 450);

  // ensureFloor(18) does not reduce 39s, but raises 10s up to 18s cleanly
  assert.equal(clock.ensureFloor(18, nowMs), 39);
  clock.reset(10, nowMs);
  assert.equal(clock.getRemainingSeconds(), 10);
  assert.equal(clock.getCarryMs(), 0);
  assert.equal(clock.ensureFloor(18, nowMs), 18);
  assert.equal(clock.getRemainingSeconds(), 18);

  // Advance past zero clamps cleanly at 0 without going negative
  nowMs += 30_000;
  clock.advance(nowMs, true);
  assert.equal(clock.getRemainingSeconds(), 0);
  assert.equal(clock.getCarryMs(), 0);

  // Backward timestamp anomaly never breaks monotonic state
  clock.reset(45, nowMs);
  clock.advance(nowMs - 500, true);
  assert.equal(clock.getRemainingSeconds(), 45);
  assert.equal(clock.getCarryMs(), 0);
});

test('BUG-03 (Review Round 2): ensureFloor(min, now, wasActive=true) preserves active sub-second elapsed time when floor is already satisfied', () => {
  let nowMs = 10_000;
  const clock = createMonotonicCountdownClock(30, nowMs);

  // Run 400ms in active phase (e.g. CARD_REVEAL) -> carry = 400ms
  nowMs += 400;
  clock.advance(nowMs, true);
  assert.equal(clock.getRemainingSeconds(), 30);
  assert.equal(clock.getCarryMs(), 400);

  // 180ms later, transition CARD_REVEAL (active) -> CARD_TARGET_SELECTION with ensureFloor(18, nowMs, true)
  nowMs += 180;
  const ensureFloor = clock.ensureFloor as (min: number, now: number, wasActive?: boolean) => number;
  const rem = ensureFloor(18, nowMs, true);
  assert.equal(rem, 30);
  assert.equal(
    clock.getCarryMs(),
    580,
    'Active phase transition with ensureFloor must preserve the 180ms elapsed since last tick (400 + 180 = 580ms)'
  );

  // Transition from inactive animation phase (wasActive=false) discards animation delta while preserving pre-animation carry
  nowMs += 1500;
  ensureFloor(18, nowMs, false);
  assert.equal(clock.getRemainingSeconds(), 30);
  assert.equal(clock.getCarryMs(), 580);
});

test('AT-UNIT-03: monotonic beat tracker freezes on Pause and completes in 1 throttled 1Hz tick instead of stretching to 10.5s', async () => {
  // 1. Direct tracker contract
  let nowMs = 1_000;
  const tracker = createMonotonicBeatTracker(740, nowMs);

  nowMs += 200;
  let step = tracker.advance(nowMs, true);
  assert.equal(step.done, false);
  assert.equal(step.elapsedMs, 200);
  assert.equal(step.remainingMs, 540);

  // Paused for 3,000ms -> 0 elapsed
  nowMs += 3_000;
  step = tracker.advance(nowMs, false);
  assert.equal(step.done, false);
  assert.equal(step.elapsedMs, 200);
  assert.equal(step.remainingMs, 540);

  // Resumed and throttled background timer fires 1,000ms later -> done immediately!
  nowMs += 1_000;
  step = tracker.advance(nowMs, true);
  assert.equal(step.done, true);
  assert.equal(step.elapsedMs, 1_200);
  assert.equal(step.remainingMs, 0);

  // 2. Async waitMonotonicBeat under simulated Chrome 1Hz background throttling
  let simNowMs = 5_000;
  let timerCount = 0;
  const queued: Array<() => void> = [];

  const throttledBeatPromise = waitMonotonicBeat({
    targetMs: 740,
    pollMs: 60,
    isCancelled: () => false,
    isActive: () => true,
    now: () => simNowMs,
    setTimer: (cb) => {
      timerCount += 1;
      queued.push(cb);
      return timerCount;
    },
  });

  assert.equal(queued.length, 1);
  // Chrome throttles timer to ~1000ms in background tab: ONE tick must resolve the 740ms beat!
  simNowMs += 1_000;
  queued.shift()?.();
  const completedInOneThrottledTick = await throttledBeatPromise;
  assert.equal(completedInOneThrottledTick, true);
  assert.equal(timerCount, 1, 'Background-throttled beat must resolve in 1 tick (~1s), not 13 ticks (~10.5s)');

  // 3. Pause + Cancellation behavior
  let paused = true;
  let cancelled = false;
  let cancelNowMs = 10_000;
  const cancelQueue: Array<() => void> = [];
  const cancelPromise = waitMonotonicBeat({
    targetMs: 400,
    pollMs: 60,
    isCancelled: () => cancelled,
    isActive: () => !paused,
    now: () => cancelNowMs,
    setTimer: (cb, ms) => {
      cancelQueue.push(cb);
      return ms;
    },
  });

  cancelNowMs += 2_000;
  cancelQueue.shift()?.();
  assert.equal(cancelQueue.length, 1, 'While paused, 2000ms must not finish the beat');

  paused = false;
  cancelled = true;
  cancelNowMs += 60;
  cancelQueue.shift()?.();
  assert.equal(await cancelPromise, false, 'Cancelled beat must resolve false immediately');
  assert.equal(cancelQueue.length, 0);
});
