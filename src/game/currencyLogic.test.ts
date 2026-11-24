import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_PLAYER_CONFIGS } from './boardData';
import {
  decomposeCashToVisualUnits,
  detectCashFlowTransfers,
  getVaultWorldAnchor,
} from './currencyLogic';
import { createInitialPlayers, createInitialProperties } from './rules';
import { CurrencyStyleId } from './types';

test('decomposeCashToVisualUnits handles 0/bankrupt, odd amounts, and caps across all 4 currency styles', () => {
  const styles: CurrencyStyleId[] = ['cash', 'coins', 'bullion', 'mixed'];
  for (const style of styles) {
    assert.deepEqual(
      decomposeCashToVisualUnits(0, style),
      [],
      `Zero cash must yield empty units for ${style}`
    );
    assert.deepEqual(
      decomposeCashToVisualUnits(-50_000, style),
      [],
      `Negative cash must yield empty units for ${style}`
    );

    const standardUnits = decomposeCashToVisualUnits(2_000_000, style);
    assert.ok(
      standardUnits.length >= 16 && standardUnits.length <= 48,
      `Expected rich multi-layer stack >= 16 units for 2M (${style}), got ${standardUnits.length}`
    );
    const maxStackY = Math.max(...standardUnits.map((u) => u.localY));
    assert.ok(
      maxStackY >= 0.28,
      `Expected multi-layer vertical stack height >= 0.28 for 2M (${style}), got ${maxStackY.toFixed(3)}`
    );

    const richUnits = decomposeCashToVisualUnits(15_000_000, style);
    assert.ok(richUnits.length >= standardUnits.length, `15M must render at least as many units as 2M (${style})`);
    assert.ok(richUnits.length <= 48, `15M must stay bounded <= 48 per vault (${style}), got ${richUnits.length}`);
  }

  // Verify style-specific visual categories
  const cashUnits = decomposeCashToVisualUnits(780_000, 'cash');
  assert.ok(cashUnits.every((u) => u.meshCategory === 'bill'));

  const coinUnits = decomposeCashToVisualUnits(780_000, 'coins');
  assert.ok(coinUnits.every((u) => u.meshCategory === 'coin'));

  const bullionUnits = decomposeCashToVisualUnits(1_260_000, 'bullion');
  assert.ok(bullionUnits.some((u) => u.meshCategory === 'bullion'));
  assert.ok(bullionUnits.some((u) => u.meshCategory === 'chip'));

  const mixedUnits = decomposeCashToVisualUnits(1_260_000, 'mixed');
  assert.ok(mixedUnits.some((u) => u.meshCategory === 'bill'));
  assert.ok(mixedUnits.some((u) => u.meshCategory === 'coin'));
});

test('getVaultWorldAnchor places 4 player trays symmetrically at the 4 board edges and Central Bank inside courtyard', () => {
  const p0 = getVaultWorldAnchor(0); // Top-Left HUD edge: x - z < 0, x + z < 0
  const p1 = getVaultWorldAnchor(1); // Top-Right HUD edge: x - z > 0, x + z < 0
  const p2 = getVaultWorldAnchor(2); // Bottom-Right HUD edge: x - z > 0, x + z > 0
  const p3 = getVaultWorldAnchor(3); // Bottom-Left HUD edge: x - z < 0, x + z > 0
  const bank = getVaultWorldAnchor(-1); // Central Bank inlaid on right courtyard wing

  assert.ok(p0.x - p0.z < -6 && p0.x + p0.z < -10);
  assert.ok(p1.x - p1.z > 6 && p1.x + p1.z < -10);
  assert.ok(p2.x - p2.z > 6 && p2.x + p2.z > 10);
  assert.ok(p3.x - p3.z < -6 && p3.x + p3.z > 10);

  for (const edgeAnchor of [p0, p1, p2, p3]) {
    const outerSpan = Math.max(Math.abs(edgeAnchor.x), Math.abs(edgeAnchor.z));
    const r = Math.hypot(edgeAnchor.x, edgeAnchor.z);
    assert.ok(
      outerSpan >= 12.2 && r <= 13.8,
      `Expected player tray anchor well clear of 9.35 price tabs ([12.2, 13.8]), got outerSpan=${outerSpan.toFixed(2)}, r=${r.toFixed(2)}`
    );
  }

  // Central Bank stays inlaid inside the sunken courtyard
  assert.ok(
    Math.abs(bank.x) <= 4.5 && Math.abs(bank.z) <= 4.5,
    `Expected Central Bank anchor (${bank.x}, ${bank.z}) inside courtyard [-4.5, +4.5]`
  );
});

