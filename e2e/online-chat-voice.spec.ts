import { expect, Page, test } from '@playwright/test';
import {
  assertWithinViewport,
  attachZeroErrorGuard,
  getMode2v2Toggle,
  getTabOnline,
} from './helpers';

async function installGetUserMediaSpy(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __btGetUserMediaCallCount?: number };
    w.__btGetUserMediaCallCount = 0;

    const mediaDevices = navigator.mediaDevices;
    if (mediaDevices && typeof mediaDevices.getUserMedia === 'function') {
      const origGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
      mediaDevices.getUserMedia = (...args: Parameters<MediaDevices['getUserMedia']>) => {
        w.__btGetUserMediaCallCount = (w.__btGetUserMediaCallCount ?? 0) + 1;
        return origGetUserMedia(...args);
      };
    }
  });
}

async function getUserMediaCallCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const w = window as unknown as { __btGetUserMediaCallCount?: number };
    return w.__btGetUserMediaCallCount ?? 0;
  });
}

async function sendChatInPanel(page: Page, text: string): Promise<void> {
  const panel = page.getByTestId('bt-online-chat-panel');
  await expect(panel).toBeVisible();
  const input = panel.getByTestId('bt-chat-input');
  await input.fill(text);
  await panel.getByTestId('bt-chat-send-btn').click();
}

