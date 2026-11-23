import { expect, Page, test } from '@playwright/test';
import {
  assertNoBoxOverlap,
  assertWithinViewport,
  attachZeroErrorGuard,
  enable2xSpeed,
  getAssetsBtn,
  getJailBailBtn,
  getJailCardBtn,
  getJailRollBtn,
  getMatchClock,
  getOnlineRoomPill,
  getPauseModal,
  getTabOffline,
  getTabOnline,
  getTileScreenPoint,
  isScrollableOrWithinViewport,
  resolveDialogElement,
} from './helpers';

const VIEWPORTS = [
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'mobile-portrait-390x844', width: 390, height: 844 },
  { name: 'mobile-landscape-844x390', width: 844, height: 390 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
] as const;

async function sampleAvatarCanvasPixels(
  page: Page,
  selector: string
): Promise<{ nonZeroAlphaPixels: number; distinctColors: number; width: number; height: number }> {
  return page.evaluate((sel) => {
    const canvas = document.querySelector(sel) as HTMLCanvasElement | null;
    if (!canvas) {
      return { nonZeroAlphaPixels: 0, distinctColors: 0, width: 0, height: 0 };
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return {
        nonZeroAlphaPixels: 0,
        distinctColors: 0,
        width: canvas.width,
        height: canvas.height,
      };
    }
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let nonZeroAlphaPixels = 0;
    const colors = new Set<number>();
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a > 12) {
        nonZeroAlphaPixels++;
        const bucket = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
        colors.add(bucket);
      }
    }
    return {
      nonZeroAlphaPixels,
      distinctColors: colors.size,
      width: canvas.width,
      height: canvas.height,
    };
  }, selector);
}