test('detectCashFlowTransfers classifies rent, property investment, Start salary, Tax, Birthday multi-payer, and skips match reset', () => {
  const basePlayers = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000);
  const baseProps = createInitialProperties();

  // 1. Property purchase (-270K on Hội An tile 7) -> PLAYER_TO_TILE
  const afterBuyPlayers = basePlayers.map((p, i) =>
    i === 0 ? { ...p, position: 7, cash: 1_730_000 } : p
  );
  const afterBuyProps = {
    ...baseProps,
    7: { tileIndex: 7, ownerId: 0, level: 2 },
  };
  const buyEvents = detectCashFlowTransfers(basePlayers, afterBuyPlayers, baseProps, afterBuyProps);
  assert.equal(buyEvents.length, 1);
  assert.equal(buyEvents[0].kind, 'PLAYER_TO_TILE');
  assert.equal(buyEvents[0].fromPlayerId, 0);
  assert.equal(buyEvents[0].tileIndex, 7);
  assert.equal(buyEvents[0].amount, 270_000);

  // 2. Direct rent payment (Player 1 pays 210K to Player 0) -> PLAYER_TO_PLAYER
  const afterRentPlayers = afterBuyPlayers.map((p) => {
    if (p.id === 1) return { ...p, position: 7, cash: p.cash - 210_000 };
    if (p.id === 0) return { ...p, cash: p.cash + 210_000 };
    return p;
  });
  const rentEvents = detectCashFlowTransfers(
    afterBuyPlayers,
    afterRentPlayers,
    afterBuyProps,
    afterBuyProps
  );
  assert.equal(rentEvents.length, 1);
  assert.equal(rentEvents[0].kind, 'PLAYER_TO_PLAYER');
  assert.equal(rentEvents[0].fromPlayerId, 1);
  assert.equal(rentEvents[0].toPlayerId, 0);
  assert.equal(rentEvents[0].amount, 210_000);

  // 3. Passing Start (+300K salary) -> BANK_TO_PLAYER (start_salary)
  const afterStartPlayers = afterRentPlayers.map((p) =>
    p.id === 2 ? { ...p, laps: 1, cash: p.cash + 300_000 } : p
  );
  const startEvents = detectCashFlowTransfers(
    afterRentPlayers,
    afterStartPlayers,
    afterBuyProps,
    afterBuyProps
  );
  assert.equal(startEvents.length, 1);
  assert.equal(startEvents[0].kind, 'BANK_TO_PLAYER');
  assert.equal(startEvents[0].toPlayerId, 2);
  assert.equal(startEvents[0].amount, 300_000);
  assert.equal(startEvents[0].reason, 'start_salary');

  // 4. Paying Tax / Penalty (-89K on Tax tile 30) -> PLAYER_TO_BANK (tax)
  const afterTaxPlayers = afterStartPlayers.map((p) =>
    p.id === 0 ? { ...p, position: 30, cash: p.cash - 89_000 } : p
  );
  const taxEvents = detectCashFlowTransfers(
    afterStartPlayers,
    afterTaxPlayers,
    afterBuyProps,
    afterBuyProps
  );
  assert.equal(taxEvents.length, 1);
  assert.equal(taxEvents[0].kind, 'PLAYER_TO_BANK');
  assert.equal(taxEvents[0].fromPlayerId, 0);
  assert.equal(taxEvents[0].amount, 89_000);
  assert.equal(taxEvents[0].reason, 'tax');

  // 4b. Liquidating owned property (+135K) -> BANK_TO_PLAYER (refund)
  const afterSellPlayers = afterTaxPlayers.map((p) =>
    p.id === 0 ? { ...p, cash: p.cash + 135_000 } : p
  );
  const afterSellProps = {
    ...afterBuyProps,
    7: { tileIndex: 7, ownerId: null, level: 0 },
  };
  const sellEvents = detectCashFlowTransfers(
    afterTaxPlayers,
    afterSellPlayers,
    afterBuyProps,
    afterSellProps
  );
  assert.equal(sellEvents.length, 1);
  assert.equal(sellEvents[0].kind, 'BANK_TO_PLAYER');
  assert.equal(sellEvents[0].reason, 'refund');

  // 5. Birthday card: 3 opponents each pay 25K to Player 0 (+75K) -> 3 PLAYER_TO_PLAYER transfers!
  const afterBdayPlayers = afterTaxPlayers.map((p) => {
    if (p.id === 0) return { ...p, cash: p.cash + 75_000 };
    return { ...p, cash: p.cash - 25_000 };
  });
  const bdayEvents = detectCashFlowTransfers(
    afterTaxPlayers,
    afterBdayPlayers,
    afterBuyProps,
    afterBuyProps
  );
  assert.equal(bdayEvents.length, 3);
  assert.ok(bdayEvents.every((e) => e.kind === 'PLAYER_TO_PLAYER' && e.toPlayerId === 0 && e.amount === 25_000));

  // 6. Match reset guard: all players reset uniformly to starting cash (e.g. 3_000_000) with 0 owned properties -> ZERO fake transfers!
  const resetPlayers = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 3_000_000);
  const resetEvents = detectCashFlowTransfers(
    afterBdayPlayers,
    resetPlayers,
    afterBuyProps,
    baseProps
  );
  assert.equal(resetEvents.length, 0);
});