test.describe('Phase 1 Online Room Chat & WebRTC Voice Integration', () => {
  test('Lobby chat, in-match unread badge + 4s HUD bubble, TEAMS_2V2 [Đội] channel isolation, and default-muted mic without auto prompt', async ({
    browser,
  }) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();

    await installGetUserMediaSpy(hostPage);
    await installGetUserMediaSpy(guestPage);
    const hostErrors = attachZeroErrorGuard(hostPage);
    const guestErrors = attachZeroErrorGuard(guestPage);

    try {
      // 1. Host creates a TEAMS_2V2 room
      await hostPage.goto('/');
      await getTabOnline(hostPage).click();
      await getMode2v2Toggle(hostPage).click();
      await hostPage.locator('#online-nickname-input').fill('ChuPhongA');
      await hostPage.getByTestId('bt-create-room-btn').click();

      const roomCodeEl = hostPage.getByTestId('bt-online-room-code');
      await expect(roomCodeEl).toBeVisible();
      const roomCode = (await roomCodeEl.innerText()).trim();
      expect(roomCode.length).toBeGreaterThanOrEqual(4);

      // Voice mic must default to muted and NEVER trigger getUserMedia on room join
      const hostLobbyMicBtn = hostPage.getByTestId('bt-voice-mic-btn');
      await expect(hostLobbyMicBtn).toBeVisible();
      await expect(hostLobbyMicBtn).toHaveAttribute('data-mic-enabled', 'false');
      await expect(hostLobbyMicBtn).toHaveAttribute('aria-pressed', 'false');
      expect(await getUserMediaCallCount(hostPage)).toBe(0);

      // Voice popover in lobby must render unclipped inside viewport
      await hostPage.getByTestId('bt-voice-popover-btn').click();
      const hostLobbyPopover = hostPage.getByTestId('bt-voice-popover');
      await expect(hostLobbyPopover).toBeVisible();
      assertWithinViewport(
        await hostLobbyPopover.boundingBox(),
        1280,
        800,
        'Lobby Voice Control Popover'
      );
      await hostPage.keyboard.press('Escape');
      await expect(hostLobbyPopover).toHaveCount(0);

      // 2. Guest joins the room by code / invite query
      await guestPage.goto(`/?room=${roomCode}`);
      await guestPage.locator('#online-nickname-input').fill('KhachMoiB');
      await guestPage.getByTestId('bt-join-room-btn').click();

      await expect(hostPage.getByText('Danh Sách Ghế Ngồi (2/4 Người)')).toBeVisible();
      await expect(hostPage.getByText('KhachMoiB')).toBeVisible();
      await expect(guestPage.getByTestId('bt-online-room-code')).toHaveText(roomCode);

      const guestLobbyMicBtn = guestPage.getByTestId('bt-voice-mic-btn');
      await expect(guestLobbyMicBtn).toBeVisible();
      await expect(guestLobbyMicBtn).toHaveAttribute('data-mic-enabled', 'false');
      await expect(guestLobbyMicBtn).toHaveAttribute('aria-pressed', 'false');
      expect(await getUserMediaCallCount(guestPage)).toBe(0);

      // 3. Both Host and Guest exchange messages in the Lobby and see each other immediately
      const hostLobbyMsg = 'Chào mừng vào sảnh 2v2!';
      const guestLobbyMsg = 'Sẵn sàng chiến đấu rồi!';

      await sendChatInPanel(hostPage, hostLobbyMsg);
      await expect(hostPage.getByTestId('bt-chat-messages-list')).toContainText(hostLobbyMsg);
      await expect(guestPage.getByTestId('bt-chat-messages-list')).toContainText(hostLobbyMsg);

      await sendChatInPanel(guestPage, guestLobbyMsg);
      await expect(guestPage.getByTestId('bt-chat-messages-list')).toContainText(guestLobbyMsg);
      await expect(hostPage.getByTestId('bt-chat-messages-list')).toContainText(guestLobbyMsg);

      // 4. Host starts the match
      await hostPage.getByTestId('bt-online-start-btn').click();
      await expect(hostPage.locator('body')).toHaveAttribute('data-state', 'playing');
      await expect(guestPage.locator('body')).toHaveAttribute('data-state', 'playing');

      // In-match Voice Mic defaults to muted on both clients without getUserMedia auto-prompt
      const hostMatchMicBtn = hostPage.getByTestId('bt-voice-mic-btn');
      const guestMatchMicBtn = guestPage.getByTestId('bt-voice-mic-btn');
      await expect(hostMatchMicBtn).toBeVisible();
      await expect(guestMatchMicBtn).toBeVisible();
      await expect(hostMatchMicBtn).toHaveAttribute('data-mic-enabled', 'false');
      await expect(guestMatchMicBtn).toHaveAttribute('data-mic-enabled', 'false');
      expect(await getUserMediaCallCount(hostPage)).toBe(0);
      expect(await getUserMediaCallCount(guestPage)).toBe(0);

      // Guest's chat drawer starts closed with zero unread badge
      const guestChatBtn = guestPage.getByTestId('bt-action-chat-btn');
      await expect(guestChatBtn).toBeVisible();
      await expect(guestPage.getByTestId('bt-online-chat-panel')).toHaveCount(0);
      await expect(guestPage.getByTestId('bt-chat-unread-badge')).toHaveCount(0);

      // Respect 800ms per-client server chat cooldown before Host sends in-match message
      await hostPage.waitForTimeout(900);

      // Host opens drawer and sends a room message while Guest's chat drawer is closed
      await hostPage.getByTestId('bt-action-chat-btn').click();
      await expect(hostPage.getByTestId('bt-online-chat-panel')).toBeVisible();

      const hostMatchMsg = 'Đổ mạnh lên anh em ơi!';
      await sendChatInPanel(hostPage, hostMatchMsg);

      // Guest sees red unread badge "1" on bt-action-chat-btn AND 4s HUD bubble next to Host (P0)
      const guestUnreadBadge = guestPage.getByTestId('bt-chat-unread-badge');
      await expect(guestUnreadBadge).toBeVisible();
      await expect(guestUnreadBadge).toHaveText('1');

      const hostBubbleOnGuestHud = guestPage.getByTestId('bt-hud-chat-bubble-p0');
      await expect(hostBubbleOnGuestHud).toBeVisible();
      await expect(hostBubbleOnGuestHud).toContainText(hostMatchMsg);
      assertWithinViewport(
        await hostBubbleOnGuestHud.boundingBox(),
        1280,
        800,
        'Guest HUD Chat Bubble for Host'
      );

      // 5. Guest opens chat drawer -> unread badge disappears and full history is rendered
      await guestChatBtn.click();
      const guestChatPanel = guestPage.getByTestId('bt-online-chat-panel');
      await expect(guestChatPanel).toBeVisible();
      await expect(guestPage.getByTestId('bt-chat-unread-badge')).toHaveCount(0);

      const guestChatList = guestChatPanel.getByTestId('bt-chat-messages-list');
      await expect(guestChatList).toContainText(hostLobbyMsg);
      await expect(guestChatList).toContainText(guestLobbyMsg);
      await expect(guestChatList).toContainText(hostMatchMsg);

      // 6. Guest switches to [Đội] tab and sends a team-only message
      await guestPage.waitForTimeout(900);
      await guestChatPanel.getByTestId('bt-chat-tab-team').click();
      const guestTeamMsg = 'Chiến thuật riêng của Đội B!';
      await sendChatInPanel(guestPage, guestTeamMsg);

      const teamMsgItem = guestChatList
        .locator('[data-channel="TEAM"]')
        .filter({ hasText: guestTeamMsg });
      await expect(teamMsgItem).toBeVisible();
      await expect(teamMsgItem).toContainText('[Đội]');

      // Host (Seat 0, Team A) must NEVER see Guest's (Seat 1, Team B) [Đội] message
      await hostPage.waitForTimeout(400);
      await expect(hostPage.getByTestId('bt-chat-messages-list')).not.toContainText(guestTeamMsg);

      // 7. In-match Voice Popover opens unclipped and shows remote peer KhachMoiB
      await hostPage.getByTestId('bt-action-chat-btn').click();
      await hostPage.getByTestId('bt-voice-popover-btn').click();
      const hostMatchPopover = hostPage.getByTestId('bt-voice-popover');
      await expect(hostMatchPopover).toBeVisible();
      await expect(hostMatchPopover).toContainText('KhachMoiB');
      assertWithinViewport(
        await hostMatchPopover.boundingBox(),
        1280,
        800,
        'Match Voice Control Popover'
      );

      // 8. Host's 4s HUD chat bubble auto-dismisses cleanly after ~4000ms
      await expect(hostBubbleOnGuestHud).toHaveCount(0, { timeout: 6_000 });

      expect(await getUserMediaCallCount(hostPage)).toBe(0);
      expect(await getUserMediaCallCount(guestPage)).toBe(0);
      expect(hostErrors).toEqual([]);
      expect(guestErrors).toEqual([]);
    } finally {
      await hostCtx.close();
      await guestCtx.close();
    }
  });
});
