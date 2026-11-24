import { expect, test } from '@playwright/test';
import {
  assertWithinViewport,
  attachZeroErrorGuard,
  getMode2v2Toggle,
  getTabOnline,
} from './helpers';

test.describe('Phase 2 Online Lobby Ready Check, 2v2 Seat Move, Spectator Mode & Hot-Join Bot Takeover', () => {
  test('Host creates TEAMS_2V2 hard-bot room, Ready Check gates start after seat move, Late Joiner enters Spectator Mode and takes over Bot upon Host approval', async ({
    browser,
  }) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const lateCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });

    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();
    const latePage = await lateCtx.newPage();

    const hostErrors = attachZeroErrorGuard(hostPage);
    const guestErrors = attachZeroErrorGuard(guestPage);
    const lateErrors = attachZeroErrorGuard(latePage);

    try {
      // 1. Host creates a TEAMS_2V2 room with fillBots=true & botDifficulty='hard'
      await hostPage.goto('/');
      await getTabOnline(hostPage).click();
      await getMode2v2Toggle(hostPage).click();

      const fillBotsToggle = hostPage.getByRole('button', { name: /Bù Bot AI nếu thiếu người/i });
      if ((await fillBotsToggle.getAttribute('aria-pressed')) !== 'true') {
        await fillBotsToggle.click();
      }
      await hostPage.getByTestId('bt-bot-difficulty-hard').click();
      await expect(hostPage.getByTestId('bt-bot-difficulty-hard')).toHaveAttribute(
        'aria-pressed',
        'true'
      );

      await hostPage.locator('#online-nickname-input').fill('ChuPhongA');
      await hostPage.getByTestId('bt-create-room-btn').click();

      const roomCodeEl = hostPage.getByTestId('bt-online-room-code');
      await expect(roomCodeEl).toBeVisible();
      const roomCode = (await roomCodeEl.innerText()).trim();
      expect(roomCode.length).toBeGreaterThanOrEqual(4);
      await expect(hostPage.getByTestId('bt-bot-difficulty-badge')).toHaveText('Cá mập');

      // 2. Guest 1 joins via ?room=CODE (lands in Seat 1 - Team B)
      await guestPage.goto(`/?room=${roomCode}`);
      await guestPage.locator('#online-nickname-input').fill('DongDoiA');
      await guestPage.getByTestId('bt-join-room-btn').click();

      await expect(hostPage.getByText('Danh Sách Ghế Ngồi (2/4 Người)')).toBeVisible();
      await expect(guestPage.getByTestId('bt-lobby-seat-1')).toContainText('DongDoiA');

      // Host Start button MUST be disabled while Guest 1 has not toggled Ready
      const hostStartBtn = hostPage.getByTestId('bt-online-start-btn');
      await expect(hostStartBtn).toBeDisabled();
      await expect(hostPage.getByTestId('bt-online-start-hint')).toBeVisible();

      // 3. Guest 1 moves to empty Seat 2 (same Team A as Host), then toggles Ready
      await guestPage.getByTestId('bt-seat-action-2').click();
      await expect(guestPage.getByTestId('bt-lobby-seat-2')).toContainText('DongDoiA');
      await expect(guestPage.getByTestId('bt-lobby-seat-2')).toContainText('Đội A');
      await expect(hostPage.getByTestId('bt-lobby-seat-2')).toContainText('DongDoiA');
      await expect(hostStartBtn).toBeDisabled();

      await guestPage.getByTestId('bt-ready-toggle-btn').click();
      await expect(guestPage.getByTestId('bt-ready-toggle-btn')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await expect(hostStartBtn).toBeEnabled();

      // Host starts the match cleanly
      await hostStartBtn.click();
      await expect(hostPage.locator('body')).toHaveAttribute('data-state', 'playing');
      await expect(guestPage.locator('body')).toHaveAttribute('data-state', 'playing');

      await expect(hostPage.getByTestId('player-card-0')).toContainText('ChuPhongA');
      await expect(hostPage.getByTestId('player-card-0')).toContainText('Đội A');
      await expect(hostPage.getByTestId('player-card-2')).toContainText('DongDoiA');
      await expect(hostPage.getByTestId('player-card-2')).toContainText('Đội A');
      await expect(hostPage.getByTestId('player-card-1')).toContainText('Đội B');
      await expect(hostPage.getByTestId('player-card-3')).toContainText('Đội B');

      // 4. Late Joiner opens ?room=CODE mid-match -> enters live 3D board directly in Spectator Mode
      await latePage.goto(`/?room=${roomCode}`);
      await latePage.locator('#online-nickname-input').fill('KhanGiaMoi');
      await latePage.getByTestId('bt-join-room-btn').click();

      await expect(latePage.locator('body')).toHaveAttribute('data-state', 'playing');
      await expect(latePage.getByTestId('bt-casual-lobby')).toHaveCount(0);
      await expect(latePage.locator('canvas[data-rendered-frames]')).toBeVisible();
      await expect(latePage.getByTestId('player-card-0')).toBeVisible();
      await expect(latePage.getByTestId('player-card-1')).toBeVisible();

      // Spectator has NO turn action buttons or Emotes, and retains utility rail + Spectator bar
      await expect(latePage.getByTestId('bt-roll-dice-btn')).toHaveCount(0);
      await expect(latePage.getByTestId('bt-jail-roll-btn')).toHaveCount(0);
      await expect(latePage.getByTestId('bt-btn-emotes')).toHaveCount(0);
      await expect(latePage.getByTestId('bt-btn-settings')).toBeVisible();
      await expect(latePage.getByTestId('bt-btn-pause')).toBeVisible();
      await expect(latePage.getByTestId('bt-action-chat-btn')).toBeVisible();
      await expect(latePage.getByTestId('bt-voice-mic-btn')).toBeVisible();

      const spectatorBar = latePage.getByTestId('bt-spectator-status-bar');
      await expect(spectatorBar).toBeVisible();
      await expect(spectatorBar).toContainText('👁️ Chế độ Khán giả — Đang xem trực tiếp');
      assertWithinViewport(
        await spectatorBar.boundingBox(),
        1280,
        800,
        'Spectator Status Bar'
      );

      // 5. Late Joiner requests takeover for Bot P3 -> Host rejects -> stays Spectator
      const requestTakeoverBtn = latePage.getByTestId('bt-request-takeover-btn');
      await expect(requestTakeoverBtn).toBeEnabled();
      await requestTakeoverBtn.click();

      await expect(latePage.getByTestId('bt-takeover-bot-option-p1')).toBeVisible();
      await expect(latePage.getByTestId('bt-takeover-bot-option-p3')).toBeVisible();
      await expect(latePage.getByTestId('bt-takeover-bot-option-p0')).toHaveCount(0);
      await expect(latePage.getByTestId('bt-takeover-bot-option-p2')).toHaveCount(0);

      await latePage.getByTestId('bt-takeover-bot-option-p3').click();
      await expect(requestTakeoverBtn).toBeDisabled();

      const approvalDialog = hostPage.getByTestId('bt-takeover-approval-dialog');
      await expect(approvalDialog).toBeVisible();
      await expect(approvalDialog).toContainText('KhanGiaMoi');
      await expect(approvalDialog).toContainText(/\d+s/);
      assertWithinViewport(
        await approvalDialog.boundingBox(),
        1280,
        800,
        'Host Bot Takeover Approval Dialog'
      );
      await expect(guestPage.getByTestId('bt-takeover-approval-dialog')).toHaveCount(0);

      await hostPage.getByTestId('bt-takeover-reject-btn').click();
      await expect(approvalDialog).toHaveCount(0);
      await expect(spectatorBar).toBeVisible();
      await expect(requestTakeoverBtn).toBeEnabled();

      // 6. Late Joiner requests takeover for Bot P1 -> Host approves -> becomes real player
      await requestTakeoverBtn.click();
      await latePage.getByTestId('bt-takeover-bot-option-p1').click();

      await expect(approvalDialog).toBeVisible();
      await expect(approvalDialog).toContainText('KhanGiaMoi');
      await hostPage.getByTestId('bt-takeover-approve-btn').click();
      await expect(approvalDialog).toHaveCount(0);

      await expect(latePage.getByTestId('bt-spectator-status-bar')).toHaveCount(0);
      await expect(latePage.getByTestId('player-card-1')).toContainText('KhanGiaMoi');
      await expect(latePage.getByTestId('player-card-1')).toContainText('BẠN');
      await expect(hostPage.getByTestId('player-card-1')).toContainText('KhanGiaMoi');
      await expect(guestPage.getByTestId('player-card-1')).toContainText('KhanGiaMoi');

      expect(hostErrors).toEqual([]);
      expect(guestErrors).toEqual([]);
      expect(lateErrors).toEqual([]);
    } finally {
      await hostCtx.close();
      await guestCtx.close();
      await lateCtx.close();
    }
  });
});
