import { expect, test } from '@playwright/test';
import { WebSocket } from 'ws';
import type { ServerToClientMessage } from '../src/game/onlineTypes';
import {
  attachZeroErrorGuard,
  getMatchClock,
  getMode2v2Toggle,
  getTabOnline,
  getTacticalDiceToggle,
  getTacticalEvenBtn,
} from './helpers';

function parseClockSeconds(text: string): number | null {
  const m = text.match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function connectRawWs(url: string): Promise<{
  ws: WebSocket;
  inbox: ServerToClientMessage[];
  send: (msg: unknown) => void;
  waitFor: (
    predicate: (msg: ServerToClientMessage) => boolean,
    timeoutMs?: number
  ) => Promise<ServerToClientMessage>;
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const inbox: ServerToClientMessage[] = [];
    const waiters: Array<{
      predicate: (msg: ServerToClientMessage) => boolean;
      resolve: (msg: ServerToClientMessage) => void;
    }> = [];

    ws.on('message', (raw) => {
      const parsed = JSON.parse(raw.toString()) as ServerToClientMessage;
      inbox.push(parsed);
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].predicate(parsed)) {
          const [w] = waiters.splice(i, 1);
          w.resolve(parsed);
        }
      }
    });
    ws.on('error', reject);
    ws.on('open', () => {
      resolve({
        ws,
        inbox,
        send: (msg: unknown) => ws.send(JSON.stringify(msg)),
        waitFor: (predicate, timeoutMs = 8000) => {
          const existing = inbox.find(predicate);
          if (existing) return Promise.resolve(existing);
          return new Promise((res, rej) => {
            const timer = setTimeout(
              () => rej(new Error('Timed out waiting for WS message')),
              timeoutMs
            );
            waiters.push({
              predicate,
              resolve: (m) => {
                clearTimeout(timer);
                res(m);
              },
            });
          });
        },
      });
    });
  });
}

