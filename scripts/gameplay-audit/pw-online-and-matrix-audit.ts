// Reproducible Headed Chrome Online & Test-Matrix Audit Script.
// Verifies live end-to-end fixes across 5 scenarios:
//   1. BUG-04 & BUG-01 (stale action non-replay into Lost Island + single-turn AFK no takeover),
//   2. BUG-11 (tactical dice reset on Lost Island 1st click),
//   3. RulebookModal + Gemini API HTTP 500 fallback,
//   4. 4-Human Online sync (all 4 HUDs identical),
//   5. 700ms RTT + F5 reload mid-hop recovery.
// Usage: npx tsx scripts/gameplay-audit/pw-online-and-matrix-audit.ts
import { chromium } from '@playwright/test';
import type { OnlineRoomManager } from '../../src/server/roomManager';
import { createAppServer } from '../../src/server/appServer';

process.env.NODE_ENV = 'production';
process.env.GEMINI_API_KEY = '';

const PORT = 3212;
const BASE = `http://127.0.0.1:${PORT}`;

const WS_SPY_SCRIPT = `
(() => {
  const OrigWS = window.WebSocket;
  const spy = { sent: [], errors: [], sockets: [] };
  window.__wsSpy = spy;
  function SpyWS(url, protocols) {
    const ws = protocols !== undefined ? new OrigWS(url, protocols) : new OrigWS(url);
    if (String(url).includes('/ws')) {
      spy.sockets.push(ws);
      const origSend = ws.send.bind(ws);
      ws.send = function (data) {
        try {
          const parsed = JSON.parse(String(data));
          spy.sent.push({ t: Date.now(), ...parsed });
        } catch {}
        return origSend(data);
      };
      ws.addEventListener('message', function (evt) {
        try {
          const msg = JSON.parse(String(evt.data));
          if (msg.type === 'ERROR') spy.errors.push(msg);
        } catch {}
      });
    }
    return ws;
  }
  SpyWS.CONNECTING = 0;
  SpyWS.OPEN = 1;
  SpyWS.CLOSING = 2;
  SpyWS.CLOSED = 3;
  SpyWS.prototype = OrigWS.prototype;
  window.WebSocket = SpyWS;
})();
`;

interface InternalMatch {
  turnCount: number;
  activePlayerIndex: number;
  turnPhase: string;
  turnTimeLeft: number;
  matchTimeLeft: number;
  players: Array<{
    id: number;
    name: string;
    cash: number;
    position: number;
    inJail: boolean;
    jailTurns: number;
    isBot: boolean;
    onlineBotTakeover?: boolean;
  }>;
}

interface InternalRoom {
  roomCode: string;
  status: string;
  match: InternalMatch;
}

function getRoomsMap(manager: OnlineRoomManager): Map<string, InternalRoom> {
  return (manager as unknown as { rooms: Map<string, InternalRoom> }).rooms;
}

function clearAllRooms(manager: OnlineRoomManager): void {
  const internal = manager as unknown as {
    rooms: Map<string, InternalRoom>;
    clearRoomTimers: (room: InternalRoom) => void;
  };
  for (const room of internal.rooms.values()) {
    internal.clearRoomTimers(room);
  }
  internal.rooms.clear();
}

