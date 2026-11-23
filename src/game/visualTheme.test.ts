import assert from 'node:assert/strict';
import test from 'node:test';
import { BOARD_TILES } from './boardData';
import { TileKind } from './types';
import {
  clampSpeechBubbleToViewport,
  computeSafeBoardCameraPose,
  generateOfflineBotQuip,
  getCityVisualProfile,
} from './visualTheme';

test('every purchasable city and resort tile maps to a regional architecture style and unique landmark motif', () => {
  const purchasable = BOARD_TILES.filter(
    (t) => t.kind === TileKind.PROPERTY || t.kind === TileKind.RESORT
  );
  assert.equal(purchasable.length, 24);

  const seenMotifs = new Set<string>();
  for (const tile of purchasable) {
    const profile = getCityVisualProfile(tile.index);
    assert.ok(
      ['heritage', 'coastal', 'metropolis'].includes(profile.architectureStyle),
      `Invalid style for tile ${tile.index} (${tile.name})`
    );
    assert.ok(profile.landmarkMotif.length > 2);
    seenMotifs.add(profile.landmarkMotif);
  }

  // Every single one of the 24 cities/resorts has its own distinct landmark motif
  assert.equal(seenMotifs.size, 24);

  // Spot-check iconic Vietnamese assignments
  assert.equal(getCityVisualProfile(7).architectureStyle, 'heritage'); // Hội An
  assert.equal(getCityVisualProfile(15).architectureStyle, 'coastal'); // Nha Trang
  assert.equal(getCityVisualProfile(27).architectureStyle, 'metropolis'); // Đà Nẵng
  assert.equal(getCityVisualProfile(31).architectureStyle, 'metropolis'); // TP. Hồ Chí Minh
});

test('computeSafeBoardCameraPose fits full diamond board horizontally on both desktop 1440x900 and mobile portrait 390x844', () => {
  const desktop = computeSafeBoardCameraPose(1440, 900);
  const mobile = computeSafeBoardCameraPose(390, 844);

  // Camera sits along +X, +Y, +Z isometric diagonal with snug board-only framing (zero wasted off-board space)
  assert.ok(desktop.posX > 22 && desktop.posX < 26, 'Desktop camera frames diamond board boldly without clipping');
  assert.ok(mobile.posX > desktop.posX * 1.4, 'Portrait mobile zooms out to fit full horizontal diamond span');

  // Verify projected horizontal half-span at FOV=26deg hugs the 11.74-unit diamond board in [11.8, 12.6] world units on mobile 390x844
  const fovRad = (26 * Math.PI) / 180;
  const dx = mobile.posX - mobile.targetX;
  const dy = mobile.posY - mobile.targetY;
  const dz = mobile.posZ - mobile.targetZ;
  const dist = Math.hypot(dx, dy, dz);
  const halfHeightWorld = dist * Math.tan(fovRad / 2);
  const halfWidthWorld = halfHeightWorld * (390 / 844);
  assert.ok(
    halfWidthWorld >= 11.8 && halfWidthWorld <= 12.6,
    `Expected snug board-focused mobile halfWidthWorld in [11.8, 12.6], got ${halfWidthWorld.toFixed(2)}`
  );
});

test('clampSpeechBubbleToViewport keeps left/right edge tile speech bubbles strictly inside safe screen bounds', () => {
  // Left-edge tile like Hội An projecting near x = 22px with a 190px-wide bubble
  const leftClamped = clampSpeechBubbleToViewport(22, 420, 190, 40, 1440, 900, 16);
  assert.ok(leftClamped.x - 190 / 2 >= 16, 'Left edge of centered bubble stays >= 16px');
  assert.ok(leftClamped.tailOffsetPx < 0, 'Tail shifts left toward actual 3D anchor');

  // Right-edge tile projecting near x = 1425px
  const rightClamped = clampSpeechBubbleToViewport(1425, 420, 190, 40, 1440, 900, 16);
  assert.ok(rightClamped.x + 190 / 2 <= 1440 - 16, 'Right edge of centered bubble stays <= viewport - 16px');
  assert.ok(rightClamped.tailOffsetPx > 0, 'Tail shifts right toward actual 3D anchor');
});

test('generateOfflineBotQuip produces witty Vietnamese remarks without dollar signs for all event kinds', () => {
  const buyQuip = generateOfflineBotQuip({
    botId: 1,
    botName: 'Chủ Tịch Lan Anh',
    botPersona: 'Chủ tập đoàn du thuyền sang chảnh',
    eventKind: 'BUY_PRIME_LAND',
    tileName: 'Hội An',
    amount: 270_000,
    botCashAfter: 1_730_000,
    extraContext: '',
  });
  assert.ok(buyQuip.includes('Hội An'));
  assert.ok(buyQuip.includes('270K'));
  assert.ok(!buyQuip.includes('$'));

  const rentQuip = generateOfflineBotQuip({
    botId: 2,
    botName: 'Shark Hoàng Nam',
    botPersona: 'Cá mập tài chính',
    eventKind: 'COLLECT_BIG_RENT',
    tileName: 'TP. Hồ Chí Minh',
    amount: 1_900_000,
    botCashAfter: 3_400_000,
    extraContext: '',
  });
  assert.ok(rentQuip.includes('TP. Hồ Chí Minh'));
  assert.ok(rentQuip.includes('1.9M'));
  assert.ok(!rentQuip.includes('$'));

  const penaltyQuip = generateOfflineBotQuip({
    botId: 3,
    botName: 'Phu Nhân Ngọc Diệp',
    botPersona: 'Đại gia đất nền truyền thống',
    eventKind: 'PAY_PENALTY',
    tileName: 'Thuế Bất Động Sản',
    amount: 150_000,
    botCashAfter: 1_100_000,
    extraContext: '',
  });
  assert.ok(penaltyQuip.includes('150K'));
  assert.ok(!penaltyQuip.includes('$'));
});