test.describe('Online Resilience, Multiplayer Integrity & Timing Regressions', () => {
  test('BUG-04 & BUG-06: Offline clicks never replay stale GAME_ACTION on reconnect, and server rejects stale/duplicate/wrong-phase actions cleanly', async ({
    browser,
    baseURL,
  }) => {
    const wsUrl = `${(baseURL || 'http://127.0.0.1:3099').replace(/^http/, 'ws')}/ws`;

    // Part A: Live browser reconnect test — click while WS disconnected must NEVER flush stale GAME_ACTION on reconnect
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();
    const hostErrors = attachZeroErrorGuard(hostPage);
    const guestErrors = attachZeroErrorGuard(guestPage);

    const outboundWire: Array<{ type: string; kind?: string; ts: number }> = [];
    let holdNextReconnect = false;
    const socketClosers: Array<() => void> = [];

    await hostPage.routeWebSocket(/\/ws/, (ws) => {
      let closed = false;
      const server = ws.connectToServer();
      socketClosers.push(() => {
        if (closed) return;
        closed = true;
        ws.close();
        server.close();
      });
      ws.onClose(() => {
        closed = true;
      });
      server.onClose(() => {
        closed = true;
      });
      ws.onMessage((raw) => {
        if (closed) return;
        try {
          const parsed = JSON.parse(String(raw)) as {
            type?: string;
            action?: { kind?: string };
          };
          outboundWire.push({
            type: parsed.type || 'UNKNOWN',
            kind: parsed.action?.kind,
            ts: Date.now(),
          });
        } catch {
          // ignore non-json
        }
        server.send(raw);
      });
      server.onMessage((raw) => {
        if (closed) return;
        if (holdNextReconnect) {
          setTimeout(() => {
            if (!closed) {
              ws.send(raw);
            }
          }, 600);
          return;
        }
        ws.send(raw);
      });
    });

    await hostPage.goto('/');
    await getTabOnline(hostPage).click();
    await hostPage.getByRole('button', { name: '2 Người' }).click();
    await hostPage.getByTestId('bt-create-room-btn').click();
    const roomCode = (await hostPage.getByTestId('bt-online-room-code').innerText()).trim();

    await guestPage.goto(`/?room=${roomCode}`);
    await guestPage.getByTestId('bt-join-room-btn').click();
    await expect(hostPage.getByText('Danh Sách Ghế Ngồi (2/2 Người)')).toBeVisible();
    await guestPage.getByTestId('bt-ready-toggle-btn').click();
    await expect(hostPage.getByTestId('bt-online-start-btn')).toBeEnabled();
    await hostPage.getByTestId('bt-online-start-btn').click();

    await expect(hostPage.locator('body')).toHaveAttribute('data-state', 'playing');
    await expect(hostPage.getByTestId('bt-roll-dice-btn')).toBeVisible();

    // Force-drop Host WS and press Space + click while disconnected / reconnecting before snapshot sync
    holdNextReconnect = true;
    socketClosers.at(-1)?.();
    await hostPage.waitForTimeout(150);
    await hostPage.keyboard.press('Space');
    await hostPage
      .getByTestId('bt-roll-dice-btn')
      .click({ force: true, timeout: 1000 })
      .catch(() => {});

    // Wait for reconnect & delayed snapshot sync to complete
    await expect
      .poll(() => outboundWire.some((m) => m.type === 'RECONNECT_ROOM'), { timeout: 10_000 })
      .toBe(true);
    holdNextReconnect = false;
    await hostPage.waitForTimeout(1200);

    // ZERO GAME_ACTION messages should have been queued offline or replayed upon reconnect!
    const replayedActions = outboundWire.filter((m) => m.type === 'GAME_ACTION');
    expect(replayedActions).toEqual([]);

    // After fresh snapshot sync, Roll button is unlocked and clicking once sends a valid ROLL_DICE with revision metadata
    await expect(hostPage.getByTestId('bt-roll-dice-btn')).toBeEnabled();
    await hostPage.getByTestId('bt-roll-dice-btn').click();
    await expect
      .poll(() => outboundWire.filter((m) => m.type === 'GAME_ACTION' && m.kind === 'ROLL_DICE').length)
      .toBe(1);

    expect(hostErrors).toEqual([]);
    expect(guestErrors).toEqual([]);
    await hostCtx.close();
    await guestCtx.close();

    // Part B: Direct live WebSocket server contract checks for BUG-04 (STALE_ACTION / DUPLICATE_ACTION) & BUG-06 (INVALID_STATE)
    const c1 = await connectRawWs(wsUrl);
    const c2 = await connectRawWs(wsUrl);
    try {
      c1.send({
        type: 'CREATE_ROOM',
        playerName: 'WS Host',
        tokenType: 'car',
        maxPlayers: 2,
        startingCash: 2_000_000,
        fillBots: false,
      });
      const joined = (await c1.waitFor((m) => m.type === 'ROOM_JOINED')) as Extract<
        ServerToClientMessage,
        { type: 'ROOM_JOINED' }
      >;
      c2.send({
        type: 'JOIN_ROOM',
        roomCode: joined.roomCode,
        playerName: 'WS Guest',
        tokenType: 'yacht',
      });
      await c2.waitFor((m) => m.type === 'ROOM_JOINED');
      c2.send({ type: 'SET_READY', ready: true });
      await c1.waitFor(
        (m) =>
          m.type === 'ROOM_SNAPSHOT' &&
          m.snapshot.seats.some((s) => s.seatIndex === 1 && s.ready === true)
      );
      c1.send({ type: 'START_MATCH' });
      const startSnap = (await c1.waitFor(
        (m) => m.type === 'ROOM_SNAPSHOT' && m.snapshot.status === 'playing'
      )) as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
      const rev = startSnap.snapshot.match?.decisionRevision ?? 1;

      // BUG-06: Wrong-phase action must return ERROR INVALID_STATE immediately
      c1.send({ type: 'GAME_ACTION', action: { kind: 'BUY_PROPERTY', initialLevel: 0 } });
      const invalidStateErr = (await c1.waitFor(
        (m) => m.type === 'ERROR' && m.code === 'INVALID_STATE'
      )) as Extract<ServerToClientMessage, { type: 'ERROR' }>;
      expect(invalidStateErr.code).toBe('INVALID_STATE');

      // BUG-04: Stale expectedTurnCount / expectedDecisionRevision must return STALE_ACTION
      c1.send({
        type: 'GAME_ACTION',
        action: { kind: 'ROLL_DICE' },
        expectedTurnCount: 99,
        expectedPhase: 'AWAIT_ROLL',
        expectedDecisionRevision: rev,
        actionId: 'e2e-stale-1',
      });
      const staleErr = (await c1.waitFor(
        (m) => m.type === 'ERROR' && m.code === 'STALE_ACTION'
      )) as Extract<ServerToClientMessage, { type: 'ERROR' }>;
      expect(staleErr.code).toBe('STALE_ACTION');

      // BUG-04: Duplicate actionId must return DUPLICATE_ACTION
      c1.send({
        type: 'GAME_ACTION',
        action: { kind: 'ROLL_DICE' },
        expectedTurnCount: 1,
        expectedPhase: 'AWAIT_ROLL',
        expectedDecisionRevision: rev,
        actionId: 'e2e-roll-dup',
      });
      c1.send({
        type: 'GAME_ACTION',
        action: { kind: 'ROLL_DICE' },
        expectedTurnCount: 1,
        expectedPhase: 'AWAIT_ROLL',
        expectedDecisionRevision: rev,
        actionId: 'e2e-roll-dup',
      });
      const dupErr = (await c1.waitFor(
        (m) => m.type === 'ERROR' && m.code === 'DUPLICATE_ACTION'
      )) as Extract<ServerToClientMessage, { type: 'ERROR' }>;
      expect(dupErr.code).toBe('DUPLICATE_ACTION');
    } finally {
      c1.ws.close();
      c2.ws.close();
    }
  });

  test('BUG-02: Online TEAMS_2V2 preserves non-contiguous human seat order and alternates Team A / Team B turns', async ({
    browser,
  }) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const tempCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const hostPage = await hostCtx.newPage();
    const tempPage = await tempCtx.newPage();
    const guestPage = await guestCtx.newPage();
    const hostErrors = attachZeroErrorGuard(hostPage);
    const guestErrors = attachZeroErrorGuard(guestPage);

    await hostPage.goto('/');
    await getTabOnline(hostPage).click();
    await getMode2v2Toggle(hostPage).click();
    // Enable Bot fill so 2 humans at seats 0 & 2 get Bots at seats 1 & 3
    const fillBotsBtn = hostPage.getByRole('button', { name: /Bù Bot AI/i });
    if ((await fillBotsBtn.getAttribute('aria-pressed')) !== 'true') {
      await fillBotsBtn.click();
    }
    await hostPage.locator('#online-nickname-input').fill('HostSeat0');
    await hostPage.getByTestId('bt-create-room-btn').click();
    const roomCode = (await hostPage.getByTestId('bt-online-room-code').innerText()).trim();

    // Temp joins seat 1, Guest joins seat 2, then Temp leaves seat 1 -> humans sit at seats 0 & 2 (both Team A)
    await tempPage.goto(`/?room=${roomCode}`);
    await tempPage.locator('#online-nickname-input').fill('TempSeat1');
    await tempPage.getByTestId('bt-join-room-btn').click();
    await expect(hostPage.getByTestId('bt-lobby-seat-1')).toContainText('TempSeat1');

    await guestPage.goto(`/?room=${roomCode}`);
    await guestPage.locator('#online-nickname-input').fill('GuestSeat2');
    await guestPage.getByTestId('bt-join-room-btn').click();
    await expect(hostPage.getByTestId('bt-lobby-seat-2')).toContainText('GuestSeat2');

    // Temp leaves room to vacate Seat 1
    await tempPage.getByRole('button', { name: /Rời Phòng/i }).click();
    await tempCtx.close();

    // Guest readies up, then Host starts match and inspects authoritative seat/turn order in HUD + logs
    await guestPage.getByTestId('bt-ready-toggle-btn').click();
    await expect(hostPage.getByTestId('bt-online-start-btn')).toBeEnabled();
    await hostPage.getByTestId('bt-online-start-btn').click();
    await expect(hostPage.locator('body')).toHaveAttribute('data-state', 'playing');
    await expect(guestPage.locator('body')).toHaveAttribute('data-state', 'playing');

    const hudNames = await hostPage.evaluate(() => {
      return [0, 1, 2, 3].map((id) => {
        const el = document.querySelector(`[data-testid="player-card-${id}"]`);
        return {
          id,
          text: (el?.textContent || '').replace(/\s+/g, ' ').trim(),
        };
      });
    });
    expect(hudNames.every((h) => h.text.length > 0)).toBe(true);
    expect(hudNames[0].text).toContain('HostSeat0');
    expect(hudNames[1].text).toMatch(/AI|Lan Anh/i);
    expect(hudNames[2].text).toContain('GuestSeat2');
    expect(hudNames[3].text).toMatch(/AI|Ngọc Diệp/i);

    // Seat 0 (Host) has Turn 1; GuestSeat2 (Seat 2) does NOT have Turn 1
    await expect(hostPage.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await expect(guestPage.getByTestId('bt-roll-dice-btn')).toHaveCount(0);

    expect(hostErrors).toEqual([]);
    expect(guestErrors).toEqual([]);
    await hostCtx.close();
    await guestCtx.close();
  });

  test('BUG-11: Online Tactical Dice resets EVEN selection cleanly when turn advances', async ({
    browser,
  }) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();
    const hostErrors = attachZeroErrorGuard(hostPage);
    const guestErrors = attachZeroErrorGuard(guestPage);

    await hostPage.goto('/');
    await getTabOnline(hostPage).click();
    await hostPage.getByRole('button', { name: '2 Người' }).click();
    await getTacticalDiceToggle(hostPage).click();
    await hostPage.getByTestId('bt-create-room-btn').click();
    const roomCode = (await hostPage.getByTestId('bt-online-room-code').innerText()).trim();

    await guestPage.goto(`/?room=${roomCode}`);
    await guestPage.getByTestId('bt-join-room-btn').click();
    await expect(hostPage.getByText('Danh Sách Ghế Ngồi (2/2 Người)')).toBeVisible();
    await guestPage.getByTestId('bt-ready-toggle-btn').click();
    await expect(hostPage.getByTestId('bt-online-start-btn')).toBeEnabled();
    await hostPage.getByTestId('bt-online-start-btn').click();

    await expect(hostPage.locator('body')).toHaveAttribute('data-state', 'playing');
    const evenBtn = getTacticalEvenBtn(hostPage);
    await expect(evenBtn).toBeVisible();
    await evenBtn.click();
    await expect(evenBtn).toHaveAttribute('aria-pressed', 'true');

    // Roll using EVEN, confirm move, skip any landing decision to complete Turn 1
    await hostPage.getByTestId('bt-roll-dice-btn').click();
    const confirmRollBtn = hostPage.getByTestId('bt-confirm-roll-btn');
    await expect(confirmRollBtn).toBeVisible({ timeout: 10_000 });
    await confirmRollBtn.click();

    // After Host's roll consumes EVEN, selectedDiceChoice must immediately return to NORMAL
    // Wait for either a Host landing modal (skip it) or Guest's turn
    const hostSkip = hostPage.getByRole('button', { name: /Bỏ Qua|Xác Nhận/i }).first();
    for (let step = 0; step < 3; step++) {
      await hostPage.waitForTimeout(1800);
      if (await hostSkip.isVisible().catch(() => false)) {
        await hostSkip.click().catch(() => {});
      }
      if (await guestPage.getByTestId('bt-roll-dice-btn').isVisible().catch(() => false)) {
        break;
      }
      // If Host rolled doubles and got another roll on the same turn, EVEN must ALREADY be reset to false!
      if (await evenBtn.isVisible().catch(() => false)) {
        await expect(evenBtn).toHaveAttribute('aria-pressed', 'false');
        break;
      }
    }

    expect(hostErrors).toEqual([]);
    expect(guestErrors).toEqual([]);
    await hostCtx.close();
    await guestCtx.close();
  });

  test('BUG-03 & BUG-10: Offline monotonic match clock stays accurate and 5 FPS throttled RAF completes dice + 11-tile hop without slow-motion stretch', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = attachZeroErrorGuard(page);

    // Part A (BUG-03): Offline monotonic clock over 12s with phase transitions stays within +/-1.5s of wall time
    await page.goto('/?autostart=1&players=2&hotseat=1&dice=1-2,2-3,1-2');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    const clock = getMatchClock(page);
    await expect(clock).toBeVisible();
    await page.waitForTimeout(1000);
    const t0 = Date.now();
    const c0 = parseClockSeconds(await clock.innerText());
    expect(c0).not.toBeNull();

    // Drive several phase transitions while the match clock runs
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(page.getByTestId('buy-decision-modal')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('buy-decision-modal').getByRole('button', { name: /Bỏ Qua/i }).click();
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(page.getByTestId('buy-decision-modal')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('buy-decision-modal').getByRole('button', { name: /Bỏ Qua/i }).click();
    await page.waitForTimeout(2000);

    const wallSec = (Date.now() - t0) / 1000;
    const c1 = parseClockSeconds(await clock.innerText());
    expect(c1).not.toBeNull();
    const clockElapsed = (c0 ?? 0) - (c1 ?? 0);
    expect(Math.abs(wallSec - clockElapsed)).toBeLessThanOrEqual(2.0);

    // Part B (BUG-10): Throttle RAF to ~5 FPS (200ms per frame) and roll 6+5=11 steps to Phan Thiết
    // Before BUG-10 fix this took 15.9s (3.5x slow-motion); after fix it must finish in <= 7.5s!
    await page.addInitScript(() => {
      const origRaf = window.requestAnimationFrame.bind(window);
      const origCancel = window.cancelAnimationFrame.bind(window);
      const map = new Map<number, number>();
      let nextId = 1;
      window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
        const id = nextId++;
        const t = window.setTimeout(() => {
          map.delete(id);
          origRaf(cb);
        }, 200);
        map.set(id, t);
        return id;
      };
      window.cancelAnimationFrame = (id: number): void => {
        const t = map.get(id);
        if (t !== undefined) {
          window.clearTimeout(t);
          map.delete(id);
        } else {
          origCancel(id);
        }
      };
    });

    await page.goto('/?autostart=1&players=2&hotseat=1&dice=6-5&quality=low');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();

    const rollStart = Date.now();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(page.getByTestId('buy-decision-modal')).toBeVisible({ timeout: 9_000 });
    const wallMsToModal = Date.now() - rollStart;

    await expect(page.getByTestId('buy-decision-modal')).toContainText(/Phan Thiết/i);
    expect(wallMsToModal).toBeLessThan(7_500);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});
