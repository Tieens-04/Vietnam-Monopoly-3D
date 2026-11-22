# 3D Physics, GTAO & Realistic Multi-Currency Treasury Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate real-time `cannon-es` 3D rigid-body physics, `GTAOPass` ambient occlusion, and a GPU-instanced 4-style 3D Treasury & Cash-Flow system showing each player's wealth and live incoming/outgoing money transfers.

**Architecture:** Pure currency decomposition and transaction diffing live in `src/game/currencyLogic.ts`; deterministic pre-simulated `cannon-es` rigid-body dice & coin-bounce trajectories live in `src/three/physicsEngine.ts`; GPU `InstancedMesh` vaults, custom GLSL banknote-flutter / metallic-glint shaders, and flying physical transfers live in `src/three/treasurySystem.ts`; React UI selectors and procedural Web Audio SFX connect through `App.tsx`, `StartModal.tsx`, `ActionDock.tsx`, `PlayerHUD.tsx`, and `soundEngine.ts`.

**Tech Stack:** TypeScript, Three.js `0.187.0` (`GTAOPass`, `InstancedMesh`, custom GLSL `onBeforeCompile`), `cannon-es`, React 19, Tailwind CSS v4, Web Audio API.

**Spec:** `docs/superpowers/specs/2026-11-21-3d-physics-and-treasury-design.md`

## Global Constraints

- Zero `backdrop-filter` over the active WebGL canvas.
- Zero per-frame `Geometry`, `Material`, or `Texture` allocations inside `requestAnimationFrame`.
- Automatic fallback on `isSoftwareGl === true` (bypass `GTAOPass` and `UnrealBloomPass` while keeping `cannon-es` dice and `InstancedMesh` vaults).
- `package.json` test runner `tsx --test src/game/*.test.ts src/server/*.test.ts` (plus `src/three/*.test.ts` added to `npm test`) must pass 100%.

## Review Focus

- Match restart / new match reset (`sessionEpoch` change or `screenState` returning to `'title'`) must NOT trigger fake massive cash-flow transfers from previous match balances to initial `2,000,000` balances.
- Bankrupt player (`player.bankrupt === true` or `player.cash <= 0`) must display `0` units on their 3D vault tray cleanly without NaN matrices.
- Multi-payer card (`COLLECT_FROM_ALL` Birthday `+25K` from 3 opponents) must generate 3 distinct `PLAYER_TO_PLAYER` transfers into the birthday player's vault rather than misclassifying as bank income.
- Switching `currencyStyle` mid-match in `ActionDock` must immediately rebuild static vault instances in the new style without spawning false incoming/outgoing transfer arcs.
- `cannon-es` dice simulation must handle edge cases where a die settles slightly tilted against a courtyard wall or another die and still map cleanly to exact `(die1, die2)` top faces.

---

### Task 1: Pure Currency Decomposition, Style Persistence & Cash-Flow Diffing (`currencyLogic.ts`)

**Files:**
- Create: `src/game/currencyLogic.ts`
- Test: `src/game/currencyLogic.test.ts`
- Modify: `src/game/types.ts`

**Interfaces:**
- Produces:
  - `export type CurrencyStyleId = 'cash' | 'coins' | 'bullion' | 'mixed'`
  - `export type VisualUnitKind = 'bill_500k' | 'bill_200k' | 'bill_100k' | 'bill_50k' | 'bill_20k' | 'coin_gold' | 'coin_silver' | 'coin_bronze' | 'gold_bar' | 'chip_100k' | 'chip_50k' | 'chip_10k'`
  - `export function decomposeCashToVisualUnits(cash: number, style: CurrencyStyleId): VisualVaultUnit[]`
  - `export function detectCashFlowTransfers(prevPlayers: PlayerState[], nextPlayers: PlayerState[], prevProps: Record<number, PropertyState>, nextProps: Record<number, PropertyState>): CashFlowTransferEvent[]`
  - `export function getVaultWorldAnchor(slotIndex: number): { x: number; y: number; z: number; rotY: number }`

- [ ] **Step 1: Write failing unit tests in `src/game/currencyLogic.test.ts` covering all 4 styles, zero/bankrupt cash, match-reset guard, Birthday multi-payer, rent, property buy, tax, and Start salary**
- [ ] **Step 2: Run `npm test` and confirm RED failure**
- [ ] **Step 3: Implement `src/game/currencyLogic.ts` and export `CurrencyStyleId` in `src/game/types.ts`**
- [ ] **Step 4: Run `npm test` and confirm GREEN**

---

### Task 2: Deterministic `cannon-es` 3D Dice & Physical Bounce Engine (`physicsEngine.ts`)

**Files:**
- Modify: `package.json` (install `cannon-es` and include `src/three/*.test.ts` in `npm test`)
- Create: `src/three/physicsEngine.ts`
- Test: `src/three/physicsEngine.test.ts`

