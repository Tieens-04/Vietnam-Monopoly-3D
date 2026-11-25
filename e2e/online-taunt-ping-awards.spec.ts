import fs from 'node:fs';
import { expect, Page, test } from '@playwright/test';
import type {
  ClientToServerMessage,
  OnlineRoomSnapshot,
  PostMatchAward,
  SeriesStandingEntry,
  ServerToClientMessage,
} from '../src/game/onlineTypes';
import {
  assertWithinViewport,
  attachZeroErrorGuard,
  getMode2v2Toggle,
  getTabOnline,
  getTileScreenPoint,
} from './helpers';

const CANDIDATE_INSPECT_TILES = [5, 6, 7, 11, 13, 19, 21, 27, 3];

async function openUnobstructedTileInspector(page: Page): Promise<number> {
  const viewport = page.viewportSize() ?? { width: 1280, height: 800 };
  for (const tileIdx of CANDIDATE_INSPECT_TILES) {
    const pt = await getTileScreenPoint(page, tileIdx);
    if (!pt) continue;
    if (
      pt.x < 40 ||
      pt.x > viewport.width - 40 ||
      pt.y < 40 ||
      pt.y > viewport.height - 40
    ) {
      continue;
    }
    const hitsCanvas = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.tagName === 'CANVAS',
      pt
    );
    if (!hitsCanvas) continue;

    await page.mouse.click(pt.x, pt.y);
    const inspector = page.getByTestId('tile-inspector-card');
    try {
      await inspector.waitFor({ state: 'visible', timeout: 1500 });
      return tileIdx;
    } catch {
      // Try next tile if click missed raycast bounds
    }
  }
  throw new Error('Could not open TileInspectorCard on any candidate unobstructed tile');
}

function assertPngDimensions(filePath: string, expectedW: number, expectedH: number): void {
  const buf = fs.readFileSync(filePath);
  expect(buf.length, 'Downloaded PNG file must not be empty').toBeGreaterThan(24);
  // PNG 8-byte signature: 89 50 4E 47 0D 0A 1A 0A
  expect(buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
    true
  );
  // IHDR chunk tag at bytes 12..15, width uint32BE at 16..19, height uint32BE at 20..23
  expect(buf.subarray(12, 16).toString('ascii')).toBe('IHDR');
  expect(buf.readUInt32BE(16)).toBe(expectedW);
  expect(buf.readUInt32BE(20)).toBe(expectedH);
}

interface ProxiedClientSocket {
  latestSnapshotMsg: Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }> | null;
  pushMessage: (msg: ServerToClientMessage) => void;
}

