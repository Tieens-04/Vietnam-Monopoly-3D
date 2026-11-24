// Reproducible Headed Chrome Benchmark & Verification for BUG-03 (Offline Clock),
// BUG-10 (Animation Sync across 60, 30, 15, 5, 2.5 FPS + Hidden Tab + Pause/Resume),
// and Graphics Quality Switching / Demand-Driven Idle Rendering.
// Usage: npx tsx scripts/gameplay-audit/pw-fps-and-clock-benchmark.ts
import { chromium } from '@playwright/test';
import { createAppServer } from '../../src/server/appServer';

process.env.NODE_ENV = 'production';
process.env.GEMINI_API_KEY = '';

const PORT = 3211;
const BASE = `http://127.0.0.1:${PORT}`;

function parseClockSeconds(t: string): number | null {
  const m = t.match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

interface FpsBenchResult {
  targetFps: number;
  intervalMs: number;
  wallMsToModal: number;
  renderedFramesDelta: number;
  effectiveFps: number;
  landedPhanThiet: boolean;
  consoleErrors: string[];
}

async function main(): Promise<void> {
  const appBundle = await createAppServer({ enableVite: false });
  await new Promise<void>((resolve) => {
    appBundle.httpServer.listen(PORT, '127.0.0.1', () => resolve());
  });

  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
  });

  const hiddenOnly = process.argv.includes('--hidden-only');
  const report: Record<string, unknown> = {};

  try {
    // -------------------------------------------------------------------------
    // 1. BUG-10 Benchmark: Measure dice + 11-tile hop animation duration at
    //    60, 30, 15, 5, and 2.5 FPS (dice=6-5 -> Phan Thiết, tile 11)
    // -------------------------------------------------------------------------
    if (!hiddenOnly) {
    const fpsTargets = [60, 30, 15, 5, 2.5];
    const fpsResults: FpsBenchResult[] = [];

    for (const targetFps of fpsTargets) {
      const intervalMs = targetFps >= 60 ? 0 : Math.round(1000 / targetFps);
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      if (intervalMs > 0) {
        await ctx.addInitScript((delayMs: number) => {
          const origRaf = window.requestAnimationFrame.bind(window);
          const origCancel = window.cancelAnimationFrame.bind(window);
          const pending = new Map<number, number>();
          let seq = 1;
          window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
            const id = seq++;
            const timerId = window.setTimeout(() => {
              pending.delete(id);
              origRaf(cb);
            }, delayMs);
            pending.set(id, timerId);
            return id;
          };
          window.cancelAnimationFrame = (id: number): void => {
            const timerId = pending.get(id);
            if (timerId !== undefined) {
              window.clearTimeout(timerId);
              pending.delete(id);
            } else {
              origCancel(id);
            }
          };
        }, intervalMs);
      }

      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });

      await page.goto(`${BASE}/?autostart=1&players=2&hotseat=1&dice=6-5&quality=low`);
      await page.waitForSelector('body[data-state="playing"]');
      await page.getByTestId('bt-roll-dice-btn').waitFor({ state: 'visible' });
      await page.waitForTimeout(300);

      const framesBefore = await page.evaluate(() =>
        Number(document.querySelector('canvas')?.getAttribute('data-rendered-frames') || '0')
      );
      const t0 = Date.now();
      await page.getByTestId('bt-roll-dice-btn').click();
      await page.getByTestId('buy-decision-modal').waitFor({ state: 'visible', timeout: 15_000 });
      const wallMsToModal = Date.now() - t0;
      const framesAfter = await page.evaluate(() =>
        Number(document.querySelector('canvas')?.getAttribute('data-rendered-frames') || '0')
      );
      const modalText = await page.getByTestId('buy-decision-modal').innerText();
      const delta = framesAfter - framesBefore;

      fpsResults.push({
        targetFps,
        intervalMs,
        wallMsToModal,
        renderedFramesDelta: delta,
        effectiveFps: Number(((delta * 1000) / Math.max(1, wallMsToModal)).toFixed(1)),
        landedPhanThiet: /Phan Thiết/i.test(modalText),
        consoleErrors: errors,
      });

      await ctx.close();
    }
    report.bug10FpsBenchmark = fpsResults;

    // -------------------------------------------------------------------------
    // 2. BUG-10 Pause/Resume mid-hop + Graphics Quality Hot-Swap + Idle Draw Check
    // -------------------------------------------------------------------------
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });

      await page.goto(`${BASE}/?autostart=1&players=2&hotseat=1&dice=6-5&quality=low`);
      await page.waitForSelector('body[data-state="playing"]');

      // Demand-driven idle check on Low quality (wait 3s idle -> ~0 frames!)
      await page.waitForTimeout(700);
      const idleStart = await page.evaluate(() =>
        Number(document.querySelector('canvas')?.getAttribute('data-rendered-frames') || '0')
      );
      await page.waitForTimeout(3000);
      const idleEnd = await page.evaluate(() =>
        Number(document.querySelector('canvas')?.getAttribute('data-rendered-frames') || '0')
      );

      // Pause mid-move for 3.5s, then resume and verify clean landing on Phan Thiết
      const rollT0 = Date.now();
      await page.getByTestId('bt-roll-dice-btn').click();
      await page.waitForTimeout(1600);
      await page.keyboard.press('Escape');
      const pausedState = await page.locator('body').getAttribute('data-state');
      const clockAtPause = parseClockSeconds(await page.getByTestId('bt-match-clock').innerText());
      await page.waitForTimeout(3500);
      const clockStillPaused = parseClockSeconds(
        await page.getByTestId('bt-match-clock').innerText()
      );
      await page.keyboard.press('Escape');
      await page.getByTestId('buy-decision-modal').waitFor({ state: 'visible', timeout: 10_000 });
      const totalWithPauseMs = Date.now() - rollT0;
      const modalText = await page.getByTestId('buy-decision-modal').innerText();
      await page.getByTestId('buy-decision-modal').getByRole('button', { name: /Bỏ Qua/i }).click();

      // Quality hot-swap: low -> medium -> high -> low
      const tiersObserved: string[] = [];
      await page.getByTestId('bt-btn-settings').click();
      for (const tier of ['low', 'medium', 'high', 'low'] as const) {
        const btn = page.getByTestId(`bt-quality-opt-${tier}`);
        await btn.waitFor({ state: 'visible', timeout: 5000 });
        await btn.click();
        await page.waitForTimeout(400);
        const applied = await page.locator('body').getAttribute('data-quality');
        tiersObserved.push(applied || tier);
      }
      await page.getByRole('button', { name: 'Đóng cài đặt' }).click();

      report.pauseAndQuality = {
        lowTierIdleDrawsOver3s: idleEnd - idleStart,
        pausedState,
        clockFrozenDuringPause: clockAtPause === clockStillPaused,
        totalWith3500msPauseMs: totalWithPauseMs,
        landedPhanThietAfterResume: /Phan Thiết/i.test(modalText),
        tiersObserved,
        consoleErrors: errors,
      };
      await ctx.close();
    }
    } // end if (!hiddenOnly)

    // -------------------------------------------------------------------------
    // 3. BUG-10 Real Background / Hidden Tab Progression
    // -------------------------------------------------------------------------
    {
      const hiddenBrowser = await chromium.launch({
        headless: false,
        channel: 'chrome',
        ignoreDefaultArgs: [
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
        ],
      });
      try {
        const ctx = await hiddenBrowser.newContext({ viewport: { width: 1280, height: 800 } });
        const page1 = await ctx.newPage();
        await page1.goto(`${BASE}/?autostart=1&players=2&hotseat=1&dice=3-4,2-3&quality=low`);
        await page1.waitForSelector('body[data-state="playing"]');

        const page2 = await ctx.newPage();
        await page2.goto('about:blank');
        await page2.bringToFront();
        await page2.waitForTimeout(300);

        const beforeRoll = await page1.evaluate(() => ({
          visibilityState: document.visibilityState,
          frames: Number(document.querySelector('canvas')?.getAttribute('data-rendered-frames') || '0'),
        }));
        const hiddenRollStart = Date.now();
        await page1.evaluate(() => {
          (document.querySelector('[data-testid="bt-roll-dice-btn"]') as HTMLButtonElement | null)?.click();
        });
        let hiddenRollModalMs: number | null = null;
        for (let i = 0; i < 40; i++) {
          await page2.waitForTimeout(250);
          const open = await page1.evaluate(() =>
            Boolean(document.querySelector('[data-testid="buy-decision-modal"]'))
          );
          if (open) {
            hiddenRollModalMs = Date.now() - hiddenRollStart;
            break;
          }
        }
        const afterHiddenRoll = await page1.evaluate(() => ({
          visibilityState: document.visibilityState,
          frames: Number(document.querySelector('canvas')?.getAttribute('data-rendered-frames') || '0'),
          buyModalOpenWhileHidden: Boolean(document.querySelector('[data-testid="buy-decision-modal"]')),
        }));

        // Also verify 3 Bot turns finish while tab is hidden/occluded
        await page1.bringToFront();
        await page1.goto(`${BASE}/?autostart=1&players=4&dice=1-2,2-3,3-4,4-1&quality=low`);
        await page1.waitForSelector('body[data-state="playing"]');
        await page1.getByTestId('bt-roll-dice-btn').click();
        await page1.getByTestId('buy-decision-modal').waitFor({ state: 'visible', timeout: 8000 });
        await page1.getByTestId('buy-decision-modal').getByRole('button', { name: /Bỏ Qua/i }).click();

        await page2.bringToFront();
        await page2.waitForTimeout(200);
        const botStartFrames = await page1.evaluate(() =>
          Number(document.querySelector('canvas')?.getAttribute('data-rendered-frames') || '0')
        );
        const hiddenBotsStart = Date.now();
        let hiddenBotsReturnMs: number | null = null;
        for (let i = 0; i < 60; i++) {
          await page2.waitForTimeout(500);
          const returned = await page1.evaluate(() =>
            Boolean(document.querySelector('[data-testid="bt-roll-dice-btn"]'))
          );
          if (returned) {
            hiddenBotsReturnMs = Date.now() - hiddenBotsStart;
            break;
          }
        }
        const botAfterHidden = await page1.evaluate(() => ({
          visibilityState: document.visibilityState,
          frames: Number(document.querySelector('canvas')?.getAttribute('data-rendered-frames') || '0'),
          rollBtnReturnedToHuman: Boolean(document.querySelector('[data-testid="bt-roll-dice-btn"]')),
        }));

        report.bug10HiddenTab = {
          beforeRoll,
          afterHiddenRoll,
          hiddenRollModalMs,
          webglDrawsWhileHiddenRoll: afterHiddenRoll.frames - beforeRoll.frames,
          botWebglDrawsWhileHidden: botAfterHidden.frames - botStartFrames,
          hiddenBotsReturnMs,
          botAfterHidden,
        };
        await ctx.close();
      } finally {
        await hiddenBrowser.close();
      }
    }

    // -------------------------------------------------------------------------
    // 4. BUG-03 Offline Monotonic Match Clock Drift over 60s Active Gameplay
    // -------------------------------------------------------------------------
    if (!hiddenOnly) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });

      await page.goto(`${BASE}/?autostart=1&players=4&quality=low`);
      await page.waitForSelector('body[data-state="playing"]');
      const clock = page.getByTestId('bt-match-clock');
      await clock.waitFor({ state: 'visible' });
      await page.waitForTimeout(1200);

      const t0 = Date.now();
      const c0 = parseClockSeconds(await clock.innerText());
      const roll = page.getByTestId('bt-roll-dice-btn');
      const samples: Array<[number, number | null]> = [];

      for (let i = 0; i < 12; i++) {
        if (await roll.isVisible().catch(() => false)) {
          await roll.click({ timeout: 1000 }).catch(() => {});
        }
        const skip = page.getByRole('button', { name: /Bỏ qua|Bỏ Qua|Không mua/i }).first();
        if (await skip.isVisible().catch(() => false)) {
          await skip.click({ timeout: 1000 }).catch(() => {});
        }
        await page.waitForTimeout(5000);
        samples.push([Math.round((Date.now() - t0) / 1000), parseClockSeconds(await clock.innerText())]);
      }

      const wallSec = (Date.now() - t0) / 1000;
      const c1 = parseClockSeconds(await clock.innerText());
      const clockElapsed = c0 !== null && c1 !== null ? c0 - c1 : null;
      report.bug03OfflineClockDrift = {
        wallSeconds: Number(wallSec.toFixed(1)),
        clockStart: c0,
        clockEnd: c1,
        clockElapsed,
        lostSeconds: clockElapsed !== null ? Number((wallSec - clockElapsed).toFixed(1)) : null,
        driftPercent:
          clockElapsed !== null
            ? Number((((wallSec - clockElapsed) / wallSec) * 100).toFixed(2))
            : null,
        samples,
        consoleErrors: errors,
      };
      await ctx.close();
    }

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
    await appBundle.close();
  }
}

void main();