**Interfaces:**
- Consumes: `DICE_BOX_FACE_VALUES` from `src/game/rules.ts`
- Produces:
  - `export interface SimulatedDiceTrajectory { duration: number; frames1: DicePoseFrame[]; frames2: DicePoseFrame[]; collisionTimes: number[] }`
  - `export function simulateDeterministicDiceRoll(die1: number, die2: number, seed?: number): SimulatedDiceTrajectory`
  - `export function sampleDiceTrajectoryAt(traj: SimulatedDiceTrajectory, normalizedT: number): { pos1: THREE.Vector3; quat1: THREE.Quaternion; pos2: THREE.Vector3; quat2: THREE.Quaternion }`
  - `export function computePhysicalTrayBounceY(u: number, restitution: number): number`

- [ ] **Step 1: Install `cannon-es` and write failing test `src/three/physicsEngine.test.ts` testing all 36 `(die1, die2)` pairs (`1..6 × 1..6`) verify wall/floor bounds, mid-air collision/tumble, and exact final upward `+Y` face normal**
- [ ] **Step 2: Run `npm test` and confirm RED failure**
- [ ] **Step 3: Implement `src/three/physicsEngine.ts` with `cannon-es` rigid-body stepping + local orthogonal face permutation `Q_remap`**
- [ ] **Step 4: Run `npm test` and confirm GREEN across all 36 pairs**

---

### Task 3: GPU `InstancedMesh` 3D Treasury Vaults, Custom GLSL Shaders & Flying Transfers (`treasurySystem.ts`)

**Files:**
- Create: `src/three/treasurySystem.ts`
- Modify: `src/three/models.ts` (remove legacy static outer cash/coin decorative clusters from `createSurroundingVista` so the 4 live Player Vaults + Bank Vault own the outer board perimeter cleanly)

**Interfaces:**
- Consumes: `CurrencyStyleId`, `decomposeCashToVisualUnits`, `CashFlowTransferEvent`, `getVaultWorldAnchor` from `src/game/currencyLogic.ts`; `computePhysicalTrayBounceY` from `src/three/physicsEngine.ts`
- Produces:
  - `export function createTreasurySystem(maxAnisotropy: number, isSoftwareGl: boolean): TreasurySystemController`

- [ ] **Step 1: Remove static decorative cash/coin clusters in `src/three/models.ts` (`createSurroundingVista`) while keeping `?` Chance deck, blossoms/lanterns, streetlamps, clouds, and stars**
- [ ] **Step 2: Implement `src/three/treasurySystem.ts` with 4 player-tinted 3D Vault Trays + 1 Central Bank Vault, 4 `InstancedMesh` batches (Polymer Bills with GLSL flutter shader, Embossed Metallic Coins, Beveled Gold Bullion Bars with GLSL specular glint sweep, Striped Casino Chips), live balance stacking, and Bezier + physical tray-bounce incoming/outgoing transfer arcs**
- [ ] **Step 3: Run `npm run lint` and `npm test` to confirm clean compilation**

---

### Task 4: `GTAOPass` Post-Processing, `MonopolyCanvas` Integration, Multi-Currency UI & Material Audio

**Files:**
- Modify: `src/components/MonopolyCanvas.tsx`
- Modify: `src/audio/soundEngine.ts`
- Modify: `src/components/StartModal.tsx`
- Modify: `src/components/ActionDock.tsx`
- Modify: `src/components/PlayerHUD.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `TreasurySystemController`, `simulateDeterministicDiceRoll`, `GTAOPass`, `CurrencyStyleId`, `detectCashFlowTransfers`
- Produces: Complete end-to-end interactive 3D currency selection, live vault rendering, physical dice & cash-flow audio-visual feedback.

- [ ] **Step 1: Add `playCurrencyTransfer(style: CurrencyStyleId, isGain: boolean)` and collision-timed `playPhysicsDiceHit(intensity: number)` to `src/audio/soundEngine.ts`**
- [ ] **Step 2: Integrate `GTAOPass`, `simulateDeterministicDiceRoll`, `createTreasurySystem`, and automatic `detectCashFlowTransfers` into `src/components/MonopolyCanvas.tsx`**
- [ ] **Step 3: Add 4-way `CurrencyStyleId` selector to `StartModal.tsx` & `ActionDock.tsx`, dynamic currency emblem + cash-flow pulse to `PlayerHUD.tsx`, and state persistence (`localStorage` key `bt_vn_currency_style`) in `src/App.tsx`**
- [ ] **Step 4: Run `npm run lint`, `npm test`, and `npm run build` and verify exit code 0**

---

### Task 5: Live Browser Visual & Interactive Audit Across All 4 Currency Modes

**Files:**
- Update: `C:\Users\nguye\.gemini\antigravity\brain\595994f5-3cc8-4a26-b7f9-56d76eb6a42f\walkthrough.md`
- Update: `C:\Users\nguye\.gemini\antigravity\brain\595994f5-3cc8-4a26-b7f9-56d76eb6a42f\task.md`

- [ ] **Step 1: Restart dev server and dispatch Browser Subagent to test Lobby selector, `cannon-es` dice bounce, live outgoing/incoming 3D money arcs, `GTAOPass` shadows, and hot-switching all 4 currency modes (`Tiền mặt`, `Tiền xu`, `Vàng & Chip`, `Hỗn hợp`)**
- [ ] **Step 2: Inspect all captured screenshots with multimodal vision, polish any visual rough edges, and re-verify `npm run lint`, `npm test`, and `npm run build`**