test.describe('Phase 3 Online Board Taunts, Public Tile Pings, Post-Match Awards, Series Leaderboard & 1200x675 PNG Export', () => {
  test('Live 2v2 room: 3D board taunts + 4s cooldown, bt-disable-3d-taunts-toggle persistence, and public tile pings across Host, Opponent & Spectator', async ({
    browser,
  }) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const specCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });

    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();
    const specPage = await specCtx.newPage();

    const hostErrors = attachZeroErrorGuard(hostPage);
    const guestErrors = attachZeroErrorGuard(guestPage);
    const specErrors = attachZeroErrorGuard(specPage);

    try {
      // 1. Host creates TEAMS_2V2 room (Host = P0 Team A, Guest = P1 Team B opponent)
      await hostPage.goto('/');
      await getTabOnline(hostPage).click();
      await getMode2v2Toggle(hostPage).click();
      await hostPage.locator('#online-nickname-input').fill('ChuPhongA');
      await hostPage.getByTestId('bt-create-room-btn').click();

      const roomCodeEl = hostPage.getByTestId('bt-online-room-code');
      await expect(roomCodeEl).toBeVisible();
      const roomCode = (await roomCodeEl.innerText()).trim();

      // 2. Guest joins (Seat 1, Team B), readies up, Host starts match
      await guestPage.goto(`/?room=${roomCode}`);
      await guestPage.locator('#online-nickname-input').fill('DoiThuB');
      await guestPage.getByTestId('bt-join-room-btn').click();
      await expect(hostPage.getByText('Danh Sách Ghế Ngồi (2/4 Người)')).toBeVisible();

      await guestPage.getByTestId('bt-ready-toggle-btn').click();
      await expect(hostPage.getByTestId('bt-online-start-btn')).toBeEnabled();
      await hostPage.getByTestId('bt-online-start-btn').click();

      await expect(hostPage.locator('body')).toHaveAttribute('data-state', 'playing');
      await expect(guestPage.locator('body')).toHaveAttribute('data-state', 'playing');
      await expect(hostPage.locator('canvas[data-rendered-frames]')).toBeVisible();
      await expect(guestPage.locator('canvas[data-rendered-frames]')).toBeVisible();

      // 3. Spectator joins mid-match -> enters live 3D board directly
      await specPage.goto(`/?room=${roomCode}`);
      await specPage.locator('#online-nickname-input').fill('KhanGiaC');
      await specPage.getByTestId('bt-join-room-btn').click();
      await expect(specPage.locator('body')).toHaveAttribute('data-state', 'playing');
      await expect(specPage.getByTestId('bt-spectator-status-bar')).toBeVisible();
      await expect(specPage.locator('canvas[data-rendered-frames]')).toBeVisible();

      // Self cannot taunt self; Spectator cannot taunt anyone
      await expect(hostPage.getByTestId('bt-taunt-trigger-p0')).toHaveCount(0);
      await expect(specPage.locator('[data-testid^="bt-taunt-trigger-"]')).toHaveCount(0);

      // 4. Host sends Board Taunt 🩴 Dép tổ ong to Guest (P1) -> enters 4s cooldown
      const tauntTriggerP1 = hostPage.getByTestId('bt-taunt-trigger-p1');
      await expect(tauntTriggerP1).toBeVisible();
      await expect(tauntTriggerP1).toBeEnabled();
      await tauntTriggerP1.click();

      const tauntPopoverP1 = hostPage.getByTestId('bt-taunt-popover-p1');
      await expect(tauntPopoverP1).toBeVisible();
      await hostPage.getByTestId('bt-taunt-option-p1-slipper').click();
      await expect(tauntPopoverP1).toHaveCount(0);

      // Cooldown active (~4s)
      await expect(tauntTriggerP1).toBeDisabled();
      await expect(tauntTriggerP1).toContainText(/\d+s/);

      // 5. Host toggles "Tắt hiệu ứng ném đồ 3D" in Settings -> persists to localStorage across reload
      await hostPage.getByTestId('bt-btn-settings').click();
      const settingsPopover = hostPage.getByTestId('bt-settings-popover');
      await expect(settingsPopover).toBeVisible();

      const disableTauntsToggle = hostPage.getByTestId('bt-disable-3d-taunts-toggle');
      await expect(disableTauntsToggle).toBeVisible();
      await expect(disableTauntsToggle).toHaveAttribute('aria-pressed', 'false');
      await disableTauntsToggle.click();
      await expect(disableTauntsToggle).toHaveAttribute('aria-pressed', 'true');

      const storedPref = await hostPage.evaluate(() =>
        window.localStorage.getItem('bt_disable_3d_taunts_v1')
      );
      expect(storedPref).toBe('true');

      await hostPage.getByRole('button', { name: 'Đóng cài đặt' }).click();

      // Reload Host -> auto-reconnects to playing match and retains bt-disable-3d-taunts-toggle=true
      await hostPage.reload();
      await expect(hostPage.locator('body')).toHaveAttribute('data-state', 'playing');
      await expect(hostPage.locator('canvas[data-rendered-frames]')).toBeVisible();

      await hostPage.getByTestId('bt-btn-settings').click();
      await expect(hostPage.getByTestId('bt-disable-3d-taunts-toggle')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await hostPage.getByRole('button', { name: 'Đóng cài đặt' }).click();

      // Wait for 4s taunt cooldown to expire & verify Host can taunt again while local 3D taunts are disabled
      await expect(hostPage.getByTestId('bt-taunt-trigger-p1')).toBeEnabled({ timeout: 7000 });
      await hostPage.getByTestId('bt-taunt-trigger-p1').click();
      await hostPage.getByTestId('bt-taunt-option-p1-tomato').click();
      await expect(hostPage.getByTestId('bt-taunt-trigger-p1')).toBeDisabled();

      // 6. Host opens TileInspectorCard on an unobstructed tile and sends public 🎯 Nhắm ô này ping
      const hostPingTileIdx = await openUnobstructedTileInspector(hostPage);
      const pingTargetBtn = hostPage.getByTestId('bt-tile-ping-TARGET');
      await expect(pingTargetBtn).toBeVisible();
      await expect(pingTargetBtn).toBeEnabled();
      await pingTargetBtn.click();

      // Enters 2.5s cooldown on Host inspector
      await expect(pingTargetBtn).toBeDisabled();

      // Public ping label is visible on Host, Opponent Guest (Team B!), AND Spectator!
      const hostPingLabel = hostPage.getByTestId(`bt-tile-ping-label-${hostPingTileIdx}`);
      const guestPingLabel = guestPage.getByTestId(`bt-tile-ping-label-${hostPingTileIdx}`);
      const specPingLabel = specPage.getByTestId(`bt-tile-ping-label-${hostPingTileIdx}`);

      await expect(hostPingLabel).toBeVisible();
      await expect(hostPingLabel).toContainText('ChuPhongA');
      await expect(guestPingLabel).toBeVisible();
      await expect(guestPingLabel).toContainText('ChuPhongA');
      await expect(specPingLabel).toBeVisible();
      await expect(specPingLabel).toContainText('ChuPhongA');

      // Cooldown lifts after ~2.5s
      await expect(pingTargetBtn).toBeEnabled({ timeout: 5000 });
      await hostPage.getByRole('button', { name: 'Đóng thông tin ô đất' }).click();

      // 7. Spectator can also open TileInspectorCard and broadcast public ⚠️ Coi chừng ping
      const specPingTileIdx = await openUnobstructedTileInspector(specPage);
      await specPage.getByTestId('bt-tile-ping-DANGER').click();
      await expect(hostPage.getByTestId(`bt-tile-ping-label-${specPingTileIdx}`)).toBeVisible();
      await expect(guestPage.getByTestId(`bt-tile-ping-label-${specPingTileIdx}`)).toBeVisible();
      await expect(specPage.getByTestId(`bt-tile-ping-label-${specPingTileIdx}`)).toBeVisible();

      expect(hostErrors).toEqual([]);
      expect(guestErrors).toEqual([]);
      expect(specErrors).toEqual([]);
    } finally {
      await hostCtx.close();
      await guestCtx.close();
      await specCtx.close();
    }
  });

  test('VictoryModal Awards, Series Leaderboard, Pure Canvas 1200x675 PNG Export & Clipboard Fallback, Mobile 390x844, Rematch Lobby & Host-only RESET_SERIES_SCORE', async ({
    browser,
  }) => {
    const hostCtx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      acceptDownloads: true,
    });
    const guestCtx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      acceptDownloads: true,
    });
    const specCtx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      acceptDownloads: true,
    });

    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();
    const specPage = await specCtx.newPage();

    const hostErrors = attachZeroErrorGuard(hostPage);
    const guestErrors = attachZeroErrorGuard(guestPage);
    const specErrors = attachZeroErrorGuard(specPage);

    let injectedPhase = false;
    const outboundHostMsgs: ClientToServerMessage[] = [];
    const proxiedClients: Partial<Record<'host' | 'guest' | 'spec', ProxiedClientSocket>> = {};

    let activeAwards: PostMatchAward[] = [];
    let activeSeriesStandings: SeriesStandingEntry[] = [];

    const buildGameOverSnapshot = (baseSnap: OnlineRoomSnapshot): OnlineRoomSnapshot => {
      const cloned = structuredClone(baseSnap);
      cloned.status = 'gameover';
      cloned.seriesStandings = structuredClone(activeSeriesStandings);
      if (cloned.match) {
        const p0 = cloned.match.players[0];
        cloned.match.turnPhase = 'GAME_OVER';
        cloned.match.matchWinnerResult = {
          winner: p0,
          condition: 'RESORT_MONOPOLY',
          label: 'Độc quyền toàn bộ 4 khu nghỉ dưỡng!',
        };
        cloned.match.postMatchAwards = structuredClone(activeAwards);
      }
      return cloned;
    };

    const buildLobbyRematchSnapshot = (
      baseSnap: OnlineRoomSnapshot,
      standings: SeriesStandingEntry[]
    ): OnlineRoomSnapshot => {
      const cloned = structuredClone(baseSnap);
      cloned.status = 'lobby';
      cloned.match = null;
      cloned.seriesStandings = structuredClone(standings);
      cloned.seats = cloned.seats.map((seat) => ({
        ...seat,
        ready: seat.occupiedByHuman ? seat.isHost : false,
      }));
      return cloned;
    };

    const broadcastInjectedState = (kind: 'gameover' | 'lobby', standings: SeriesStandingEntry[]) => {
      for (const role of ['host', 'guest', 'spec'] as const) {
        const client = proxiedClients[role];
        if (!client?.latestSnapshotMsg) continue;
        const nextSnap =
          kind === 'gameover'
            ? buildGameOverSnapshot(client.latestSnapshotMsg.snapshot)
            : buildLobbyRematchSnapshot(client.latestSnapshotMsg.snapshot, standings);
        client.pushMessage({
          ...client.latestSnapshotMsg,
          snapshot: nextSnap,
        });
      }
    };

    const attachWsProxy = async (
      page: Page,
      role: 'host' | 'guest' | 'spec'
    ): Promise<void> => {
      await page.routeWebSocket(/\/ws/, (ws) => {
        let closed = false;
        const server = ws.connectToServer();
        const record: ProxiedClientSocket = {
          latestSnapshotMsg: null,
          pushMessage: (msg) => {
            if (!closed) {
              ws.send(JSON.stringify(msg));
            }
          },
        };
        proxiedClients[role] = record;

        ws.onClose(() => {
          closed = true;
        });
        server.onClose(() => {
          closed = true;
        });

        ws.onMessage((raw) => {
          if (closed) return;
          try {
            const parsed = JSON.parse(String(raw)) as ClientToServerMessage;
            if (role === 'host') {
              outboundHostMsgs.push(parsed);
            }
            if (injectedPhase && role === 'host' && parsed.type === 'RETURN_TO_LOBBY') {
              broadcastInjectedState('lobby', activeSeriesStandings);
              return;
            }
            if (injectedPhase && role === 'host' && parsed.type === 'RESET_SERIES_SCORE') {
              activeSeriesStandings = [];
              broadcastInjectedState('lobby', []);
              return;
            }
          } catch {
            // ignore non-JSON
          }
          server.send(raw);
        });

        server.onMessage((raw) => {
          if (closed) return;
          try {
            const msg = JSON.parse(String(raw)) as ServerToClientMessage;
            if (msg.type === 'ROOM_JOINED') {
              record.latestSnapshotMsg = {
                type: 'ROOM_SNAPSHOT',
                yourParticipantId: msg.yourParticipantId,
                yourSeatIndex: msg.yourSeatIndex,
                yourPlayerId: msg.yourPlayerId,
                snapshot: msg.snapshot,
              };
            } else if (msg.type === 'ROOM_SNAPSHOT') {
              record.latestSnapshotMsg = msg;
            }
            if (injectedPhase && (msg.type === 'ROOM_SNAPSHOT' || msg.type === 'GAME_EVENT')) {
              return;
            }
          } catch {
            // ignore
          }
          ws.send(raw);
        });
      });
    };

    await attachWsProxy(hostPage, 'host');
    await attachWsProxy(guestPage, 'guest');
    await attachWsProxy(specPage, 'spec');

    try {
      // 1. Host creates 2-player FFA room (fillBots=false), Guest joins & readies, Host starts match, Spectator joins
      await hostPage.goto('/');
      await getTabOnline(hostPage).click();
      await hostPage.getByRole('button', { name: '2 Người' }).click();
      const fillBotsBtn = hostPage.getByRole('button', { name: /Bù Bot AI nếu thiếu người/i });
      if ((await fillBotsBtn.getAttribute('aria-pressed')) === 'true') {
        await fillBotsBtn.click();
      }
      await hostPage.locator('#online-nickname-input').fill('MinhAnh');
      await hostPage.getByTestId('bt-create-room-btn').click();
      const roomCode = (await hostPage.getByTestId('bt-online-room-code').innerText()).trim();

      await guestPage.goto(`/?room=${roomCode}`);
      await guestPage.locator('#online-nickname-input').fill('BaoLong');
      await guestPage.getByTestId('bt-join-room-btn').click();
      await expect(hostPage.getByText('Danh Sách Ghế Ngồi (2/2 Người)')).toBeVisible();
      await guestPage.getByTestId('bt-ready-toggle-btn').click();
      await expect(hostPage.getByTestId('bt-online-start-btn')).toBeEnabled();
      await hostPage.getByTestId('bt-online-start-btn').click();

      await expect(hostPage.locator('body')).toHaveAttribute('data-state', 'playing');
      await expect(guestPage.locator('body')).toHaveAttribute('data-state', 'playing');

      await specPage.goto(`/?room=${roomCode}`);
      await specPage.locator('#online-nickname-input').fill('KhanGia');
      await specPage.getByTestId('bt-join-room-btn').click();
      await expect(specPage.locator('body')).toHaveAttribute('data-state', 'playing');
      await expect(specPage.getByTestId('bt-spectator-status-bar')).toBeVisible();

      // Wait until all 3 proxied clients have their live playing snapshot with participantIds
      await expect
        .poll(
          () =>
            Boolean(
              proxiedClients.host?.latestSnapshotMsg?.snapshot.match &&
                proxiedClients.guest?.latestSnapshotMsg?.snapshot.match &&
                proxiedClients.spec?.latestSnapshotMsg?.snapshot.match
            ),
          { timeout: 10_000 }
        )
        .toBe(true);

      const hostPid = proxiedClients.host!.latestSnapshotMsg!.yourParticipantId;
      const guestPid = proxiedClients.guest!.latestSnapshotMsg!.yourParticipantId;

      activeAwards = [
        {
          id: 'CHUA_DAO_HOANG',
          icon: '🏝️',
          title: 'Chúa Đảo Hoang',
          subtitle: 'Ghé thăm Đảo Hoang nhiều nhất trận',
          playerId: 1,
          playerName: 'BaoLong',
          playerColor: '#66C61C',
          valueLabel: '3 lần ra đảo',
        },
        {
          id: 'TRUM_THU_HO',
          icon: '💰',
          title: 'Trùm Thu Họ',
          subtitle: 'Cú thu tiền thuê một lượt cao nhất',
          playerId: 0,
          playerName: 'MinhAnh',
          playerColor: '#F5B800',
          valueLabel: '640K',
        },
        {
          id: 'THANH_PHA_HOAI',
          icon: '💣',
          title: 'Thánh Phá Hoại',
          subtitle: 'Tích cực mua đứt và tung thẻ công kích',
          playerId: 0,
          playerName: 'MinhAnh',
          playerColor: '#F5B800',
          valueLabel: '2 pha công kích',
        },
        {
          id: 'NHA_TAI_TRO_VANG',
          icon: '💸',
          title: 'Nhà Tài Trợ Vàng',
          subtitle: 'Đóng góp tiền thuê nhiều nhất cả bàn',
          playerId: 1,
          playerName: 'BaoLong',
          playerColor: '#66C61C',
          valueLabel: '920K',
        },
      ];

      // Intentionally place BaoLong (3 pts) before MinhAnh (4 pts) to verify UI descending sort
      activeSeriesStandings = [
        {
          participantId: guestPid,
          playerName: 'BaoLong',
          tokenType: 'yacht',
          wins: 0,
          matchesPlayed: 1,
          seriesPoints: 3,
        },
        {
          participantId: hostPid,
          playerName: 'MinhAnh',
          tokenType: 'car',
          wins: 1,
          matchesPlayed: 1,
          seriesPoints: 4,
        },
      ];

      // 2. Transition all 3 connected clients into gameover VictoryModal
      injectedPhase = true;
      broadcastInjectedState('gameover', activeSeriesStandings);

      for (const page of [hostPage, guestPage, specPage]) {
        const modal = page.getByTestId('victory-modal');
        await expect(modal).toBeVisible();
        await expect(modal.getByTestId('bt-post-match-awards')).toBeVisible();
        await expect(modal.getByTestId('bt-post-match-awards')).toContainText('Chúa Đảo Hoang');
        await expect(modal.getByTestId('bt-post-match-awards')).toContainText('Trùm Thu Họ');
        await expect(modal.getByTestId('bt-post-match-awards')).toContainText('Thánh Phá Hoại');
        await expect(modal.getByTestId('bt-post-match-awards')).toContainText('Nhà Tài Trợ Vàng');

        const victorySeries = modal.getByTestId('bt-victory-series-standings');
        await expect(victorySeries).toBeVisible();
        await expect(victorySeries.getByTestId('bt-victory-series-row-1')).toContainText('MinhAnh');
        await expect(victorySeries.getByTestId('bt-victory-series-row-1')).toContainText('4 điểm');
        await expect(victorySeries.getByTestId('bt-victory-series-row-2')).toContainText('BaoLong');
        await expect(victorySeries.getByTestId('bt-victory-series-row-2')).toContainText('3 điểm');
      }

      // Host sees Return to Lobby CTA; Guest and Spectator see waiting notice
      await expect(
        hostPage.getByRole('button', { name: /Về Sảnh Phòng Chơi Tiếp/i })
      ).toBeVisible();
      await expect(guestPage.getByText(/Đang chờ Chủ phòng mở ván mới/i)).toBeVisible();
      await expect(specPage.getByText(/Đang chờ Chủ phòng mở ván mới/i)).toBeVisible();

      // 3. Real pure Canvas 2D 1200x675 PNG download verification on Host
      const [hostDownload] = await Promise.all([
        hostPage.waitForEvent('download'),
        hostPage.getByTestId('bt-download-victory-card-btn').click(),
      ]);
      expect(hostDownload.suggestedFilename()).toMatch(/\.png$/i);
      const downloadedPath = await hostDownload.path();
      expect(downloadedPath).toBeTruthy();
      assertPngDimensions(downloadedPath!, 1200, 675);
      await expect(hostPage.getByTestId('bt-victory-export-feedback')).toContainText(
        'Đã tải xuống ảnh PNG tổng kết!'
      );

      // Verify Copy-to-Clipboard success branch on Host when clipboard.write resolves
      await hostPage.evaluate(() => {
        if (typeof (globalThis as Record<string, unknown>).ClipboardItem !== 'function') {
          (globalThis as Record<string, unknown>).ClipboardItem = class {
            constructor(public readonly items: Record<string, Blob>) {}
          };
        }
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: {
            write: async () => undefined,
          },
        });
      });
      await hostPage.getByTestId('bt-copy-victory-card-btn').click();
      await expect(hostPage.getByTestId('bt-victory-export-feedback')).toContainText(
        'Đã copy ảnh vào Clipboard!'
      );

      // Verify Copy-to-Clipboard automatic PNG download fallback on Guest when clipboard write rejects
      await guestPage.evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: {
            write: async () => {
              throw new Error('Clipboard permission denied');
            },
          },
        });
      });
      const [fallbackDownload] = await Promise.all([
        guestPage.waitForEvent('download'),
        guestPage.getByTestId('bt-copy-victory-card-btn').click(),
      ]);
      const fallbackPath = await fallbackDownload.path();
      expect(fallbackPath).toBeTruthy();
      assertPngDimensions(fallbackPath!, 1200, 675);
      await expect(guestPage.getByTestId('bt-victory-export-feedback')).toContainText(
        'Trình duyệt không hỗ trợ copy ảnh — đã tự tải file PNG!'
      );

      // 4. Verify VictoryModal layout on Mobile 390x844 (zero horizontal overflow & visible CTA)
      await guestPage.setViewportSize({ width: 390, height: 844 });
      const guestModal = guestPage.getByTestId('victory-modal');
      const mobileDialogBox = await guestModal.locator('[role="dialog"]').boundingBox();
      assertWithinViewport(mobileDialogBox, 390, 844, 'VictoryModal at 390x844');
      const guestModalOverflow = await guestModal.locator('[role="dialog"]').evaluate((el) => ({
        scrollW: el.scrollWidth,
        clientW: el.clientWidth,
      }));
      expect(guestModalOverflow.scrollW).toBeLessThanOrEqual(guestModalOverflow.clientW + 1);
      await guestPage.getByTestId('bt-copy-victory-card-btn').scrollIntoViewIfNeeded();
      await expect(guestPage.getByTestId('bt-copy-victory-card-btn')).toBeVisible();
      await guestPage.setViewportSize({ width: 1280, height: 800 });

      // 5. Host clicks "Về Sảnh Phòng Chơi Tiếp" -> Lobby shows bt-series-standings-card & Host-only Reset button
      await hostPage.getByRole('button', { name: /Về Sảnh Phòng Chơi Tiếp/i }).click();

      for (const page of [hostPage, guestPage, specPage]) {
        await expect(page.getByTestId('bt-casual-lobby')).toBeVisible();
        const card = page.getByTestId('bt-series-standings-card');
        await expect(card).toBeVisible();
        await expect(card.getByTestId('bt-series-standing-row-1')).toContainText('MinhAnh');
        await expect(card.getByTestId('bt-series-standing-row-1')).toContainText('1 Cúp');
        await expect(card.getByTestId('bt-series-standing-row-1')).toContainText('4 điểm');
        await expect(card.getByTestId('bt-series-standing-row-2')).toContainText('BaoLong');
        await expect(card.getByTestId('bt-series-standing-row-2')).toContainText('3 điểm');
      }

      // Host-only Reset button
      await expect(hostPage.getByTestId('bt-reset-series-btn')).toBeVisible();
      await expect(guestPage.getByTestId('bt-reset-series-btn')).toHaveCount(0);
      await expect(specPage.getByTestId('bt-reset-series-btn')).toHaveCount(0);

      // Mobile 390x844 check for Lobby Series Standings Card
      await hostPage.setViewportSize({ width: 390, height: 844 });
      const seriesCardMobile = hostPage.getByTestId('bt-series-standings-card');
      await seriesCardMobile.scrollIntoViewIfNeeded();
      await expect(seriesCardMobile).toBeVisible();
      const seriesMobileOverflow = await seriesCardMobile.evaluate((el) => ({
        scrollW: el.scrollWidth,
        clientW: el.clientWidth,
      }));
      expect(seriesMobileOverflow.scrollW).toBeLessThanOrEqual(seriesMobileOverflow.clientW + 1);
      await hostPage.setViewportSize({ width: 1280, height: 800 });

      // 6. Host clicks Reset điểm -> sends RESET_SERIES_SCORE and clears standings across all clients
      await hostPage.getByTestId('bt-reset-series-btn').click();
      await expect
        .poll(() => outboundHostMsgs.some((m) => m.type === 'RESET_SERIES_SCORE'))
        .toBe(true);

      await expect(hostPage.getByTestId('bt-series-standings-card')).toHaveCount(0);
      await expect(guestPage.getByTestId('bt-series-standings-card')).toHaveCount(0);
      await expect(specPage.getByTestId('bt-series-standings-card')).toHaveCount(0);

      expect(hostErrors).toEqual([]);
      expect(guestErrors).toEqual([]);
      expect(specErrors).toEqual([]);
    } finally {
      await hostCtx.close();
      await guestCtx.close();
      await specCtx.close();
    }
  });
});
