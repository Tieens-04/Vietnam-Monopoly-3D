import { expect, test } from '@playwright/test';
import {
  attachZeroErrorGuard,
  enable2xSpeed,
  getTileScreenPoint,
} from './helpers';

test.describe('Business Tour Vietnam 3D — Full Headed Pre-Deploy Verification', () => {
  test('1. Auto-turn advance, Lap 1 cap -> Lv3 revisit unlocks Hotel ★, Tile 0 salary-only & 3D Hotel raycast', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);

    // Deterministic roll sequence for 2-player Hotseat (BUG-01 & BUG-02):
    // Roll 1 (P1): 1+2=3 -> Đà Lạt (Lap 1 cap: 3 Nhà absent; buy 2 Nhà = 170K) -> auto-advance to P2
    // Roll 2 (P2): 1+3=4 -> Vịnh Hạ Long (buy Resort) -> auto-advance to P1
    // Roll 3 (P1): 6+6=12 (doubles #1) -> 3+12=15 Nha Trang (buy Lv0 = 200K) -> bonus roll
    // Roll 4 (P1): 6+6=12 (doubles #2) -> 15+12=27 Đà Nẵng (skip) -> bonus roll
    // Roll 5 (P1): 3+5=8 -> 27+8=35 ≡ 3 Đà Lạt (passes START +300K, Lap 2; Lv2 -> Hotel ★ DISABLED, upgrade to Lv3!)
    // Roll 6 (P2): 1+2=3 -> 4+3=7 Hội An (skip) -> auto-advance to P1
    // Roll 7 (P1): 6+6=12 (doubles #1) -> 3+12=15 Nha Trang (skip upgrade) -> bonus roll
    // Roll 8 (P1): 6+6=12 (doubles #2) -> 15+12=27 Đà Nẵng (skip) -> bonus roll
    // Roll 9 (P1): 3+5=8 -> 27+8=35 ≡ 3 Đà Lạt (passes START +300K, Lap 3; Lv3 -> Hotel ★ NOW ENABLED, upgrade to Cấp 4 ★!)
    // Roll 10 (P2): 1+2=3 -> 7+3=10 Tuy Hòa (skip) -> auto-advance to P1
    // Roll 11 (P1): 6+6=12 (doubles #1) -> 3+12=15 Nha Trang (skip upgrade) -> bonus roll
    // Roll 12 (P1): 5+5=10 (doubles #2) -> 15+10=25 Phú Quốc (skip) -> bonus roll
    // Roll 13 (P1): 3+4=7 -> 25+7=32 ≡ 0 BẮT ĐẦU (BUG-01: NO start-upgrade-modal; +300K salary, Vòng 4, auto-advance to P2!)
    await page.goto(
      '/?autostart=1&players=2&hotseat=1&dice=1-2,1-3,6-6,6-6,3-5,1-2,6-6,6-6,3-5,1-2,6-6,5-5,3-4'
    );
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await enable2xSpeed(page);

    // Roll 1 (P1) -> Đà Lạt (Tile 3)
    await page.getByTestId('bt-roll-dice-btn').click();
    const buyModal = page.getByTestId('buy-decision-modal');
    await expect(buyModal).toBeVisible();
    await expect(buyModal).toContainText('Đà Lạt');

    // Lap 1 cap check: 3 Nhà option is not available on Lap 1; buy 2 Nhà!
    await expect(buyModal.getByRole('button', { name: /3 Nhà/i })).toHaveCount(0);
    await buyModal.getByRole('button', { name: /2 Nhà/i }).click();
    await buyModal.getByRole('button', { name: /Mua Ngay/i }).click();

    // Auto-advance check: NO manual End Turn button; P2 can roll immediately
    await expect(page.getByTestId('bt-end-turn-btn')).toHaveCount(0);
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();

    // Roll 2 (P2) -> Vịnh Hạ Long (Tile 4 Resort)
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await expect(buyModal).toContainText('Vịnh Hạ Long');
    await buyModal.getByRole('button', { name: /Mua Ngay/i }).click();

    // Roll 3 (P1): Doubles #1 -> Nha Trang (buy Lv0)
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await expect(buyModal).toContainText('Nha Trang');
    await buyModal.getByRole('button', { name: /Đất trống/i }).click();
    await buyModal.getByRole('button', { name: /Mua Ngay/i }).click();

    // Roll 4 (P1): Doubles #2 -> Đà Nẵng (skip)
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await expect(buyModal).toContainText('Đà Nẵng');
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    // Roll 5 (P1): passes START (+300K, Lap 2) & revisits Đà Lạt (Lv2):
    // BUG-02 Part A: Hotel ★ (Cấp 4) MUST be disabled at Lv2; upgrade to Nhà Cấp 3!
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();

    const upgModal = page.getByTestId('upgrade-decision-modal');
    await expect(upgModal).toBeVisible();
    await expect(upgModal).toContainText('Đà Lạt');

    const hotelBtn = upgModal.getByRole('button', {
      name: /Khách Sạn Biểu Tượng \(Cấp 4 ★\)/i,
    });
    const lv3Btn = upgModal.getByRole('button', { name: /Nhà Cấp 3/i });
    await expect(hotelBtn).toBeDisabled();
    await expect(lv3Btn).toBeEnabled();
    await lv3Btn.click();
    await upgModal.getByTestId('bt-confirm-upgrade-btn').click();

    // Roll 6 (P2) -> Hội An (skip)
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    // Roll 7 (P1) -> Nha Trang (skip upgrade)
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(upgModal).toBeVisible();
    await expect(upgModal).toContainText('Nha Trang');
    await upgModal.getByRole('button', { name: 'Giữ Nguyên' }).click();

    // Roll 8 (P1) -> Đà Nẵng (skip)
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    // Roll 9 (P1) -> revisits Đà Lạt at Lv3:
    // BUG-02 Part B: Hotel ★ (Cấp 4) is NOW ENABLED! Upgrade to Cấp 4 ★!
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(upgModal).toBeVisible();
    await expect(upgModal).toContainText('Đà Lạt');
    await expect(hotelBtn).toBeEnabled();
    await hotelBtn.click();
    await upgModal.getByTestId('bt-confirm-upgrade-btn').click();

    // Roll 10 (P2) -> Tuy Hòa (skip)
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    // Roll 11 (P1) -> Nha Trang (skip upgrade)
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(upgModal).toBeVisible();
    await upgModal.getByRole('button', { name: 'Giữ Nguyên' }).click();

    // Roll 12 (P1) -> Phú Quốc (skip)
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    // Roll 13 (P1) -> lands directly on Tile 0 (BẮT ĐẦU)!
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();

    // BUG-01: StartUpgradeModal MUST NOT open; P1 receives +300K (2 430 000) and Vòng 4, turn auto-advances to P2!
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await expect(page.getByTestId('start-upgrade-modal')).toHaveCount(0);
    const p1Card = page.getByTestId('player-card-0');
    await expect(p1Card).toContainText('Vòng 4');
    await expect(p1Card).toContainText('2 430 000');

    // Now on P2's AWAIT_ROLL: click directly on the TOP of Đà Lạt's tall 3D Hotel ★ mesh!
    const hotelTopPt = await getTileScreenPoint(page, 3, 'buildingTop');
    expect(hotelTopPt).not.toBeNull();
    await page.mouse.click(hotelTopPt!.x, hotelTopPt!.y);

    // TileInspectorCard must open specifically for Đà Lạt (Tile 3) with Hotel ★ active!
    const inspector = page.getByTestId('tile-inspector-card');
    await expect(inspector).toBeVisible();
    await expect(inspector).toContainText('Đà Lạt');
    await expect(inspector).toContainText('Khách Sạn (Khiên ★)');

    expect(errors).toEqual([]);
  });

  test('2. Free 0K World Championships, restricted World Tour flight (unowned/own only) + 2x Buyout & Pause stability', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);

    // Deterministic roll sequence (BUG-03):
    // Roll 1 (P1): 1+2=3 -> Đà Lạt (buy Lv0 = 70K)
    // Roll 2 (P2): 2+3=5 -> Ninh Bình (buy Lv1 = 165K)
    // Pause / Resume check via Escape
    // Roll 3 (P1): 3+3=6 (doubles #1) -> 3+6=9 Quy Nhơn (skip) -> bonus roll
    // Roll 4 (P1): 3+4=7 -> 9+7=16 CÚP QUỐC GIA (0K fee! Host on Đà Lạt)
    // Roll 5 (P2): 1+3=4 -> 5+4=9 Quy Nhơn (skip)
    // Roll 6 (P1): 3+5=8 -> 16+8=24 Du Lịch Xuyên Việt (arms World Tour for next turn)
    // Roll 7 (P2): 1+3=4 -> 9+4=13 Vũng Tàu (skip)
    // P1 Next Turn: WORLD_TOUR opens -> opponent/special tiles blocked; fly to own Đà Lạt (Tile 3, +300K -50K) -> UpgradeDecisionModal (skip)
    // Roll 8 (P2): 1+3=4 -> 13+4=17 Buôn Ma Thuột (skip)
    // Roll 9 (P1): 1+1=2 -> 3+2=5 Ninh Bình (P2 Lv1) -> BuyoutDecisionModal (330K) -> Thâu Tóm!
    await page.goto(
      '/?autostart=1&players=2&hotseat=1&dice=1-2,2-3,3-3,3-4,1-3,3-5,1-3,1-3,1-1'
    );
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await enable2xSpeed(page);

    const buyModal = page.getByTestId('buy-decision-modal');

    // Roll 1 (P1) buys Đà Lạt (Lv0 = 70K)
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await expect(buyModal).toContainText('Đà Lạt');
    await buyModal.getByRole('button', { name: /Đất trống/i }).click();
    await buyModal.getByRole('button', { name: /Mua Ngay/i }).click();

    // Roll 2 (P2) buys Ninh Bình (Lv1 = 90K + 75K = 165K)
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await expect(buyModal).toContainText('Ninh Bình');
    await buyModal.getByRole('button', { name: /1 Nhà/i }).click();
    await buyModal.getByRole('button', { name: /Mua Ngay/i }).click();

    // Pause / Resume check mid-match
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'paused');
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');

    // Roll 3 (P1): Doubles #1 -> Quy Nhơn (skip)
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    // Roll 4 (P1): lands on CÚP QUỐC GIA (Tile 16) -> 0K Free Championship!
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    const champModal = page.getByTestId('championship-decision-modal');
    await expect(champModal).toBeVisible();
    await expect(champModal).toContainText('Miễn Phí 0K');
    const champBox = await champModal.boundingBox();
    expect(champBox!.y).toBeGreaterThan(520); // Compact bottom dock!
    await champModal.getByRole('button', { name: /Đà Lạt/i }).click();

    // Roll 5 (P2) -> Quy Nhơn (skip)
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    // Roll 6 (P1) -> 24 Du Lịch Xuyên Việt (arms World Tour!)
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();

    // Roll 7 (P2) -> Vũng Tàu (skip)
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    // P1 enters WORLD_TOUR at start of turn!
    const worldTourModal = page.getByTestId('world-tour-modal');
    await expect(worldTourModal).toBeVisible();
    const wtBox = await worldTourModal.boundingBox();
    expect(wtBox!.y).toBeGreaterThan(500); // Unobstructed 3D board!

    // BUG-03 & BUG-36: WorldTourPrompt copy & recommended buttons MUST NOT reference opponent buyout or special tiles
    await expect(worldTourModal).not.toContainText(/đất đối thủ|Mua đứt|Cúp Quốc Gia/i);
    await expect(worldTourModal.getByRole('button', { name: /Ninh Bình/i })).toHaveCount(0);
    await expect(worldTourModal.getByRole('button', { name: /BẮT ĐẦU/i })).toHaveCount(0);
    await expect(worldTourModal.getByRole('button', { name: /CÚP QUỐC GIA/i })).toHaveCount(0);
    await expect(worldTourModal.getByRole('button', { name: /Cơ Hội/i })).toHaveCount(0);

    // Clicking invalid targets directly on the 3D board must keep World Tour open (rejected)
    const clickUnobstructedCanvasTile = async (tileIdx: number) => {
      const pt = await getTileScreenPoint(page, tileIdx);
      expect(pt).not.toBeNull();
      const hitsCanvas = await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.tagName === 'CANVAS',
        pt!
      );
      expect(hitsCanvas, `Tile ${tileIdx} screen point (${pt!.x}, ${pt!.y}) must hit <canvas>`).toBe(
        true
      );
      await page.mouse.click(pt!.x, pt!.y);
    };

    for (const invalidTileIdx of [5, 16, 12, 8]) {
      await clickUnobstructedCanvasTile(invalidTileIdx);
      await expect(worldTourModal).toBeVisible();
    }

    // Orbit 3D camera horizontally so corner Tile 0 (BẮT ĐẦU) moves clear of bottom-docked WorldTourPrompt
    await page.mouse.move(720, 260);
    await page.mouse.down();
    await page.mouse.move(480, 260, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(350);

    await clickUnobstructedCanvasTile(0);
    await expect(worldTourModal).toBeVisible();

    // Ensure P1's own Đà Lạt (Tile 3) is unobstructed on canvas, then click it -> flies past START (+300K, -50K) -> opens UpgradeDecisionModal!
    const daLatPt = await getTileScreenPoint(page, 3);
    expect(daLatPt).not.toBeNull();
    const daLatClear = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.tagName === 'CANVAS',
      daLatPt!
    );
    if (!daLatClear) {
      await page.mouse.move(480, 260);
      await page.mouse.down();
      await page.mouse.move(720, 260, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(350);
    }
    await clickUnobstructedCanvasTile(3);

    const upgModal = page.getByTestId('upgrade-decision-modal');
    await expect(upgModal).toBeVisible();
    await expect(upgModal).toContainText('Đà Lạt');
    await upgModal.getByRole('button', { name: 'Giữ Nguyên' }).click();

    // Roll 8 (P2) -> Buôn Ma Thuột (skip)
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    // Roll 9 (P1): 1+1=2 from Tile 3 -> lands on opponent P2's Ninh Bình (Tile 5, Lv1) -> pays rent & gets 2x Buyout (330K)!
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();

    const buyoutModal = page.getByTestId('buyout-decision-modal');
    await expect(buyoutModal).toBeVisible();
    await expect(buyoutModal).toContainText('Ninh Bình');
    await expect(buyoutModal).toContainText(/54K|108K/);
    await expect(buyoutModal).toContainText('330K');
    await buyoutModal.getByRole('button', { name: /Thâu Tóm/i }).click();

    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('3. Tactical Chance Cards: SHIELD_CITY blocks sabotage, POWER_OUTAGE zeroes rent & EARTHQUAKE downgrades houses', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);

    // Roll 1 (P1): 1+2=3 -> Đà Lạt (buy Lv1)
    // Roll 2 (P2): 2+3=5 -> Ninh Bình (buy Lv2)
    // Roll 3 (P1): 4+5=9 -> 3+9=12 Cơ Hội (draws SHIELD_CITY -> shield Đà Lạt)
    // Roll 4 (P2): 3+4=7 -> 5+7=12 Cơ Hội (draws POWER_OUTAGE -> targets Đà Lạt -> blocked by Shield!)
    // Roll 5 (P1): 3+5=8 -> 12+8=20 Cơ Hội (draws POWER_OUTAGE -> targets Ninh Bình -> Outage active!)
    // Roll 6 (P2): 3+5=8 -> 12+8=20 Cơ Hội (draws EARTHQUAKE -> targets unshielded Đà Lạt -> Lv1 drops to Lv0!)
    await page.goto(
      '/?autostart=1&players=2&hotseat=1&dice=1-2,2-3,4-5,3-4,3-5,3-5&cards=SHIELD_CITY,POWER_OUTAGE,POWER_OUTAGE,EARTHQUAKE'
    );
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await enable2xSpeed(page);

    const buyModal = page.getByTestId('buy-decision-modal');
    const cardModal = page.getByTestId('luck-card-modal');
    const targetModal = page.getByTestId('tactical-card-target-modal');

    // P1 buys Đà Lạt (Lv1)
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: /1 Nhà/i }).click();
    await buyModal.getByRole('button', { name: /Mua Ngay/i }).click();

    // P2 buys Ninh Bình (Lv2)
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: /2 Nhà/i }).click();
    await buyModal.getByRole('button', { name: /Mua Ngay/i }).click();

    // P1 draws SHIELD_CITY -> shields Đà Lạt
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(cardModal).toBeVisible();
    await expect(cardModal).toContainText('Khiên Bảo Hộ Đô Thị');
    await cardModal.getByRole('button', { name: /Tiếp Tục Ngay/i }).click();

    await expect(targetModal).toBeVisible();
    await targetModal.getByRole('button', { name: /Đà Lạt/i }).click();

    // P2 draws POWER_OUTAGE -> hits shielded Đà Lạt (shield absorbs it!)
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(cardModal).toBeVisible();
    await expect(cardModal).toContainText('Sự Cố Mất Điện Đô Thị');
    await cardModal.getByRole('button', { name: /Tiếp Tục Ngay/i }).click();

    await expect(targetModal).toBeVisible();
    await targetModal.getByRole('button', { name: /Đà Lạt/i }).click();

    // P1 draws POWER_OUTAGE -> cuts power at P2's Ninh Bình!
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(cardModal).toBeVisible();
    await cardModal.getByRole('button', { name: /Tiếp Tục Ngay/i }).click();

    await expect(targetModal).toBeVisible();
    await targetModal.getByRole('button', { name: /Ninh Bình/i }).click();

    // P2 draws EARTHQUAKE -> downgrades P1's now-unshielded Đà Lạt from Lv1 to Đất trống!
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(cardModal).toBeVisible();
    await expect(cardModal).toContainText('Địa Chấn Thương Trường');
    await cardModal.getByRole('button', { name: /Tiếp Tục Ngay/i }).click();

    await expect(targetModal).toBeVisible();
    await targetModal.getByRole('button', { name: /Đà Lạt/i }).click();

    // Inspect Ninh Bình & Đà Lạt via 3D board to verify Outage (0K) and Earthquake downgrade (Lv0)!
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    const ninhBinhPt = await getTileScreenPoint(page, 5);
    await page.mouse.click(ninhBinhPt!.x, ninhBinhPt!.y);
    const inspector = page.getByTestId('tile-inspector-card');
    await expect(inspector).toBeVisible();
    await expect(inspector).toContainText(/Đang mất điện/i);
    await expect(inspector).toContainText('0K');

    // Also inspect Đà Lạt (Tile 3) to confirm EARTHQUAKE downgraded it from Nhà Cấp 1 to Đất khởi điểm!
    await inspector.getByRole('button', { name: 'Đóng thông tin ô đất' }).click();
    const daLatPt = await getTileScreenPoint(page, 3);
    await page.mouse.click(daLatPt!.x, daLatPt!.y);
    await expect(inspector).toBeVisible();
    await expect(inspector).toContainText('Đà Lạt');
    await expect(inspector).toContainText('140K');

    expect(errors).toEqual([]);
  });

  test('4. Unaffordable tile auto-skip, Bankruptcy full liquidated payout to creditor & 0-property auto-bankruptcy', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);

    // 3-player Hotseat with 240K starting cash:
    // Roll 1 (P1): 2+3=5 -> Ninh Bình (buy Lv2 = 240K -> P1 cash = 0K, rent = 160K)
    // Roll 2 (P2): 1+2=3 -> Đà Lạt (buy Lv0 = 70K -> P2 cash = 170K + 70K Đà Lạt)
    // Roll 3 (P3): 1+2=3 -> Đà Lạt (pays 14K rent to P2 -> P3 cash = 226K, 0 properties; P2 cash = 184K + 70K = 254K total)
    // Roll 4 (P1): 2+2=4 (doubles) -> 5+4=9 Quy Nhơn (140K > 0K cash -> AUTO-SKIPS BuyDecisionModal!) -> bonus roll
    // Roll 5 (P1): 3+4=7 -> 9+7=16 CÚP QUỐC GIA (0K -> hosts on Ninh Bình -> rent becomes 320K!)
    // Roll 6 (P2): 1+1=2 -> 3+2=5 Ninh Bình (owes 320K > 254K total wealth -> declares Bankruptcy -> P1 receives 254K!)
    // Roll 7 (P3): 1+1=2 -> 3+2=5 Ninh Bình (owes 320K > 226K cash with 0 properties -> AUTO-BANKRUPTS immediately -> P1 wins with 480K!)
    await page.goto(
      '/?autostart=1&players=3&hotseat=1&cash=240000&dice=2-3,1-2,1-2,2-2,3-4,1-1,1-1'
    );
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await enable2xSpeed(page);

    const buyModal = page.getByTestId('buy-decision-modal');

    // P1 buys Ninh Bình Lv2 (240K -> P1 cash = 0K)
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: /2 Nhà/i }).click();
    await buyModal.getByRole('button', { name: /Mua Ngay/i }).click();

    // P2 buys Đà Lạt Lv0 (70K)
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: /Mua Ngay/i }).click();

    // P3 lands on Đà Lạt -> pays 14K rent to P2 & skips Buyout
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    const buyoutModal = page.getByTestId('buyout-decision-modal');
    await expect(buyoutModal).toBeVisible();
    await buyoutModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    // P1 rolls 2-2 (lands on Quy Nhơn 140K while cash=0K) -> BuyDecisionModal MUST NOT open; bonus roll ready!
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(page.getByTestId('bt-landing-cue')).toContainText('Không đủ tiền mua');
    await expect(buyModal).toHaveCount(0);

    // P1 bonus roll 3-4 -> CÚP QUỐC GIA -> host on Ninh Bình (rent = 320K)
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    const champModal = page.getByTestId('championship-decision-modal');
    await expect(champModal).toBeVisible();
    await champModal.getByRole('button', { name: /Ninh Bình/i }).click();

    // P2 rolls 1-1 -> lands on Ninh Bình (320K > 254K total wealth) -> declares Bankruptcy!
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    const debtModal = page.getByTestId('asset-management-modal');
    await expect(debtModal).toBeVisible();
    await debtModal.getByRole('button', { name: 'Phá Sản' }).click();

    // P3 rolls 1-1 -> lands on Ninh Bình with 0 properties & 226K < 320K -> AUTO-BANKRUPTS without debt modal -> P1 wins with 480K!
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(debtModal).toHaveCount(0);

    await expect(page.locator('body')).toHaveAttribute('data-state', 'gameover');
    const victoryModal = page.getByTestId('victory-modal');
    await expect(victoryModal).toBeVisible();
    await expect(victoryModal).toContainText('Người Chơi 1');
    await expect(victoryModal).toContainText('720 000');

    expect(errors).toEqual([]);
  });

  test('5. Title Lobby StartModal + Live 2-Browser Online Multiplayer WebSocket Match Sync', async ({
    browser,
  }) => {
    const hostContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const guestContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    const hostErrors = attachZeroErrorGuard(hostPage);
    const guestErrors = attachZeroErrorGuard(guestPage);

    // Host opens Title Lobby, checks Rulebook, then creates a 2-player Online Room
    await hostPage.goto('/');
    await expect(hostPage.getByTestId('bt-casual-lobby')).toBeVisible();
    await hostPage.getByRole('button', { name: 'Luật Chơi' }).click();
    await expect(hostPage.getByTestId('rulebook-modal')).toBeVisible();
    await hostPage.keyboard.press('Escape');

    await hostPage.getByTestId('bt-tab-online').click();
    await hostPage.getByRole('button', { name: '2 Người' }).click();
    await hostPage.getByTestId('bt-create-room-btn').click();

    const roomCodeEl = hostPage.getByTestId('bt-online-room-code');
    await expect(roomCodeEl).toBeVisible();
    const roomCode = (await roomCodeEl.innerText()).trim();
    expect(roomCode.length).toBeGreaterThanOrEqual(4);

    // Guest joins via ?room=CODE invite URL
    await guestPage.goto(`/?room=${roomCode}`);
    await expect(guestPage.getByTestId('bt-join-room-btn')).toBeEnabled();
    await guestPage.getByTestId('bt-join-room-btn').click();

    await expect(hostPage.getByText('Danh Sách Ghế Ngồi (2/2 Người)')).toBeVisible();
    await expect(guestPage.getByText('Danh Sách Ghế Ngồi (2/2 Người)')).toBeVisible();

    // Guest confirms Ready, then Host starts the online match!
    await guestPage.getByTestId('bt-ready-toggle-btn').click();
    await expect(hostPage.getByTestId('bt-online-start-btn')).toBeEnabled();
    await hostPage.getByTestId('bt-online-start-btn').click();
    await expect(hostPage.locator('body')).toHaveAttribute('data-state', 'playing');
    await expect(guestPage.locator('body')).toHaveAttribute('data-state', 'playing');

    // Host rolls dice; Guest sees waiting state until Host finishes action & turn auto-advances!
    await expect(hostPage.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await expect(guestPage.getByText(/Đang chờ/i)).toBeVisible();
    await hostPage.getByTestId('bt-roll-dice-btn').click();

    // Resolve whatever tile Host landed on so turn advances (including if Host rolled 1 or 2 doubles!)
    const syncDeadline = Date.now() + 30_000;
    let lastRollClickAt = Date.now();
    while (Date.now() < syncDeadline) {
      const guestCanRoll = await guestPage
        .getByTestId('bt-roll-dice-btn')
        .isVisible()
        .catch(() => false);
      if (guestCanRoll) break;

      await hostPage.waitForTimeout(450);
      if (await hostPage.getByTestId('buy-decision-modal').isVisible().catch(() => false)) {
        await hostPage.getByTestId('buy-decision-modal').getByRole('button', { name: 'Bỏ Qua' }).click();
      } else if (await hostPage.getByTestId('luck-card-modal').isVisible().catch(() => false)) {
        const confirmBtn = hostPage
          .getByTestId('luck-card-modal')
          .getByRole('button', { name: /Tiếp Tục Ngay/i });
        if (await confirmBtn.isVisible().catch(() => false)) {
          await confirmBtn.click();
        }
      } else if (
        await hostPage.getByTestId('tactical-card-target-modal').isVisible().catch(() => false)
      ) {
        await hostPage
          .getByTestId('tactical-card-target-modal')
          .getByRole('button', { name: 'Bỏ Qua' })
          .click();
      } else if (
        await hostPage.getByTestId('championship-decision-modal').isVisible().catch(() => false)
      ) {
        await hostPage
          .getByTestId('championship-decision-modal')
          .getByRole('button', { name: 'Bỏ Qua' })
          .click();
      } else if (
        await hostPage.getByTestId('world-tour-modal').isVisible().catch(() => false)
      ) {
        await hostPage
          .getByTestId('world-tour-modal')
          .getByRole('button', { name: /Đổ Xúc Xắc Thường/i })
          .click();
      } else if (
        Date.now() - lastRollClickAt > 1800 &&
        (await hostPage.getByTestId('bt-roll-dice-btn').isVisible().catch(() => false))
      ) {
        // Host rolled doubles -> roll bonus turn!
        lastRollClickAt = Date.now();
        await hostPage.getByTestId('bt-roll-dice-btn').click();
      }
    }

    // Guest now receives their turn automatically over WebSocket without manual End Turn!
    await expect(guestPage.getByTestId('bt-roll-dice-btn')).toBeVisible();
    expect(hostErrors).toEqual([]);
    expect(guestErrors).toEqual([]);

    await hostContext.close();
    await guestContext.close();
  });

  test('6. Offline 1 Human vs 3 Smart Bots full round-trip choreography & Bot LuckCardModal lock', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);

    // 4-player default (1 Human + 3 Bots):
    // Human rolls 1-2 -> Đà Lạt (buy) -> Bot 1 rolls 6-6 -> 12 Cơ Hội (ch-11 Gain Cash, confirm btn hidden for Bot!) + 1-2 -> 15 Nha Trang -> Bot 2 rolls 2-3 -> 5 Ninh Bình -> Bot 3 rolls 3-4 -> 7 Hội An -> returns cleanly to Human!
    await page.goto('/?autostart=1&dice=1-2,6-6,1-2,2-3,3-4&cards=ch-11');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await enable2xSpeed(page);

    await page.getByTestId('bt-roll-dice-btn').click();
    const buyModal = page.getByTestId('buy-decision-modal');
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: /Mua Ngay/i }).click();

    // Bot 1 lands on Cơ Hội (12): LuckCardModal appears WITHOUT human confirm button!
    const cardModal = page.getByTestId('luck-card-modal');
    await expect(cardModal).toBeVisible();
    await expect(page.getByTestId('luck-card-confirm-btn')).toHaveCount(0);

    // Wait for all 3 Bots (including Bot 1's bonus roll) to finish their turns and return control to Human!
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible({ timeout: 35_000 });
    expect(errors).toEqual([]);
  });

  test('7. Screenshot Regression: Phu Nhân Ngọc Diệp Resort Monopoly Victory ranks #1 above richer opponents + Offline Emotes', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);

    // Start from Title Lobby so we also verify all 4 3D character avatars in StartModal
    await page.goto(
      '/?dice=6-6,1-2,1-2,2-3,2-2,5-5,1-3,2-4,2-4,2-4,1-1,2-3&cards=ch-11,ch-12'
    );
    const lobby = page.getByTestId('bt-casual-lobby');
    await expect(lobby).toBeVisible();

    // Preview Phu Nhân Ngọc Diệp in XL 3D Podium first, then switch back to CEO Minh Khôi
    await lobby.getByRole('button', { name: 'Chọn nhân vật Phu Nhân Ngọc Diệp' }).click();
    await expect(lobby).toContainText('Phu Nhân Ngọc Diệp');
    await lobby.getByRole('button', { name: 'Chọn nhân vật CEO Minh Khôi' }).click();
    await expect(lobby).toContainText('CEO Minh Khôi');

    await lobby.locator('[data-start="true"]').click();
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await enable2xSpeed(page);

    // Verify Offline Emote displays on Human HUD card (player-emote-0)
    await page.getByTestId('bt-btn-emotes').click();
    const emotePopover = page.getByTestId('bt-emote-popover');
    await expect(emotePopover).toBeVisible();
    await emotePopover.locator('button').nth(1).click();
    await expect(page.getByTestId('player-emote-0')).toBeVisible();

    const buyModal = page.getByTestId('buy-decision-modal');
    const cardModal = page.getByTestId('luck-card-modal');

    // Round 1: Human rolls 6-6 -> Cơ Hội (+150K -> 2,150,000), then bonus 1-2 -> Nha Trang (skip)
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(cardModal).toBeVisible();
    await cardModal.getByRole('button', { name: /Tiếp Tục Ngay/i }).click();

    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    // Bots 1, 2, 3 complete Round 1 (Ngọc Diệp buys 3/4 Resorts: 4, 14, 18!) -> returns to Human
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible({ timeout: 45_000 });

    // Round 2: Human rolls 2-4 -> Bắc Ninh (skip, keeps 2,150,000 net worth!)
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    // Bot 3 (Phu Nhân Ngọc Diệp) pays -50K card then buys 4th Resort (Phú Quốc) with 1,950,000 net worth -> WINS!
    const victoryModal = page.getByTestId('victory-modal');
    await expect(victoryModal).toBeVisible({ timeout: 55_000 });
    await expect(victoryModal).toContainText('Phu Nhân Ngọc Diệp');
    await expect(victoryModal).toContainText('Độc Quyền Du Lịch');

    // CRITICAL REGRESSION CHECK: Phu Nhân Ngọc Diệp (1,950,000) MUST rank #1 above Người chơi 1 (2,150,000)!
    const rank1Row = page.getByTestId('victory-rank-row-1');
    const rank2Row = page.getByTestId('victory-rank-row-2');
    await expect(rank1Row).toContainText('#1');
    await expect(rank1Row).toContainText('Phu Nhân Ngọc Diệp');
    await expect(rank1Row).toContainText('Vô địch');
    await expect(rank1Row).toContainText('1 950 000');

    await expect(rank2Row).toContainText('#2');
    await expect(rank2Row).toContainText('Người chơi 1');
    await expect(rank2Row).toContainText('2 150 000');

    expect(errors).toEqual([]);
  });
});
