# Gameplay Bug Remediation Progress Ledger

- **Base Commit:** `main` @ `515feab`
- **Status:** **ALL 3 WAVES + PERMANENT TEST SUITES + 190 SIMULATIONS + 45 HEADED E2E + ADVERSARIAL AUDIT & INDEPENDENT REVIEW ROUND 2 + DOCS COMPLETED (UNCOMMITTED WORKING TREE)**

## Execution Checklist

### Wave 1 — Gameplay Integrity & Multiplayer
- [x] **Step 1 — BUG-02 (P1):** Seat & Turn Order (`startMatch` single loop by `seatIdx`). RED → GREEN in `roomManager.test.ts` + `e2e/online-resilience.spec.ts`.
- [x] **Step 2 — BUG-01 (P1):** AFK Takeover counted strictly per full missed turn (`turnCount`, excluding out-of-turn `ch-10`). RED → GREEN in `roomManager.test.ts` + `probes.ts` + `pw-online-and-matrix-audit.ts`.
- [x] **Step 3 — BUG-06 (P3):** Explicit `ERROR` (`INVALID_STATE` / `INVALID_ACTION`) on phase-mismatched / invalid `GAME_ACTION`. RED → GREEN in `roomManager.test.ts` + `e2e/online-resilience.spec.ts`.
- [x] **Step 4 — BUG-04 (P1):** `decisionRevision`, per-player `actionId` FIFO dedup (`${playerId}:${actionId}`), `expectedTurnCount`/`expectedPhase`/`expectedDecisionRevision`, client `isSynced`, stale WS `wsRef.current !== ws` guard & bootstrap-only `pendingQueueRef`. RED → GREEN in `roomManager.test.ts`, `onlineClient.test.ts`, `e2e/online-resilience.spec.ts`, `pw-online-and-matrix-audit.ts`.
- [x] **Step 5 — BUG-05 (P1):** Sudden Death `TIME_LIMIT` FIFO settlement for `pendingDebt` + `pendingDebtQueue` (`computeEffectiveNetWorths`, `effectiveNetWorthByPlayerId`, `effectiveCashByPlayerId` + `laps` tie-break, `VictoryModal` FFA & 2v2). RED → GREEN in `rules.test.ts`, `roomManager.test.ts`, `probes.ts`.
- [x] **Wave 1 Gate:** `npm run lint` PASS · `npm test` 90/90 PASS · `npm run build` PASS · Targeted Playwright E2E 20/20 PASS.

### Wave 2 — Gameplay Timing & Animation
- [x] **Step 6 — BUG-11 (P2):** `normalizeTacticalDiceChoice` + Online/Offline reset on turn/decision/jail/0-charges + `ActionDock` `aria-pressed` guard. RED → GREEN in `rules.test.ts`, `e2e/online-resilience.spec.ts`, `pw-online-and-matrix-audit.ts`.
- [x] **Step 7 — BUG-03 (P2):** `src/game/gameplayClock.ts` monotonic `performance.now()` match & turn countdown clocks decoupled from `turnPhase` (+ Round 2 `ensureFloor(..., wasActive)` & `RulebookModal` timestamp sync). RED → GREEN in `gameplayClock.test.ts` (4/4), `e2e/online-resilience.spec.ts`, `pw-fps-and-clock-benchmark.ts` (`0.0s / 61.0s`, `-0.06%`).
- [x] **Step 8 — BUG-10 (P2 — Top Priority):** `computeBoardFrameDeltas` decoupling `gameplayAnimDt` from `visualAnimDt`, single-flight `scheduleToken` RAF fallback (`500ms` — 100% pure RAF at 60/30/15/5/2.5 FPS), ordered `onStep` + re-entrancy guard + `resolveOnce()` + Pause/Resume (`justResumedFromPauseRef`)/Reset/Unmount/Visibility/Reconnect cleanup. RED → GREEN in `graphicsQuality.test.ts` (3/3 BUG-10 tests), `e2e/online-resilience.spec.ts`, `pw-fps-and-clock-benchmark.ts` (`60/30/15/5/2.5 FPS` = `5.54s–6.10s`, Hidden Tab `10.52s` / `23.58s`, `33` WebGL frames).
- [x] **Wave 2 Gate:** `npm run lint` PASS · `npm test` 96/96 PASS · `npm run build` PASS · Targeted Playwright E2E 24/24 PASS.