async function main(): Promise<void> {
  let scriptedDice: Array<[number, number]> = [];
  const origRandom = Math.random;
  // Note: OnlineRoomManager uses its constructor diceRng if provided, else Math.random;
  // we inject dice via appServer's roomManager or override via rooms hook.
  const appBundle = await createAppServer({ enableVite: false });
  const { httpServer, wsHandle } = appBundle;
  const manager = wsHandle.roomManager;

  // Patch manager's private diceRng so deterministic scenarios can queue exact rolls
  (manager as unknown as { diceRng: () => [number, number] }).diceRng = () => {
    if (scriptedDice.length > 0) {
      return scriptedDice.shift()!;
    }
    return [Math.floor(origRandom() * 6) + 1, Math.floor(origRandom() * 6) + 1];
  };

  await new Promise<void>((resolve) => {
    httpServer.listen(PORT, '127.0.0.1', () => resolve());
  });

  const browser = await chromium.launch({ headless: false, channel: 'chrome' });
  const out: Record<string, unknown> = {};

  try {
    // =========================================================================
    // 1. BUG-04 Live Repro Verification (formerly F4):
    //    Host drops WS on Turn 1, clicks Roll offline, server times out Turn 1
    //    into Lost Island (3+5=8), Guest finishes Turn 2 -> Turn 3 Host reconnects.
    //    Expected: ZERO stale ROLL_DICE replayed; Host stays Turn 3, jailTurns=0!
    // =========================================================================
    {
      scriptedDice = [
        [3, 5], // Turn 1 Host timeout roll -> Tile 8 (Lost Island!)
        [1, 2], // Turn 2 Guest roll -> Tile 3 (Đà Lạt)
        [2, 4], // Turn 3 Host intentional jail roll after reconnect
      ];
      const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await hostCtx.addInitScript({ content: WS_SPY_SCRIPT });
      const hostPage = await hostCtx.newPage();
      const guestPage = await guestCtx.newPage();

      let blockHostWs = false;
      const hostClosers: Array<() => void> = [];
      await hostPage.routeWebSocket(/\/ws/, (ws) => {
        if (blockHostWs) {
          ws.close();
          return;
        }
        const srv = ws.connectToServer();
        hostClosers.push(() => {
          ws.close();
          srv.close();
        });
        ws.onMessage((m) => srv.send(m));
        srv.onMessage((m) => ws.send(m));
      });

      await hostPage.goto(BASE);
      await hostPage.getByRole('tab', { name: /Chơi Online/i }).click();
      await hostPage.getByRole('button', { name: '2 Người' }).click();
      await hostPage.getByTestId('bt-create-room-btn').click();
      const roomCode = (await hostPage.getByTestId('bt-online-room-code').innerText()).trim();

      await guestPage.goto(`${BASE}/?room=${roomCode}`);
      await guestPage.getByTestId('bt-join-room-btn').click();
      await hostPage.getByText('Danh Sách Ghế Ngồi (2/2 Người)').waitFor({ state: 'visible' });
      await hostPage.getByTestId('bt-online-start-btn').click();
      await hostPage.waitForSelector('body[data-state="playing"]');

      // Drop Host WS and block reconnect while Host clicks Roll offline
      blockHostWs = true;
      hostClosers.at(-1)?.();
      await hostPage.waitForTimeout(200);
      await hostPage.keyboard.press('Space');
      await hostPage.getByTestId('bt-roll-dice-btn').click({ force: true, timeout: 1000 }).catch(() => {});

      // Advance server Turn 1 timeout -> Host lands in Lost Island (Turn 2 begins for Guest)
      const room = getRoomsMap(manager).get(roomCode)!;
      room.match.turnTimeLeft = 1;
      manager.tickOneSecond();
      await hostPage.waitForTimeout(4500);
      const hostAfterTurn1 = {
        turnCount: room.match.turnCount,
        position: room.match.players[0].position,
        inJail: room.match.players[0].inJail,
        isBot: room.match.players[0].isBot, // BUG-01: must STILL be false after 1 missed turn!
      };

      // Guest completes Turn 2 -> returns to Turn 3 (Host in Lost Island, AWAIT_ROLL)
      await guestPage.getByTestId('bt-roll-dice-btn').waitFor({ state: 'visible', timeout: 8000 });
      await guestPage.getByTestId('bt-roll-dice-btn').click();
      await guestPage.getByTestId('buy-decision-modal').waitFor({ state: 'visible', timeout: 8000 });
      await guestPage.getByTestId('buy-decision-modal').getByRole('button', { name: /Bỏ Qua/i }).click();
      await hostPage.waitForTimeout(500);

      const beforeReconnect = {
        turnCount: room.match.turnCount,
        activePlayerIndex: room.match.activePlayerIndex,
        turnPhase: room.match.turnPhase,
        hostInJail: room.match.players[0].inJail,
        hostJailTurns: room.match.players[0].jailTurns,
      };

      // Unblock Host WS -> let client auto-reconnect and sync fresh Turn 3 snapshot
      blockHostWs = false;
      await hostPage.waitForTimeout(4500);

      const afterReconnect = {
        turnCount: room.match.turnCount,
        activePlayerIndex: room.match.activePlayerIndex,
        turnPhase: room.match.turnPhase,
        hostInJail: room.match.players[0].inJail,
        hostJailTurns: room.match.players[0].jailTurns,
      };

      const sentWire = await hostPage.evaluate(() => {
        const spy = (window as unknown as { __wsSpy?: { sent: Array<{ type: string; action?: { kind?: string } }> } }).__wsSpy;
        return (spy?.sent || []).map((m) => ({ type: m.type, kind: m.action?.kind }));
      });

      out.bug04And01LiveCheck = {
        roomCode,
        hostAfterTurn1,
        beforeReconnect,
        afterReconnect,
        staleActionReplayed: afterReconnect.turnCount !== 3 || afterReconnect.hostJailTurns !== 0,
        bug01SingleTurnNoPrematureBotTakeover: hostAfterTurn1.isBot === false,
        sentWire,
      };

      await hostCtx.close();
      await guestCtx.close();
      clearAllRooms(manager);
    }

    // =========================================================================
    // 2. BUG-11 Live Repro Verification (formerly F8):
    //    Tactical Dice ON -> Host clicks EVEN -> Turn 1 times out into Lost Island
    //    (3+5=8) -> Guest plays Turn 2 -> Turn 3 Host clicks bt-jail-roll-btn ONCE.
    //    Expected: sends diceChoice:'NORMAL', 0 server ERRORs, leaves AWAIT_ROLL on 1st click!
    // =========================================================================
    {
      scriptedDice = [
        [3, 5], // Turn 1 timeout roll -> 8 (Lost Island)
        [1, 2], // Turn 2 Guest roll
        [2, 4], // Turn 3 Host jail roll
      ];
      const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await hostCtx.addInitScript({ content: WS_SPY_SCRIPT });
      const hostPage = await hostCtx.newPage();
      const guestPage = await guestCtx.newPage();

      await hostPage.goto(BASE);
      await hostPage.getByRole('tab', { name: /Chơi Online/i }).click();
      await hostPage.getByRole('button', { name: '2 Người' }).click();
      await hostPage.getByRole('button', { name: /Xúc Xắc Chiến Thuật|Chẵn \/ Lẻ/i }).click();
      await hostPage.getByTestId('bt-create-room-btn').click();
      const roomCode = (await hostPage.getByTestId('bt-online-room-code').innerText()).trim();

      await guestPage.goto(`${BASE}/?room=${roomCode}`);
      await guestPage.getByTestId('bt-join-room-btn').click();
      await hostPage.getByText('Danh Sách Ghế Ngồi (2/2 Người)').waitFor({ state: 'visible' });
      await hostPage.getByTestId('bt-online-start-btn').click();
      await hostPage.waitForSelector('body[data-state="playing"]');

      // Host selects EVEN, then lets Turn 1 AWAIT_ROLL time out (auto-roll 3+5=8)
      await hostPage.getByTestId('bt-dice-even-btn').click();
      const evenPressedBefore = await hostPage.getByTestId('bt-dice-even-btn').getAttribute('aria-pressed');
      const room = getRoomsMap(manager).get(roomCode)!;
      room.match.turnTimeLeft = 1;
      manager.tickOneSecond();

      await hostPage.getByTestId('bt-confirm-roll-btn').waitFor({ state: 'visible', timeout: 8000 });
      await hostPage.getByTestId('bt-confirm-roll-btn').click();

      // Guest finishes Turn 2
      await guestPage.getByTestId('bt-roll-dice-btn').waitFor({ state: 'visible', timeout: 10_000 });
      await guestPage.getByTestId('bt-roll-dice-btn').click();
      await guestPage.getByTestId('bt-confirm-roll-btn').waitFor({ state: 'visible', timeout: 8000 });
      await guestPage.getByTestId('bt-confirm-roll-btn').click();
      await guestPage.getByTestId('buy-decision-modal').waitFor({ state: 'visible', timeout: 8000 });
      await guestPage.getByTestId('buy-decision-modal').getByRole('button', { name: /Bỏ Qua/i }).click();

      // Turn 3: Host in Lost Island -> click bt-jail-roll-btn ONCE!
      await hostPage.getByTestId('bt-jail-roll-btn').waitFor({ state: 'visible', timeout: 8000 });
      const evenVisibleInJail = await hostPage.getByTestId('bt-dice-even-btn').isVisible().catch(() => false);
      await hostPage.getByTestId('bt-jail-roll-btn').click();
      await hostPage.waitForTimeout(800);

      const phaseAfterFirstClick = room.match.turnPhase;
      const spyData = await hostPage.evaluate(() => {
        const spy = (window as unknown as {
          __wsSpy?: {
            sent: Array<{ type: string; action?: Record<string, unknown> }>;
            errors: Array<{ code: string; message: string }>;
          };
        }).__wsSpy;
        return {
          gameActions: (spy?.sent || []).filter((m) => m.type === 'GAME_ACTION').map((m) => m.action),
          errors: spy?.errors || [],
        };
      });

      out.bug11LiveCheck = {
        roomCode,
        evenPressedBefore,
        evenVisibleInJail,
        gameActionsSent: spyData.gameActions,
        serverErrors: spyData.errors,
        phaseAfterFirstClick,
        succeededOnFirstClick:
          spyData.errors.length === 0 &&
          phaseAfterFirstClick !== 'AWAIT_ROLL' &&
          spyData.gameActions.some((a) => a?.kind === 'ROLL_DICE' && a?.diceChoice === 'NORMAL'),
      };

      await hostCtx.close();
      await guestCtx.close();
      clearAllRooms(manager);
    }

    // =========================================================================
    // 3. F7: RulebookModal + GEMINI_API_KEY="" + Forced HTTP 500 fallback
    // =========================================================================
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();
      const errors: string[] = [];
      let forced500Count = 0;
      page.on('pageerror', (e) => errors.push(e.message));

      let intercept500 = false;
      await page.route('**/api/bot-quip', async (route) => {
        if (intercept500) {
          forced500Count += 1;
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Simulated Gemini 500' }),
          });
          return;
        }
        await route.continue();
      });

      await page.goto(`${BASE}/?autostart=1&players=4&dice=1-2,2-3,3-4,1-4&quality=low`);
      await page.waitForSelector('body[data-state="playing"]');

      // Open RulebookModal via Settings popover -> Luật Chơi
      await page.getByTestId('bt-btn-settings').click();
      await page.getByTestId('bt-settings-popover').getByRole('button', { name: 'Luật Chơi' }).click();
      await page.getByTestId('rulebook-modal').waitFor({ state: 'visible', timeout: 5000 });
      const rulebookTitle = await page.getByTestId('rulebook-modal').locator('h2').first().innerText();
      await page.keyboard.press('Escape');

      // Human takes Turn 1 (skips), then enable forced HTTP 500 for Bots 1..3
      intercept500 = true;
      await page.getByTestId('bt-roll-dice-btn').click();
      await page.getByTestId('buy-decision-modal').waitFor({ state: 'visible', timeout: 10_000 });
      await page.getByTestId('buy-decision-modal').getByRole('button', { name: /Bỏ Qua/i }).click();

      // Wait for all 3 Bots to finish turns even with HTTP 500 on /api/bot-quip
      await page.getByTestId('bt-roll-dice-btn').waitFor({ state: 'visible', timeout: 45_000 });
      out.gemini500AndRulebook = {
        rulebookTitle,
        forced500Count,
        turnReturnedToHumanCleanly: await page.getByTestId('bt-roll-dice-btn').isVisible(),
        pageErrors: errors,
      };
      await ctx.close();
    }

    // =========================================================================
    // 4. F1 + D6: 4-Human Online Sync + Emote + Identical HUD
    // =========================================================================
    {
      scriptedDice = [
        [1, 2],
        [1, 2],
        [2, 3],
        [3, 4],
      ];
      const ctxs = await Promise.all(
        Array.from({ length: 4 }, () => browser.newContext({ viewport: { width: 1280, height: 800 } }))
      );
      const pages = await Promise.all(ctxs.map((c) => c.newPage()));
      const consoleErrors = pages.map(() => [] as string[]);
      pages.forEach((p, idx) => {
        p.on('pageerror', (e) => consoleErrors[idx].push(e.message));
        p.on('console', (m) => {
          if (m.type() === 'error') consoleErrors[idx].push(m.text());
        });
      });

      await pages[0].goto(BASE);
      await pages[0].getByRole('tab', { name: /Chơi Online/i }).click();
      await pages[0].getByTestId('bt-create-room-btn').click();
      const roomCode = (await pages[0].getByTestId('bt-online-room-code').innerText()).trim();

      for (let i = 1; i < 4; i++) {
        await pages[i].goto(`${BASE}/?room=${roomCode}`);
        await pages[i].getByTestId('bt-join-room-btn').click();
      }
      await pages[0].getByText('Danh Sách Ghế Ngồi (4/4 Người)').waitFor({ state: 'visible' });
      await pages[0].getByTestId('bt-online-start-btn').click();
      await Promise.all(pages.map((p) => p.waitForSelector('body[data-state="playing"]')));

      // P0 rolls & buys tile 3; P1 rolls & pays rent on tile 3
      await pages[0].getByTestId('bt-roll-dice-btn').click();
      await pages[0].getByTestId('buy-decision-modal').waitFor({ state: 'visible', timeout: 10_000 });
      await pages[0].getByTestId('buy-decision-modal').getByRole('button', { name: /Mua Ngay/i }).first().click();

      await pages[1].getByTestId('bt-roll-dice-btn').waitFor({ state: 'visible', timeout: 10_000 });
      await pages[1].getByTestId('bt-roll-dice-btn').click();
      // Wait for rent + possible buyout modal
      await pages[1].waitForTimeout(3500);
      const skipBuyout = pages[1].getByRole('button', { name: /Bỏ Qua/i }).first();
      if (await skipBuyout.isVisible().catch(() => false)) {
        await skipBuyout.click();
      }
      await pages[2].getByTestId('bt-roll-dice-btn').waitFor({ state: 'visible', timeout: 10_000 });
      await pages[2].waitForTimeout(1000);

      const hudSnapshots = await Promise.all(
        pages.map((p) =>
          p.evaluate(() =>
            [0, 1, 2, 3]
              .map((id) =>
                (document.querySelector(`[data-testid="player-card-${id}"]`)?.textContent || '')
                  .replace(/BẠN/g, '')
                  .replace(/[+-]\d[\d\s.,]*[KM]?/g, '')
                  .replace(/\s+/g, ' ')
                  .trim()
              )
              .join(' || ')
          )
        )
      );

      const all4HudIdentical = hudSnapshots.every((s) => s === hudSnapshots[0] && s.length > 0);
      out.online4HumansSync = {
        roomCode,
        all4HudIdentical,
        hudSample: hudSnapshots[0],
        ...(all4HudIdentical ? {} : { hudSnapshots }),
        consoleErrors,
      };
      await Promise.all(ctxs.map((c) => c.close()));
      clearAllRooms(manager);
    }

    // =========================================================================
    // 5. F3: 700ms RTT + Mid-Hop Reload Recovery
    // =========================================================================
    {
      scriptedDice = [[5, 6]]; // 11 -> Phan Thiết
      const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const hostPage = await hostCtx.newPage();
      const guestPage = await guestCtx.newPage();
      const hostErrors: string[] = [];
      hostPage.on('pageerror', (e) => hostErrors.push(e.message));

      // Inject 350ms one-way (700ms RTT) latency on Host WS
      await hostPage.routeWebSocket(/\/ws/, (ws) => {
        const srv = ws.connectToServer();
        ws.onMessage((m) => setTimeout(() => srv.send(m), 350));
        srv.onMessage((m) => setTimeout(() => ws.send(m), 350));
      });

      await hostPage.goto(BASE);
      await hostPage.getByRole('tab', { name: /Chơi Online/i }).click();
      await hostPage.getByRole('button', { name: '2 Người' }).click();
      await hostPage.getByTestId('bt-create-room-btn').click();
      const roomCode = (await hostPage.getByTestId('bt-online-room-code').innerText()).trim();

      await guestPage.goto(`${BASE}/?room=${roomCode}`);
      await guestPage.getByTestId('bt-join-room-btn').click();
      await hostPage.getByText('Danh Sách Ghế Ngồi (2/2 Người)').waitFor({ state: 'visible' });
      await hostPage.getByTestId('bt-online-start-btn').click();
      await hostPage.waitForSelector('body[data-state="playing"]');

      // Roll under 700ms RTT, then F5 reload mid-hop!
      await hostPage.getByTestId('bt-roll-dice-btn').click();
      await hostPage.waitForTimeout(2200);
      await hostPage.reload();
      await hostPage.getByTestId('buy-decision-modal').waitFor({ state: 'visible', timeout: 12_000 });
      const modalText = await hostPage.getByTestId('buy-decision-modal').innerText();

      out.rtt700AndReload = {
        roomCode,
        recoveredPhanThietModal: /Phan Thiết/i.test(modalText),
        hostErrors,
      };
      await hostCtx.close();
      await guestCtx.close();
    }

    console.log(JSON.stringify(out, null, 2));
  } finally {
    await browser.close();
    await appBundle.close();
  }
}

void main();
