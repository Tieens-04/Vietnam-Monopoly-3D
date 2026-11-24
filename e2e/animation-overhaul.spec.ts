import { expect, test } from '@playwright/test';
import { attachZeroErrorGuard, enable2xSpeed } from './helpers';

test.describe('Phase 2 — 3D Animation Overhaul Verification Suite', () => {
  test('AT-GLB-LOAD & AT-CAM-OVERRIDE: 4 rigged pawn GLBs load HTTP 200, cinematic defaults ON, OrbitControls drag survives roll+hop and recovers on next turn', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);
    const loadedGlbs = new Set<string>();
    page.on('response', (res) => {
      if (res.url().includes('/assets/models/') && res.url().endsWith('.glb') && res.status() === 200) {
        const name = res.url().split('/').pop() ?? '';
        loadedGlbs.add(name);
      }
    });

    await page.goto('/?autostart=1&players=4&hotseat=1&dice=2-1&quality=high');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await expect(page.locator('body')).toHaveAttribute('data-cinematic', 'on');

    // Wait for all 4 Blender rigged pawn GLBs to upgrade asynchronously
    await expect
      .poll(() => loadedGlbs.size, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(4);
    expect(Array.from(loadedGlbs).sort()).toEqual([
      'pawn_car.glb',
      'pawn_crown.glb',
      'pawn_jet.glb',
      'pawn_yacht.glb',
    ]);

    const boardCanvas = page.locator('canvas').first();
    const box = await boardCanvas.boundingBox();
    expect(box).not.toBeNull();

    // Drag OrbitControls on the board -> camera director yields immediately to USER_MANUAL_OVERRIDE
    const cx = box!.x + box!.width * 0.5;
    const cy = box!.y + box!.height * 0.5;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 110, cy - 35, { steps: 6 });
    await page.mouse.up();
    await expect(boardCanvas).toHaveAttribute('data-camera-shot', 'USER_MANUAL_OVERRIDE');

    // Roll & hop in the same turn -> must NOT overwrite USER_MANUAL_OVERRIDE
    await page.getByTestId('bt-roll-dice-btn').click();
    await page.waitForTimeout(450);
    await expect(boardCanvas).toHaveAttribute('data-camera-shot', 'USER_MANUAL_OVERRIDE');

    const buyModal = page.getByTestId('buy-decision-modal');
    await expect(buyModal).toBeVisible({ timeout: 12_000 });
    await expect(boardCanvas).toHaveAttribute('data-camera-shot', 'USER_MANUAL_OVERRIDE');

    // Finish turn (Skip) -> turn boundary recovers smart framing smoothly
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible({ timeout: 10_000 });
    await expect(boardCanvas).toHaveAttribute('data-camera-shot', 'ACTIVE_PLAYER_FOCUS', {
      timeout: 5_000,
    });

    // Reset Camera button returns to OVERVIEW (automatically closes settings popover)
    await page.getByTestId('bt-btn-settings').click();
    await page.getByRole('button', { name: /Góc Chuẩn 3D/i }).click();
    await expect(boardCanvas).toHaveAttribute('data-camera-shot', 'OVERVIEW', {
      timeout: 5_000,
    });

    expect(errors).toEqual([]);
  });

  test('AT-SPEED-2X & AT-LIFE-PAUSE: 2x speed accelerates roll+hop cleanly and mid-flight Pause freezes & resumes cleanly on Phan Thiết', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);

    // 1. Measure 1x speed roll+hop (6+5 -> Phan Thiết)
    await page.goto('/?autostart=1&players=2&hotseat=1&dice=6-5&quality=medium');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    const t1Start = Date.now();
    await page.getByTestId('bt-roll-dice-btn').click();
    const buyModal = page.getByTestId('buy-decision-modal');
    await expect(buyModal).toBeVisible({ timeout: 12_000 });
    const ms1x = Date.now() - t1Start;
    await expect(buyModal).toContainText('Phan Thiết');

    // 2. Measure 2x speed roll+hop (6+5 -> Phan Thiết)
    await page.goto('/?autostart=1&players=2&hotseat=1&dice=6-5&quality=medium');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await enable2xSpeed(page);
    const t2Start = Date.now();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible({ timeout: 10_000 });
    const ms2x = Date.now() - t2Start;
    await expect(buyModal).toContainText('Phan Thiết');
    expect(ms2x, `Expected 2x speed (${ms2x}ms) to beat 1x speed (${ms1x}ms)`).toBeLessThan(
      ms1x * 0.78
    );

    // 3. AT-LIFE-PAUSE: Pause mid-hop for 1.8s, verify clock freezes & Resume lands cleanly
    await page.goto('/?autostart=1&players=2&hotseat=1&dice=6-5&quality=medium');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await page.getByTestId('bt-roll-dice-btn').click();
    await page.waitForTimeout(1_100);
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'paused');

    const clockTextAtPause = await page.getByTestId('bt-match-clock').textContent();
    await page.waitForTimeout(1_800);
    const clockTextAfterWait = await page.getByTestId('bt-match-clock').textContent();
    expect(clockTextAfterWait).toBe(clockTextAtPause);
    await expect(buyModal).toHaveCount(0);

    await page.getByTestId('pause-modal').getByRole('button', { name: 'Tiếp Tục Chơi' }).click();
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await expect(buyModal).toBeVisible({ timeout: 12_000 });
    await expect(buyModal).toContainText('Phan Thiết');

    expect(errors).toEqual([]);
  });

  test('AT-GPU-HOTSWAP & AT-LOW-IDLE: Quality hot-swap Low->Medium->High->Low mid-action yields 0 errors and returns Low idle to <=4 draws/3s', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);

    await page.goto('/?autostart=1&players=4&hotseat=1&dice=4-3&quality=low');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await expect(page.locator('body')).toHaveAttribute('data-quality', 'low');

    const boardCanvas = page.locator('canvas').first();
    // Wait for initial GLB swap & first settle
    await page.waitForTimeout(900);
    const f0 = Number((await boardCanvas.getAttribute('data-rendered-frames')) ?? '0');
    await page.waitForTimeout(3_000);
    const f1 = Number((await boardCanvas.getAttribute('data-rendered-frames')) ?? '0');
    expect(f1 - f0, 'Low idle must stay <= 4 draws over 3s (0 FPS between 1s ticks)').toBeLessThanOrEqual(4);

    // Trigger action + hot-swap Low -> Medium -> High -> Low
    await page.getByTestId('bt-roll-dice-btn').click();
    await page.getByTestId('bt-btn-settings').click();
    await page.getByTestId('bt-quality-opt-medium').click();
    await expect(page.locator('body')).toHaveAttribute('data-quality', 'medium');
    await page.getByTestId('bt-quality-opt-high').click();
    await expect(page.locator('body')).toHaveAttribute('data-quality', 'high');
    await page.getByTestId('bt-quality-opt-low').click();
    await expect(page.locator('body')).toHaveAttribute('data-quality', 'low');
    await page.getByRole('button', { name: 'Đóng cài đặt' }).click();

    const buyModal = page.getByTestId('buy-decision-modal');
    await expect(buyModal).toBeVisible({ timeout: 12_000 });
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible({ timeout: 10_000 });

    // Allow post-turn animations to finish, then verify Low returns to 0 FPS idle
    await page.waitForTimeout(1_000);
    const f2 = Number((await boardCanvas.getAttribute('data-rendered-frames')) ?? '0');
    await page.waitForTimeout(3_000);
    const f3 = Number((await boardCanvas.getAttribute('data-rendered-frames')) ?? '0');
    expect(
      f3 - f2,
      'After hot-swap back to Low, idle draws over 3s must return to <= 4'
    ).toBeLessThanOrEqual(4);

    expect(errors).toEqual([]);
  });

  test('AT-A11Y-REDUCED & AT-LIFE-RESET: Reduced motion keeps OVERVIEW camera & cleared confetti, loads trophy_podium.glb on gameover, and New Game resets ceremony cleanly', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });

    let loadedTrophyGlb = false;
    page.on('response', (res) => {
      if (res.url().includes('trophy_podium.glb') && res.status() === 200) {
        loadedTrophyGlb = true;
      }
    });

    await page.goto(
      '/?autostart=1&players=3&hotseat=1&cash=240000&dice=2-3,1-2,1-2,2-2,3-4,1-1,1-1&quality=high'
    );
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await enable2xSpeed(page);

    const boardCanvas = page.locator('canvas').first();
    // Under prefers-reduced-motion: reduce, camera locks strictly to OVERVIEW during normal turns
    await expect(boardCanvas).toHaveAttribute('data-camera-shot', 'OVERVIEW');

    const rollBtn = page.getByTestId('bt-roll-dice-btn');
    const buyModal = page.getByTestId('buy-decision-modal');
    const buyoutModal = page.getByTestId('buyout-decision-modal');
    const champModal = page.getByTestId('championship-decision-modal');
    const debtModal = page.getByTestId('asset-management-modal');

    await rollBtn.click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: /2 Nhà/i }).click();
    await buyModal.getByRole('button', { name: /Mua Ngay/i }).click();

    await expect(rollBtn).toBeVisible();
    await rollBtn.click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: /Mua Ngay/i }).click();

    await expect(rollBtn).toBeVisible();
    await rollBtn.click();
    await expect(buyoutModal).toBeVisible();
    await buyoutModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    await expect(rollBtn).toBeVisible();
    await rollBtn.click();

    await expect(rollBtn).toBeVisible();
    await rollBtn.click();
    await expect(champModal).toBeVisible();
    await champModal.getByRole('button', { name: /Ninh Bình/i }).click();

    await expect(rollBtn).toBeVisible();
    await rollBtn.click();
    await expect(debtModal).toBeVisible();
    await debtModal.getByRole('button', { name: 'Phá Sản' }).click();

    await expect(rollBtn).toBeVisible();
    await rollBtn.click();

    await expect(page.locator('body')).toHaveAttribute('data-state', 'gameover', {
      timeout: 15_000,
    });
    await expect(boardCanvas).toHaveAttribute('data-endgame-ceremony', 'active', {
      timeout: 8_000,
    });
    await expect(boardCanvas).toHaveAttribute('data-camera-shot', 'VICTORY_PODIUM', {
      timeout: 8_000,
    });
    await expect.poll(() => loadedTrophyGlb, { timeout: 8_000 }).toBe(true);

    // AT-LIFE-RESET: Click "Chơi Ván Mới" -> ceremony clears immediately to idle & OVERVIEW
    await page
      .getByTestId('victory-modal')
      .getByRole('button', { name: /Chơi Ván Mới/i })
      .click();
    await expect(page.locator('body')).toHaveAttribute('data-state', 'title', {
      timeout: 8_000,
    });
    await expect(boardCanvas).toHaveAttribute('data-endgame-ceremony', 'idle', {
      timeout: 5_000,
    });

    expect(errors).toEqual([]);
  });

  test('AT-GPU-CTXLOSS: Simulated board WebGL context loss & restore recovers rendering and gameplay cleanly', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);

    await page.addInitScript(() => {
      const origGetContext = HTMLCanvasElement.prototype.getContext;
      const win = window as unknown as {
        __btGlEntries?: Array<{
          canvas: HTMLCanvasElement;
          gl: WebGL2RenderingContext | WebGLRenderingContext;
        }>;
      };
      win.__btGlEntries = [];
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type: string,
        ...args: unknown[]
      ) {
        const ctx = origGetContext.apply(this, [type, ...args] as Parameters<
          typeof origGetContext
        >);
        if ((type === 'webgl2' || type === 'webgl') && ctx) {
          win.__btGlEntries!.push({
            canvas: this,
            gl: ctx as WebGL2RenderingContext,
          });
        }
        return ctx;
      } as typeof HTMLCanvasElement.prototype.getContext;
    });

    await page.goto('/?autostart=1&players=2&hotseat=1&dice=1-2&quality=medium');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');

    const boardCanvas = page.locator('canvas').first();
    await page.waitForTimeout(500);

    // Simulate real GPU context loss -> 350ms -> restore on the actual Monopoly board canvas
    const triggered = await page.evaluate(() => {
      const win = window as unknown as {
        __btGlEntries?: Array<{
          canvas: HTMLCanvasElement;
          gl: WebGL2RenderingContext;
        }>;
        __btLoseExt?: WEBGL_lose_context | null;
      };
      const entry = (win.__btGlEntries ?? []).find(
        (item) => Boolean(item.canvas.dataset.cameraShot) && !item.gl.isContextLost()
      );
      if (!entry) return false;
      const ext = entry.gl.getExtension('WEBGL_lose_context');
      if (!ext) return false;
      win.__btLoseExt = ext;
      ext.loseContext();
      return true;
    });
    expect(triggered).toBe(true);
    await page.waitForTimeout(350);

    const framesBeforeRestore = Number(
      (await boardCanvas.getAttribute('data-rendered-frames')) ?? '0'
    );
    await page.evaluate(() => {
      const ext = (window as unknown as { __btLoseExt?: WEBGL_lose_context }).__btLoseExt;
      ext?.restoreContext();
    });

    // Confirm WebGL resumes rendering frames cleanly after context restore
    await expect
      .poll(
        async () =>
          Number((await boardCanvas.getAttribute('data-rendered-frames')) ?? '0'),
        { timeout: 8_000 }
      )
      .toBeGreaterThan(framesBeforeRestore);

    // Confirm gameplay roll -> buy modal still works seamlessly after restore
    await page.getByTestId('bt-roll-dice-btn').click();
    const buyModal = page.getByTestId('buy-decision-modal');
    await expect(buyModal).toBeVisible({ timeout: 12_000 });
    await expect(buyModal).toContainText('Đà Lạt');

    expect(errors).toEqual([]);
  });
});