### Wave 3 — Gameplay Consistency & Bot Reliability
- [x] **Step 9 — BUG-08 (P3):** Team-aware `computeOptimalAutoSale` (2v2 color monopolies + multi-Resort sets across all 5 call sites). RED → GREEN in `rules.test.ts`, `probes.ts`, `sim.ts --all-190` (`B4`).
- [x] **Step 10 — BUG-07 (P3):** Shared `validateInitialPropertyPurchase`, `validateChampionshipHostSelection` & `canBuyoutProperty` keeping Offline decision modals (`handleBuyProperty`, `handleOnTileUpgrade`, `handleConfirmChampionship`, `handleConfirmBuyout`) & `isFreeChampionship` open on invalid human input matching Online (`performConfirmBuyout` returns `boolean` + `INVALID_ACTION`). RED → GREEN in `rules.test.ts`, `roomManager.test.ts`.
- [x] **Step 11 — BUG-09 (P3):** State-aware Bot watchdog (`inFlightBeatCount`, `botActionExecuting`, `botScheduledMeta`, `clearBotActionTimer`, bounded `botWatchdogAttempts <= 2`). RED → GREEN in `roomManager.test.ts`, `probes.ts`.

### Permanent Suites, Full Regression & Final Audit
- [x] Added `src/server/simulation.test.ts` (10 seeded Bot-vs-Bot invariant matches inside `npm test`).
- [x] Added `e2e/online-resilience.spec.ts` (4 headed Playwright E2E tests).
- [x] Migrated reproducible scripts from `%TEMP%/audit/` to `scripts/gameplay-audit/` (`sim.ts`, `probes.ts`, `pw-fps-and-clock-benchmark.ts`, `pw-online-and-matrix-audit.ts`).
- [x] Full 190 seeded baseline simulations (`scripts/gameplay-audit/sim.ts --all-190`): **190/190 completed, 0 stuck, 0 violations** (`160/160` FFA bit-for-bit identical to baseline).
- [x] Full Playwright E2E suite (`npx playwright test --headed`): **45/45 PASS (`13.0m`, 0 failures)** — fresh full run after Round 2 final edits.
- [x] Adversarial diff audit Round 1 (**Audit Hardening**): rejected `INVALID_ACTION` payloads in `perform*` handlers now return `false` so AFK counter & `processedActionIds` are never mutated on rejection.
- [x] Independent Second-Agent Review (**Round 2**): caught & fixed 7 edge-case issues + 1 flaky `BUG-09` test (`waitUntil`) + 1 `pw-online-and-matrix-audit.ts` delta-badge regex fix (`all4HudIdentical: true`), backed by 5 new TDD regression tests (`rafFallbackMs` 120ms→500ms, visibility idle leak & low-FPS `justResumedFromPauseRef`, per-player `actionId` scoping & stale WS `onclose` guard, `RECONNECT_ROOM` preserving `lastHumanActionTurnCountByPlayer` + `RECLAIM_CONTROL` recording turn & `ensureSubPhaseTimeFloor(match, 18)`, `BUG-05` `effectiveCashByPlayerId` + `laps` tie-break parity, `BUG-03` `ensureFloor(..., wasActive)` & `RulebookModal` sync, `BUG-07` `performConfirmBuyout` / `handleConfirmBuyout` invalid-action parity).
- [x] Post-final-edit re-verification: `npm run lint` PASS (`0` errors) · `npm test` **106/106 PASS (`55.3s`)** · `npm run build` PASS (`0.71s`, `1,352.48 kB`) · `npx playwright test --headed` **45/45 PASS (`13.0m`)** · `sim.ts --all-190` **190/190 PASS** · `probes.ts` 6/6 PASS · `pw-fps-and-clock-benchmark.ts` PASS · `pw-online-and-matrix-audit.ts` PASS (`all4HudIdentical: true`).
- [x] Completed all documentation updates (`BUG-LIST.md`, `TEST-MATRIX.md`, `GAMEPLAY-AUDIT-REPORT.md`, `BUSINESS-TOUR-RULES-COMPARISON.md`, `GAMEPLAY-FLOW.md`, `FIX-IMPLEMENTATION-PLAN.md`, `PROGRESS-LEDGER.md`) and authored all 5 new reports (`BUG-FIX-REPORT.md`, `REGRESSION-TEST-REPORT.md`, `PERFORMANCE-COMPARISON.md`, `FINAL-GAMEPLAY-AUDIT.md`, `RELEASE-READINESS-CHECKLIST.md`).