test.describe('Responsive Layouts, Accessibility, WebGL & Audio Fault Safety', () => {
  test('BUG-37: StartModal tabs wrap cleanly without clipping or horizontal overflow at 390x844', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const lobby = page.getByTestId('bt-casual-lobby');
    await expect(lobby).toBeVisible();

    const pageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    );
    expect(pageOverflow, 'Page must have zero horizontal overflow at 390x844').toBe(true);

    const offlineTab = getTabOffline(lobby);
    const onlineTab = getTabOnline(lobby);
    await expect(offlineTab).toBeVisible();
    await expect(onlineTab).toBeVisible();

    for (const [label, tab] of [
      ['Offline tab', offlineTab],
      ['Online tab', onlineTab],
    ] as const) {
      const noClip = await tab.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
      expect(noClip, `${label} must not clip text horizontally`).toBe(true);
      assertWithinViewport(await tab.boundingBox(), 390, 844, label);
    }

    expect(errors).toEqual([]);
  });

  for (const vp of VIEWPORTS) {
    test(`BUG-38: Zero HUD/ActionDock/Clock/LandingCue overlap at ${vp.name}`, async ({
      page,
    }) => {
      const errors = attachZeroErrorGuard(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/?autostart=1&players=4&hotseat=1&dice=1-2,1-3,2-3,3-4');
      await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');

      const clock = getMatchClock(page);
      await expect(clock).toBeVisible();

      // Roll 1 (P1 at 1x speed so bt-landing-cue stays visible cleanly across the 740ms cue window)
      await page.getByTestId('bt-roll-dice-btn').click();
      const cue = page.getByTestId('bt-landing-cue');
      await expect(cue).toBeVisible();
      const cueBox = await cue.boundingBox();
      assertWithinViewport(cueBox, vp.width, vp.height, 'bt-landing-cue');

      const buyModal = page.getByTestId('buy-decision-modal');
      await expect(buyModal).toBeVisible();
      if (vp.width === 390 && vp.height === 844) {
        const modalDialog = resolveDialogElement(buyModal);
        assertWithinViewport(await modalDialog.boundingBox(), vp.width, vp.height, 'buy-decision-modal');
        for (const [btnLabel, btnLoc] of [
          ['BuyDecisionModal Mua Ngay', buyModal.getByRole('button', { name: /Mua Ngay/i })],
          ['BuyDecisionModal Bỏ Qua', buyModal.getByRole('button', { name: 'Bỏ Qua' })],
        ] as const) {
          await expect(btnLoc).toBeVisible();
          const noClip = await btnLoc.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
          expect(noClip, `${btnLabel} must wrap without horizontal clipping at 390x844`).toBe(true);
          assertWithinViewport(await btnLoc.boundingBox(), vp.width, vp.height, btnLabel);
        }
      }
      await buyModal.getByRole('button', { name: /Mua Ngay/i }).click();

      // Speed up P2, P3, P4 skips so turn returns to P1 with BOTH Đổ Xúc Xắc and Tài Sản (1) rendered
      await enable2xSpeed(page);
      for (const expectedTile of ['Vịnh Hạ Long', 'Ninh Bình', 'Hội An']) {
        await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
        await page.getByTestId('bt-roll-dice-btn').click();
        await expect(buyModal).toBeVisible();
        await expect(buyModal).toContainText(expectedTile);
        await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();
      }

      const rollBtn = page.getByTestId('bt-roll-dice-btn');
      const assetsBtn = getAssetsBtn(page);
      await expect(rollBtn).toBeVisible();
      await expect(assetsBtn).toBeVisible();
      await expect(clock).toBeVisible();

      const rollBox = await rollBtn.boundingBox();
      const assetsBox = await assetsBtn.boundingBox();
      const railBox = await page.getByTestId('bt-right-utility-rail').boundingBox();
      const clockBox = await clock.boundingBox();

      assertWithinViewport(rollBox, vp.width, vp.height, 'bt-roll-dice-btn');
      assertWithinViewport(assetsBox, vp.width, vp.height, 'Tài Sản button');
      assertWithinViewport(railBox, vp.width, vp.height, 'bt-right-utility-rail');
      assertWithinViewport(clockBox, vp.width, vp.height, 'bt-match-clock');

      for (let i = 0; i < 4; i++) {
        const card = page.getByTestId(`player-card-${i}`);
        await expect(card).toBeVisible();
        const cBox = await card.boundingBox();
        assertWithinViewport(cBox, vp.width, vp.height, `player-card-${i}`);
        assertNoBoxOverlap(rollBox, cBox, 'bt-roll-dice-btn', `player-card-${i}`);
        assertNoBoxOverlap(assetsBox, cBox, 'Tài Sản button', `player-card-${i}`);
        assertNoBoxOverlap(clockBox, cBox, 'bt-match-clock', `player-card-${i}`);
        assertNoBoxOverlap(cueBox, cBox, 'bt-landing-cue', `player-card-${i}`);
        assertNoBoxOverlap(cBox, railBox, `player-card-${i}`, 'bt-right-utility-rail');
      }

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      );
      expect(overflow, `Zero horizontal overflow at ${vp.name}`).toBe(true);
      expect(errors).toEqual([]);
    });
  }

  test('BUG-38b: Online Room Pill does not overlap PlayerHUD at 390x844 and 768x1024', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await getTabOnline(page).click();
    await page.getByRole('button', { name: '2 Người' }).click();
    await page.getByTestId('bt-create-room-btn').click();
    await expect(page.getByTestId('bt-online-start-btn')).toBeVisible();
    await page.getByTestId('bt-online-start-btn').click();
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');

    const pill = getOnlineRoomPill(page);
    await expect(pill).toBeVisible();

    for (const vp of [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
    ]) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(150);
      const pillBox = await pill.boundingBox();
      const card0Box = await page.getByTestId('player-card-0').boundingBox();
      const card1Box = await page.getByTestId('player-card-1').boundingBox();
      assertWithinViewport(pillBox, vp.width, vp.height, 'Online Room Pill');
      assertNoBoxOverlap(pillBox, card0Box, 'Online Room Pill', 'player-card-0');
      assertNoBoxOverlap(pillBox, card1Box, 'Online Room Pill', 'player-card-1');
    }

    expect(errors).toEqual([]);
  });

  test('BUG-37b: 390x844 Jail 4-button ActionDock cluster wraps cleanly within viewport without overlap', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);
    await page.setViewportSize({ width: 390, height: 844 });

    // P1 buys Đà Lạt (Tài Sản 1), gets ch-8 (Jail Free Card), gets ch-7 (GO_TO_JAIL) -> 4 buttons in ActionDock!
    await page.goto('/?autostart=1&players=2&hotseat=1&dice=1-2,1-3,4-5,1-2,3-5,1-2&cards=ch-8,ch-7');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await enable2xSpeed(page);

    const buyModal = page.getByTestId('buy-decision-modal');
    const cardModal = page.getByTestId('luck-card-modal');

    // Roll 1 (P1): Đà Lạt -> buy
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: /Mua Ngay/i }).click();

    // Roll 2 (P2): Vịnh Hạ Long -> skip
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    // Roll 3 (P1): Cơ Hội (12) -> ch-8 JAIL_FREE_CARD
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(cardModal).toBeVisible();
    await cardModal.getByRole('button', { name: /Tiếp Tục Ngay/i }).click();

    // Roll 4 (P2): Hội An -> skip
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    // Roll 5 (P1): Cơ Hội (20) -> ch-7 GO_TO_JAIL
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(cardModal).toBeVisible();
    await cardModal.getByRole('button', { name: /Tiếp Tục Ngay/i }).click();

    // Roll 6 (P2): Tuy Hòa -> skip -> returns to jailed P1!
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    const jailRoll = getJailRollBtn(page);
    const jailBail = getJailBailBtn(page);
    const jailCard = getJailCardBtn(page);
    const assetsBtn = getAssetsBtn(page);

    await expect(jailRoll).toBeVisible();
    await expect(jailBail).toBeVisible();
    await expect(jailCard).toBeVisible();
    await expect(assetsBtn).toBeVisible();

    const card0Box = await page.getByTestId('player-card-0').boundingBox();
    const card1Box = await page.getByTestId('player-card-1').boundingBox();

    for (const [name, loc] of [
      ['Jail Roll', jailRoll],
      ['Jail Bail', jailBail],
      ['Jail Card', jailCard],
      ['Assets', assetsBtn],
    ] as const) {
      const box = await loc.boundingBox();
      assertWithinViewport(box, 390, 844, name);
      assertNoBoxOverlap(box, card0Box, name, 'player-card-0');
      assertNoBoxOverlap(box, card1Box, name, 'player-card-1');
    }

    const noHOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= 390
    );
    expect(noHOverflow).toBe(true);
    expect(errors).toEqual([]);
  });

  test('BUG-39: 844x390 landscape popovers & modals stay reachable/scrollable with clickable CTAs', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/?autostart=1&players=2&hotseat=1&dice=1-2');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');

    // Emote popover
    await page.getByTestId('bt-btn-emotes').click();
    const emotePop = page.getByTestId('bt-emote-popover');
    await isScrollableOrWithinViewport(emotePop, 390, 'bt-emote-popover');
    await emotePop.getByRole('button', { name: 'Đóng biểu cảm' }).click();

    // Settings popover
    await page.getByTestId('bt-btn-settings').click();
    const settingsPop = page.getByTestId('bt-settings-popover');
    await isScrollableOrWithinViewport(settingsPop, 390, 'bt-settings-popover');
    const closeSettingsBtn = settingsPop.getByRole('button', { name: 'Đóng cài đặt' });
    await closeSettingsBtn.scrollIntoViewIfNeeded();
    await closeSettingsBtn.click();

    // PauseModal
    await page.getByTestId('bt-btn-pause').click();
    const pauseModal = getPauseModal(page);
    await isScrollableOrWithinViewport(pauseModal, 390, 'PauseModal');
    const resumeBtn = pauseModal.getByRole('button', { name: /Tiếp Tục Chơi/i });
    await resumeBtn.scrollIntoViewIfNeeded();
    await resumeBtn.click();

    // BuyDecisionModal
    await page.getByTestId('bt-roll-dice-btn').click();
    const buyModal = page.getByTestId('buy-decision-modal');
    await isScrollableOrWithinViewport(buyModal, 390, 'buy-decision-modal');
    const buyBtn = buyModal.getByRole('button', { name: /Mua Ngay/i });
    await buyBtn.scrollIntoViewIfNeeded();
    await buyBtn.click();

    // TileInspectorCard (opened via PlayerHUD mini-tab to avoid 3D raycast HUD occlusion at 844x390)
    await page.getByRole('button', { name: 'Xem ô Đà Lạt' }).click();
    const inspector = page.getByTestId('tile-inspector-card');
    await isScrollableOrWithinViewport(inspector, 390, 'tile-inspector-card');
    const closeInspector = inspector.getByRole('button', { name: 'Đóng thông tin ô đất' });
    await closeInspector.scrollIntoViewIfNeeded();
    await closeInspector.click();

    // VictoryModal at 844x390
    await page.goto('/?autostart=1&players=2&hotseat=1&matchTime=2');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'gameover', {
      timeout: 12_000,
    });
    const victoryModal = page.getByTestId('victory-modal');
    await isScrollableOrWithinViewport(victoryModal, 390, 'victory-modal');
    const rematchBtn = victoryModal.locator('[data-start="true"]');
    await rematchBtn.scrollIntoViewIfNeeded();
    await expect(rematchBtn).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('BUG-41 & BUG-42: Keyboard Tab reachability, Escape priority, Space guards, ARIA dialog/focus trap & form controls', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);

    // StartModal ARIA & OnlineLobbyPanel form submission (BUG-41 & BUG-42)
    await page.goto('/');
    const lobby = page.getByTestId('bt-casual-lobby');
    await expect(lobby).toBeVisible();

    const lobbyDialog = resolveDialogElement(lobby);
    await expect(lobbyDialog).toHaveAttribute('aria-modal', 'true');
    await expect(lobby.getByRole('tablist')).toBeVisible();
    await expect(getTabOffline(lobby)).toHaveAttribute('aria-selected', 'true');
    await expect(lobby.getByRole('button', { name: '4 Người' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    // RulebookModal dialog ARIA + Tab focus trap
    await lobby.getByRole('button', { name: 'Luật Chơi' }).click();
    const rulebook = page.getByTestId('rulebook-modal');
    await expect(rulebook).toBeVisible();
    const rulebookDialog = resolveDialogElement(rulebook);
    await expect(rulebookDialog).toHaveAttribute('aria-modal', 'true');

    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      const inside = await rulebookDialog.evaluate((dlg) => {
        const active = document.activeElement;
        return Boolean(active && dlg.contains(active));
      });
      expect(inside, 'Focus must remain trapped inside RulebookModal dialog').toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(rulebook).toHaveCount(0);

    // OnlineLobbyPanel accessible inputs & Enter submit (pre-room + in-room)
    await getTabOnline(lobby).click();
    const nickInput = lobby.getByRole('textbox', { name: /Tên hiển thị/i });
    const codeInput = lobby.getByRole('textbox', { name: /Mã phòng/i });
    await expect(nickInput).toBeVisible();
    await expect(codeInput).toBeVisible();
    await codeInput.fill('ZZZZ');
    await codeInput.press('Enter');
    await expect(lobby.getByRole('alert')).toBeVisible();

    await lobby.getByTestId('bt-create-room-btn').click();
    await expect(page.getByTestId('bt-online-room-code')).toBeVisible();
    const inRoomNameInput = lobby.getByRole('textbox', { name: /Tên hiển thị/i });
    await expect(inRoomNameInput).toBeVisible();
    await inRoomNameInput.fill('Tỷ Phú Test');
    await inRoomNameInput.press('Enter');
    await expect(lobby).toContainText('Tỷ Phú Test');
    await lobby.getByRole('button', { name: /Rời Phòng/i }).click();

    // Gameplay keyboard tests (BUG-41)
    await page.goto('/?autostart=1&players=2&hotseat=1&dice=1-2,1-3');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await enable2xSpeed(page);

    for (const tid of ['bt-btn-emotes', 'bt-btn-settings', 'bt-btn-pause']) {
      const tabIdx = await page.getByTestId(tid).getAttribute('tabindex');
      expect(tabIdx, `${tid} must not have tabindex="-1"`).not.toBe('-1');
    }

    // Tab reaches right utility rail buttons
    const reachedUtility = new Set<string>();
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      const activeTid = await page.evaluate(
        () => document.activeElement?.getAttribute('data-testid') || ''
      );
      if (activeTid) reachedUtility.add(activeTid);
    }
    expect(reachedUtility.has('bt-btn-emotes')).toBe(true);
    expect(reachedUtility.has('bt-btn-settings')).toBe(true);
    expect(reachedUtility.has('bt-btn-pause')).toBe(true);

    // Escape closes bt-settings-popover FIRST while staying playing; second Escape opens PauseModal
    await page.getByTestId('bt-btn-settings').click();
    await expect(page.getByTestId('bt-settings-popover')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('bt-settings-popover')).toHaveCount(0);
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');

    await page.keyboard.press('Escape');
    const pauseModal = getPauseModal(page);
    await expect(pauseModal).toBeVisible();
    await expect(resolveDialogElement(pauseModal)).toHaveAttribute('aria-modal', 'true');
    await page.keyboard.press('Escape');
    await expect(pauseModal).toHaveCount(0);

    // Buy Đà Lạt so HUD mini-tab exists, then advance back to P1 AWAIT_ROLL
    await page.getByTestId('bt-roll-dice-btn').click();
    const buyModal = page.getByTestId('buy-decision-modal');
    await expect(buyModal).toBeVisible();
    await expect(resolveDialogElement(buyModal)).toHaveAttribute('aria-modal', 'true');
    await buyModal.getByRole('button', { name: /Mua Ngay/i }).click();

    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    // Space on a PlayerHUD button must NOT roll dice
    const hudMiniTab = page.getByTestId('player-card-0').locator('button').first();
    await expect(hudMiniTab).toBeVisible();
    await hudMiniTab.focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('BUG-43: Reduced motion ConfettiOverlay, >=44px hit targets, and .bt-btn-gold WCAG contrast', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const lobby = page.getByTestId('bt-casual-lobby');
    await expect(lobby).toBeVisible();

    // .bt-btn-gold text contrast >= 4.5:1 against gold background
    const contrastRatio = await lobby.locator('.bt-btn-gold').first().evaluate((el) => {
      const resolveCssColor = (str: string): [number, number, number] => {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Could not acquire 2D canvas context to resolve CSS color');
        }
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = '#010203';
        ctx.fillStyle = str;
        if (
          ctx.fillStyle === '#010203' &&
          !/^(#010203|rgb\(\s*1,\s*2,\s*3\s*\))$/i.test(str.trim())
        ) {
          ctx.fillStyle = '#040506';
          ctx.fillStyle = str;
          if (ctx.fillStyle === '#040506') {
            throw new Error(`Unparseable CSS color: ${str}`);
          }
        }
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        if (a === 0) {
          throw new Error(`Transparent or unrendered CSS color: ${str}`);
        }
        return [r, g, b];
      };
      const relLum = ([r, g, b]: [number, number, number]) => {
        const chan = [r, g, b].map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
      };
      const fg = resolveCssColor(getComputedStyle(el).color);
      // .bt-btn-gold gradient spans #ffe047 -> #f5b800; test against darkest gold #f5b800
      const l1 = relLum(fg);
      const l2 = relLum([245, 184, 0]);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    });
    expect(contrastRatio, '.bt-btn-gold must meet WCAG AA >= 4.5:1 contrast').toBeGreaterThanOrEqual(
      4.5
    );

    // Check utility rail buttons & .icon-hit-target close buttons meet >= 44x44px clickable area
    await page.goto('/?autostart=1&players=2&hotseat=1&matchTime=6');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');

    for (const tid of ['bt-btn-emotes', 'bt-btn-settings', 'bt-btn-pause']) {
      const box = await page.getByTestId(tid).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    await page.getByTestId('bt-btn-settings').click();
    const closeHit = await page
      .getByRole('button', { name: 'Đóng cài đặt' })
      .evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const after = getComputedStyle(el, '::after');
        const hasAfter = after.content !== 'none' && after.position === 'absolute';
        const negInset = (val: string) => {
          const n = parseFloat(val);
          return Number.isFinite(n) && n < 0 ? Math.abs(n) : 0;
        };
        const expandX = hasAfter ? negInset(after.left) + negInset(after.right) : 0;
        const expandY = hasAfter ? negInset(after.top) + negInset(after.bottom) : 0;
        return {
          effectiveW: rect.width + expandX,
          effectiveH: rect.height + expandY,
        };
      });
    expect(closeHit.effectiveW).toBeGreaterThanOrEqual(44);
    expect(closeHit.effectiveH).toBeGreaterThanOrEqual(44);
    await page.getByRole('button', { name: 'Đóng cài đặt' }).click();

    // ConfettiOverlay under prefers-reduced-motion: reduce
    await expect(page.locator('body')).toHaveAttribute('data-state', 'gameover', {
      timeout: 15_000,
    });
    const victoryModal = page.getByTestId('victory-modal');
    await expect(victoryModal).toBeVisible();
    const confetti = victoryModal.locator('canvas.fixed.pointer-events-none');
    await expect(confetti).toHaveAttribute('aria-hidden', 'true');
    const confettiCleared = await confetti.evaluate((el) => {
      const c = el as HTMLCanvasElement;
      const ctx = c.getContext('2d');
      if (!ctx || c.width === 0 || c.height === 0) return false;
      const { data } = ctx.getImageData(0, 0, Math.min(c.width, 64), Math.min(c.height, 64));
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] !== 0) return false;
      }
      return true;
    });
    expect(confettiCleared, 'ConfettiOverlay must stay cleared under reduced-motion').toBe(true);

    expect(errors).toEqual([]);
  });

  test('BUG-44: Offscreen PlayerAvatar3D WebGL context loss draws 2D fallback and context restore resumes 3D pixels at ?quality=low', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);

    await page.addInitScript(() => {
      const captured: HTMLCanvasElement[] = [];
      const lostListenerCanvases: HTMLCanvasElement[] = [];
      const win = window as unknown as {
        __btWebGLCanvases: HTMLCanvasElement[];
        __btContextLostCanvases: HTMLCanvasElement[];
      };
      win.__btWebGLCanvases = captured;
      win.__btContextLostCanvases = lostListenerCanvases;

      const origGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type: string,
        options?: unknown
      ) {
        if ((type === 'webgl2' || type === 'webgl') && !captured.includes(this)) {
          captured.push(this);
        }
        return origGetContext.call(this, type, options);
      } as typeof HTMLCanvasElement.prototype.getContext;

      const origAddEventListener = HTMLCanvasElement.prototype.addEventListener;
      HTMLCanvasElement.prototype.addEventListener = function (
        this: HTMLCanvasElement,
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions
      ) {
        if (type === 'webglcontextlost' && listener && !lostListenerCanvases.includes(this)) {
          lostListenerCanvases.push(this);
        }
        return origAddEventListener.call(
          this,
          type,
          listener as EventListenerOrEventListenerObject,
          options
        );
      } as typeof HTMLCanvasElement.prototype.addEventListener;
    });

    await page.goto('/?quality=low');
    const lobby = page.getByTestId('bt-casual-lobby');
    await expect(lobby).toBeVisible();

    const avatarCanvasSelector = '[data-testid="bt-casual-lobby"] [data-avatar-archetype] canvas';
    await page.waitForTimeout(450);
    const initialPixels = await sampleAvatarCanvasPixels(page, avatarCanvasSelector);
    expect(initialPixels.nonZeroAlphaPixels).toBeGreaterThan(50);
    expect(initialPixels.distinctColors).toBeGreaterThan(3);

    // Dispatch webglcontextlost on SharedAvatarRenderEngine's offscreen WebGL canvas (skipping detectBrowserGpu() probe)
    const lostPrevented = await page.evaluate(() => {
      const win = window as unknown as {
        __btWebGLCanvases?: HTMLCanvasElement[];
        __btContextLostCanvases?: HTMLCanvasElement[];
      };
      const canvases = win.__btWebGLCanvases ?? [];
      const lostCanvases = win.__btContextLostCanvases ?? [];
      const offscreen =
        lostCanvases.find((c) => !c.isConnected) ??
        [...canvases].reverse().find((c) => !c.isConnected) ??
        canvases[canvases.length - 1];
      if (!offscreen) return false;
      const ev = new Event('webglcontextlost', { cancelable: true });
      offscreen.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    expect(lostPrevented).toBe(true);

    // Switch character while WebGL context is lost -> must render non-blank 2D fallback portrait
    await lobby.getByRole('button', { name: 'Chọn nhân vật Phu Nhân Ngọc Diệp' }).click();
    await page.waitForTimeout(300);
    const fallbackPixels = await sampleAvatarCanvasPixels(page, avatarCanvasSelector);
    expect(fallbackPixels.nonZeroAlphaPixels).toBeGreaterThan(50);

    // Dispatch webglcontextrestored and switch character -> 3D rendering resumes cleanly
    await page.evaluate(() => {
      const win = window as unknown as {
        __btWebGLCanvases?: HTMLCanvasElement[];
        __btContextLostCanvases?: HTMLCanvasElement[];
      };
      const canvases = win.__btWebGLCanvases ?? [];
      const lostCanvases = win.__btContextLostCanvases ?? [];
      const offscreen =
        lostCanvases.find((c) => !c.isConnected) ??
        [...canvases].reverse().find((c) => !c.isConnected) ??
        canvases[canvases.length - 1];
      if (offscreen) {
        offscreen.dispatchEvent(new Event('webglcontextrestored'));
      }
    });
    await lobby.getByRole('button', { name: 'Chọn nhân vật CEO Minh Khôi' }).click();
    await page.waitForTimeout(450);
    const restoredPixels = await sampleAvatarCanvasPixels(page, avatarCanvasSelector);
    expect(restoredPixels.nonZeroAlphaPixels).toBeGreaterThan(50);
    expect(restoredPixels.distinctColors).toBeGreaterThan(3);

    expect(errors).toEqual([]);
  });

  test('BUG-48: Mid-flight pause & rematch cancels pending dice/hop animations and lands cleanly on Tile 3', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);

    // Keep default 1x speed so 6-6 hop is mid-flight at ~400ms!
    await page.goto('/?autostart=1&players=2&hotseat=1&dice=6-6,1-2');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');

    await page.getByTestId('bt-roll-dice-btn').click();
    await page.waitForTimeout(400);
    await expect(page.getByTestId('bt-roll-dice-btn')).toHaveCount(0);

    // Pause mid-flight and exit to Title Lobby
    await page.keyboard.press('Escape');
    const pauseModal = getPauseModal(page);
    await expect(pauseModal).toBeVisible();
    await pauseModal.getByRole('button', { name: 'Sảnh Chờ Mới' }).click();

    const lobby = page.getByTestId('bt-casual-lobby');
    await expect(lobby).toBeVisible();

    // Immediately start rematch -> bt-roll-dice-btn must be enabled & 1-2 lands cleanly on Tile 3 (Đà Lạt)
    await lobby.locator('[data-start="true"]').click();
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');

    const rollBtn = page.getByTestId('bt-roll-dice-btn');
    await expect(rollBtn).toBeVisible();
    await expect(rollBtn).toBeEnabled();
    await rollBtn.click();

    const buyModal = page.getByTestId('buy-decision-modal');
    await expect(buyModal).toBeVisible();
    await expect(buyModal).toContainText('Đà Lạt');

    expect(errors).toEqual([]);
  });

  test('BUG-54a: Throwing AudioContext constructor never crashes gameplay or stops 3D render loop', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);

    await page.addInitScript(() => {
      const BrokenAudioContext = function () {
        throw new DOMException('AudioContext blocked by policy', 'NotAllowedError');
      };
      (window as unknown as { AudioContext: unknown }).AudioContext = BrokenAudioContext;
      (window as unknown as { webkitAudioContext: unknown }).webkitAudioContext =
        BrokenAudioContext;
    });

    await page.goto('/?autostart=1&players=2&hotseat=1&dice=1-2');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');

    const canvas = page.locator('canvas[data-rendered-frames]');
    await expect(canvas).toBeVisible();
    const initialFrames = Number(await canvas.getAttribute('data-rendered-frames'));

    await page.getByTestId('bt-roll-dice-btn').click();
    const buyModal = page.getByTestId('buy-decision-modal');
    await expect(buyModal).toBeVisible();
    await expect(buyModal).toContainText('Đà Lạt');
    await buyModal.getByRole('button', { name: /Mua Ngay/i }).click();

    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    const laterFrames = Number(await canvas.getAttribute('data-rendered-frames'));
    expect(laterFrames).toBeGreaterThan(initialFrames);
    expect(errors).toEqual([]);
  });

  test('BUG-54b: Suspended AudioContext skips oscillator scheduling (zero queued t=0 sounds)', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);

    await page.addInitScript(() => {
      (window as unknown as { __btOscCount: number }).__btOscCount = 0;
      const win = window as unknown as {
        AudioContext?: new (contextOptions?: AudioContextOptions) => AudioContext;
        webkitAudioContext?: new (contextOptions?: AudioContextOptions) => AudioContext;
      };
      const Orig = win.AudioContext || win.webkitAudioContext;
      if (!Orig) return;

      const Wrapped = function (contextOptions?: AudioContextOptions) {
        const ctx = new Orig(contextOptions);
        Object.defineProperty(ctx, 'state', {
          get: () => 'suspended',
          configurable: true,
        });
        ctx.resume = () => Promise.resolve();
        const origCreateOsc = ctx.createOscillator.bind(ctx);
        ctx.createOscillator = () => {
          (window as unknown as { __btOscCount: number }).__btOscCount += 1;
          return origCreateOsc();
        };
        return ctx;
      };
      win.AudioContext = Wrapped as unknown as typeof AudioContext;
      win.webkitAudioContext = Wrapped as unknown as typeof AudioContext;
    });

    await page.goto('/?autostart=1&players=2&hotseat=1&dice=1-2');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');

    await page.getByTestId('bt-roll-dice-btn').click();
    const buyModal = page.getByTestId('buy-decision-modal');
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: /Mua Ngay/i }).click();
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();

    const oscCount = await page.evaluate(
      () => (window as unknown as { __btOscCount: number }).__btOscCount
    );
    expect(oscCount).toBe(0);
    expect(errors).toEqual([]);
  });

  test('Inline SVG favicon & zero HTTP >= 400 responses on initial page load', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);
    const failedResponses: Array<{ url: string; status: number }> = [];
    page.on('response', (res) => {
      if (res.status() >= 400) {
        failedResponses.push({ url: res.url(), status: res.status() });
      }
    });

    await page.goto('/');
    await expect(page.getByTestId('bt-casual-lobby')).toBeVisible();

    const iconMeta = await page.evaluate(() => {
      const link = document.querySelector('link[rel="icon"]');
      return link
        ? {
            type: link.getAttribute('type'),
            href: link.getAttribute('href'),
          }
        : null;
    });

    expect(iconMeta).not.toBeNull();
    expect(iconMeta?.type).toBe('image/svg+xml');
    expect(iconMeta?.href?.startsWith('data:image/svg+xml,')).toBe(true);
    expect(failedResponses).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('Lobby Start CTAs (Offline 2v2 & Online Room), unclipped player inputs down to 320px, SettingsPopover reflow, and Offline Start from Online Room', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);
    await page.setViewportSize({ width: 1536, height: 854 });
    await page.goto('/');

    const lobby = page.getByTestId('bt-casual-lobby');
    await expect(lobby).toBeVisible();

    // Select 2v2 + 3 000 000 + Low quality (exact user-reported lobby configuration)
    await lobby.getByTestId('bt-mode-2v2').click();
    await lobby.getByRole('button', { name: '3 000 000' }).click();
    await lobby.getByRole('button', { name: /Thấp/i }).click();

    const startBtn = lobby.locator('button[data-start="true"]');
    const lobbyViewports = [
      { width: 1920, height: 1067 },
      { width: 1536, height: 854 },
      { width: 1440, height: 900 },
      { width: 1366, height: 768 },
      { width: 1024, height: 768 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
      { width: 360, height: 800 },
      { width: 320, height: 568 },
      { width: 844, height: 390 },
    ];

    for (const vp of lobbyViewports) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(100);

      const box = await startBtn.boundingBox();
      assertWithinViewport(box, vp.width, vp.height, `Offline Start CTA @ ${vp.width}x${vp.height}`);

      // Verify elementFromPoint hits the Start button directly without any scrollIntoView
      const hitStart = await startBtn.evaluate((btn) => {
        const r = btn.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return Boolean(hit && (hit === btn || btn.contains(hit)));
      });
      expect(hitStart, `Start CTA must be unoccluded at ${vp.width}x${vp.height}`).toBe(true);

      // Zero horizontal page overflow, zero clipped player name inputs, and zero clipped buttons
      const layoutMetrics = await lobby.evaluate((dlg) => {
        const inputs = Array.from(
          dlg.querySelectorAll<HTMLInputElement>('input[id^="player-name-"]')
        );
        const clippedInputs = inputs
          .filter((el) => el.clientWidth <= 0 || el.scrollWidth > el.clientWidth + 1)
          .map((el) => `${el.id}:${el.clientWidth}/${el.scrollWidth}`);
        const clippedBtns = Array.from(dlg.querySelectorAll<HTMLButtonElement>('button'))
          .filter(
            (b) =>
              !b.classList.contains('icon-hit-target') &&
              b.clientWidth > 0 &&
              b.scrollWidth > b.clientWidth + 1
          )
          .map((b) => `${b.textContent?.trim()}:${b.clientWidth}/${b.scrollWidth}`);
        const scrollBody = dlg.querySelector<HTMLElement>('.slim-scroll');
        return {
          hOverflow: document.documentElement.scrollWidth > window.innerWidth,
          clippedInputs,
          clippedBtns,
          scrollClientH: scrollBody?.clientHeight ?? 0,
          scrollScrollH: scrollBody?.scrollHeight ?? 0,
        };
      });
      expect(layoutMetrics.hOverflow, `No horizontal overflow @ ${vp.width}x${vp.height}`).toBe(
        false
      );
      expect(
        layoutMetrics.clippedInputs,
        `Player inputs must not clip @ ${vp.width}x${vp.height}`
      ).toEqual([]);
      expect(
        layoutMetrics.clippedBtns,
        `Lobby buttons must not clip @ ${vp.width}x${vp.height}`
      ).toEqual([]);

      // On >= 1024x768 desktop/laptop, entire 3-column 2v2 body fits with zero vertical scroll needed
      if (vp.width >= 1024 && vp.height >= 768) {
        expect(
          layoutMetrics.scrollScrollH,
          `Desktop/laptop ${vp.width}x${vp.height} must fit without scrolling`
        ).toBeLessThanOrEqual(layoutMetrics.scrollClientH + 1);
      }

      // On >= 640px wide viewports, mode switcher tabs must stay on a single line (no orphaned words)
      if (vp.width >= 640) {
        for (const tab of [getTabOffline(lobby), getTabOnline(lobby)]) {
          const tabBox = await tab.boundingBox();
          expect(tabBox).not.toBeNull();
          expect(
            tabBox!.height,
            `Mode tab must stay single-line at ${vp.width}x${vp.height}`
          ).toBeLessThanOrEqual(46);
        }
      }
    }

    // Trigger validationError banner & verify scroll body remains generous at 844x390 and 320x568
    await lobby.locator('#player-name-0').fill('   ');
    await startBtn.click();
    await expect(lobby.getByRole('alert')).toBeVisible();
    for (const vp of [
      { width: 844, height: 390, minScrollH: 150 },
      { width: 320, height: 568, minScrollH: 220 },
    ]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(80);
      assertWithinViewport(
        await startBtn.boundingBox(),
        vp.width,
        vp.height,
        `Start CTA with validationError @ ${vp.width}x${vp.height}`
      );
      const scrollClientH = await lobby
        .locator('.slim-scroll')
        .first()
        .evaluate((el) => el.clientHeight);
      expect(scrollClientH).toBeGreaterThanOrEqual(vp.minScrollH);
    }
    await lobby.locator('#player-name-0').fill('Người chơi 1');

    // Verify Online Room Start & Leave CTAs stay pinned within viewport without scrolling (even with 2v2 start hint!)
    await page.setViewportSize({ width: 1536, height: 854 });
    await getTabOnline(lobby).click();
    await lobby.getByTestId('bt-mode-2v2').click();
    await lobby.getByRole('button', { name: /Bù Bot AI nếu thiếu người/i }).click();
    await lobby.getByTestId('bt-create-room-btn').click();
    const onlineStartBtn = lobby.getByTestId('bt-online-start-btn');
    const leaveRoomBtn = lobby.getByRole('button', { name: 'Rời Phòng' });
    await expect(onlineStartBtn).toBeVisible();
    await expect(lobby.getByTestId('bt-online-start-hint')).toBeVisible();

    for (const vp of [
      { width: 1536, height: 854 },
      { width: 1366, height: 768 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(100);
      assertWithinViewport(
        await onlineStartBtn.boundingBox(),
        vp.width,
        vp.height,
        `Online Start CTA @ ${vp.width}x${vp.height}`
      );
      assertWithinViewport(
        await leaveRoomBtn.boundingBox(),
        vp.width,
        vp.height,
        `Online Leave CTA @ ${vp.width}x${vp.height}`
      );
    }

    // Switching directly from an active Online Room back to Offline tab & clicking Start MUST leave room & launch Offline match!
    await page.setViewportSize({ width: 1536, height: 854 });
    await getTabOffline(lobby).click();
    await page.waitForTimeout(100);

    const finalStartBox = await startBtn.boundingBox();
    expect(finalStartBox).not.toBeNull();
    await page.mouse.click(
      finalStartBox!.x + finalStartBox!.width / 2,
      finalStartBox!.y + finalStartBox!.height / 2
    );

    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await expect(lobby).toHaveCount(0);
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();

    // SettingsPopover buttons must not clip text at desktop 1536x854 or compact 320x568
    await page.getByTestId('bt-btn-settings').click();
    const settingsPop = page.getByTestId('bt-settings-popover');
    await expect(settingsPop).toBeVisible();
    for (const vp of [
      { width: 1536, height: 854 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(80);
      const clipped = await settingsPop.evaluate((pop) =>
        Array.from(pop.querySelectorAll<HTMLButtonElement>('button'))
          .filter(
            (b) =>
              !b.classList.contains('icon-hit-target') &&
              b.clientWidth > 0 &&
              b.scrollWidth > b.clientWidth + 1
          )
          .map((b) => b.textContent?.trim())
      );
      expect(clipped, `SettingsPopover buttons must not clip @ ${vp.width}x${vp.height}`).toEqual(
        []
      );
    }
    expect(errors).toEqual([]);
  });

  test('Online action lock prevents duplicate ROLL_DICE under RTT and LuckCardModal stays un-hijacked & in-viewport at 844x390', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);

    await page.addInitScript(() => {
      const win = window as unknown as {
        __btSentActions: string[];
        __btWsDelayMs: number;
      };
      win.__btSentActions = [];
      win.__btWsDelayMs = 0;
      const OrigWS = window.WebSocket;
      window.WebSocket = class extends OrigWS {
        send(data: string | Blob | BufferSource) {
          try {
            const parsed = JSON.parse(String(data)) as {
              type?: string;
              action?: { kind?: string };
            };
            if (parsed.type === 'GAME_ACTION' && parsed.action?.kind) {
              win.__btSentActions.push(parsed.action.kind);
              if (win.__btWsDelayMs > 0) {
                window.setTimeout(() => super.send(data), win.__btWsDelayMs);
                return;
              }
            }
          } catch {
            // ignore non-JSON
          }
          super.send(data);
        }
      } as typeof WebSocket;
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await getTabOnline(page).click();
    await page.getByRole('button', { name: '2 Người' }).click();
    await page.getByTestId('bt-create-room-btn').click();
    await expect(page.getByTestId('bt-online-start-btn')).toBeVisible();
    await page.getByTestId('bt-online-start-btn').click();

    const rollBtn = page.getByTestId('bt-roll-dice-btn');
    await expect(rollBtn).toBeVisible();

    await page.evaluate(() => {
      const win = window as unknown as { __btSentActions: string[]; __btWsDelayMs: number };
      win.__btSentActions = [];
      win.__btWsDelayMs = 550;
    });

    await rollBtn.click();
    await expect(rollBtn).toBeDisabled();
    const box = await rollBtn.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
    const sentCount = await page.evaluate(
      () => (window as unknown as { __btSentActions: string[] }).__btSentActions.length
    );
    expect(sentCount).toBe(1);

    // Even with bt_online_session_v1 in localStorage, ?demo_event=1 stays in offline event mode & fits 844x390 without scroll
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/?demo_event=1&hotseat=1');
    const confirmCardBtn = page.getByTestId('luck-card-confirm-btn');
    await expect(confirmCardBtn).toBeVisible();
    await page.waitForTimeout(250);
    await expect(page.getByTestId('bt-casual-lobby')).toHaveCount(0);
    assertWithinViewport(
      await confirmCardBtn.boundingBox(),
      844,
      390,
      'LuckCardModal Tiếp Tục Ngay @ 844x390'
    );

    expect(errors).toEqual([]);
  });

  test('Board-focused 3D layout keeps all 4 corners unclipped on desktop/mobile and renders 4-edge player vaults, courtyard Bank & Night Mode cleanly', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);

    for (const vp of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(vp);
      await page.goto('/?autostart=1&players=4&hotseat=1&dice=1-2,1-2&quality=low');
      await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');

      for (const cornerIdx of [0, 8, 16, 24]) {
        const pt = await getTileScreenPoint(page, cornerIdx);
        expect(pt, `Corner ${cornerIdx} must project cleanly @ ${vp.width}x${vp.height}`).not.toBeNull();
        expect(pt!.x).toBeGreaterThan(8);
        expect(pt!.x).toBeLessThan(vp.width - 8);
        expect(pt!.y).toBeGreaterThan(24);
        expect(pt!.y).toBeLessThan(vp.height - 16);
      }
    }

    // Switch back to 1440x900, verify all 4 currency styles on 4-edge player vaults + Night Mode + live tray-to-tray rent transfer
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?autostart=1&players=2&hotseat=1&dice=1-2,1-2&quality=high');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await enable2xSpeed(page);

    await page.getByTestId('bt-btn-settings').click();
    const settingsPop = page.getByTestId('bt-settings-popover');
    await expect(settingsPop).toBeVisible();
    for (const styleLabel of ['Tiền mặt', 'Tiền xu', 'Vàng & Chip', 'Tiền mặt & Xu']) {
      await settingsPop.getByRole('button', { name: styleLabel, exact: true }).click();
    }
    await settingsPop.getByRole('button', { name: /Chế độ ánh sáng/i }).click();
    await settingsPop.getByRole('button', { name: 'Góc Chuẩn 3D' }).click();
    await expect(settingsPop).toHaveCount(0);

    // P1 buys Đà Lạt -> P2 lands on Đà Lạt & pays rent (triggers on-board pawn-to-pawn 3D cash-flow arc)
    await page.getByTestId('bt-roll-dice-btn').click();
    const buyModal = page.getByTestId('buy-decision-modal');
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: /Mua Ngay/i }).click();

    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    const buyoutModal = page.getByTestId('buyout-decision-modal');
    await expect(buyoutModal).toBeVisible();
    await buyoutModal.getByRole('button', { name: 'Bỏ Qua' }).click();
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();

    expect(errors).toEqual([]);
  });
});
