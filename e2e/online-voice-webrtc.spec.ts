import { expect, Page, test } from '@playwright/test';
import { attachZeroErrorGuard, getTabOnline } from './helpers';

test.use({
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
});

test.describe('Real Chrome WebRTC Bidirectional Audio & Glare E2E', () => {
  test('Both peers connect WebRTC, toggle mic with 150ms signaling RTT, stream RTP audio bytes, and play remote <audio> in match', async ({
    browser,
  }) => {
    const hostCtx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      permissions: ['microphone'],
    });
    const guestCtx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      permissions: ['microphone'],
    });
    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();

    const installRtcDiagnostics = async (page: Page) => {
      await page.addInitScript(() => {
        const w = window as unknown as { __btRtcPcs?: RTCPeerConnection[] };
        w.__btRtcPcs = [];
        const OrigWS = window.WebSocket;
        window.WebSocket = function (...args: ConstructorParameters<typeof WebSocket>) {
          const ws = new OrigWS(...args);
          const origSend = ws.send.bind(ws);
          ws.send = (data: Parameters<WebSocket['send']>[0]) => {
            try {
              const parsed = JSON.parse(String(data)) as { type?: string };
              if (parsed.type === 'RTC_SIGNAL') {
                setTimeout(() => origSend(data), 150);
                return;
              }
            } catch {
              // ignore non-JSON
            }
            origSend(data);
          };
          return ws;
        } as unknown as typeof WebSocket;
        window.WebSocket.prototype = OrigWS.prototype;
        Object.assign(window.WebSocket, {
          CONNECTING: OrigWS.CONNECTING,
          OPEN: OrigWS.OPEN,
          CLOSING: OrigWS.CLOSING,
          CLOSED: OrigWS.CLOSED,
        });

        const OrigPC = window.RTCPeerConnection;
        window.RTCPeerConnection = function (...args: ConstructorParameters<typeof RTCPeerConnection>) {
          const pc = new OrigPC(...args);
          w.__btRtcPcs?.push(pc);
          return pc;
        } as unknown as typeof RTCPeerConnection;
        window.RTCPeerConnection.prototype = OrigPC.prototype;
      });
    };

    await installRtcDiagnostics(hostPage);
    await installRtcDiagnostics(guestPage);
    const hostErrors = attachZeroErrorGuard(hostPage);
    const guestErrors = attachZeroErrorGuard(guestPage);

    const readRtcStats = async (page: Page) =>
      page.evaluate(async () => {
        const w = window as unknown as { __btRtcPcs?: RTCPeerConnection[] };
        const pcs = w.__btRtcPcs ?? [];
        const active = pcs[pcs.length - 1];
        if (!active) {
          return { connected: false, bytesSent: 0, bytesReceived: 0, audioPlaying: false, transceiversCount: 0 };
        }
        const stats = await active.getStats();
        let bytesSent = 0;
        let bytesReceived = 0;
        stats.forEach((report) => {
          if (report.type === 'outbound-rtp') {
            bytesSent += (report as RTCOutboundRtpStreamStats).bytesSent ?? 0;
          }
          if (report.type === 'inbound-rtp') {
            bytesReceived += (report as RTCInboundRtpStreamStats).bytesReceived ?? 0;
          }
        });
        const audios = Array.from(document.querySelectorAll('audio'));
        const audioPlaying = audios.some(
          (el) => !el.paused && !el.muted && el.readyState >= 2 && Boolean(el.srcObject)
        );
        return {
          connected: active.iceConnectionState === 'connected' || active.connectionState === 'connected',
          bytesSent,
          bytesReceived,
          audioPlaying,
          transceiversCount: active.getTransceivers().length,
        };
      });

    try {
      await hostPage.goto('/');
      await getTabOnline(hostPage).click();
      await hostPage.locator('#online-nickname-input').fill('VoiceHost');
      await hostPage.getByTestId('bt-create-room-btn').click();
      const roomCode = (await hostPage.getByTestId('bt-online-room-code').innerText()).trim();

      await guestPage.goto(`/?room=${roomCode}`);
      await guestPage.locator('#online-nickname-input').fill('VoiceGuest');
      await guestPage.getByTestId('bt-join-room-btn').click();
      await expect(guestPage.getByTestId('bt-online-room-code')).toHaveText(roomCode);

      // Both click mic simultaneously under 150ms signaling latency
      await Promise.all([
        hostPage.getByTestId('bt-voice-mic-btn').click(),
        guestPage.getByTestId('bt-voice-mic-btn').click(),
      ]);

      await expect(hostPage.getByTestId('bt-voice-mic-btn')).toHaveAttribute('data-mic-enabled', 'true');
      await expect(guestPage.getByTestId('bt-voice-mic-btn')).toHaveAttribute('data-mic-enabled', 'true');

      await expect
        .poll(async () => {
          const [a, b] = await Promise.all([readRtcStats(hostPage), readRtcStats(guestPage)]);
          return (
            a.connected &&
            b.connected &&
            a.bytesSent > 0 &&
            a.bytesReceived > 0 &&
            a.audioPlaying &&
            b.bytesSent > 0 &&
            b.bytesReceived > 0 &&
            b.audioPlaying
          );
        }, { timeout: 20_000 })
        .toBe(true);

      // Start match and confirm audio keeps flowing in-match without dropping peer connection
      await guestPage.getByTestId('bt-ready-toggle-btn').click();
      await expect(hostPage.getByTestId('bt-online-start-btn')).toBeEnabled();
      await hostPage.getByTestId('bt-online-start-btn').click();
      await expect(hostPage.locator('body')).toHaveAttribute('data-state', 'playing');
      await expect(guestPage.locator('body')).toHaveAttribute('data-state', 'playing');

      const beforeStatsA = await readRtcStats(hostPage);
      const beforeStatsB = await readRtcStats(guestPage);
      await hostPage.waitForTimeout(1200);
      const afterStatsA = await readRtcStats(hostPage);
      const afterStatsB = await readRtcStats(guestPage);

      expect(afterStatsA.connected).toBe(true);
      expect(afterStatsB.connected).toBe(true);
      expect(afterStatsA.bytesSent).toBeGreaterThan(beforeStatsA.bytesSent);
      expect(afterStatsA.bytesReceived).toBeGreaterThan(beforeStatsA.bytesReceived);
      expect(afterStatsB.bytesSent).toBeGreaterThan(beforeStatsB.bytesSent);
      expect(afterStatsB.bytesReceived).toBeGreaterThan(beforeStatsB.bytesReceived);

      expect(hostErrors).toEqual([]);
      expect(guestErrors).toEqual([]);
    } finally {
      await hostCtx.close();
      await guestCtx.close();
    }
  });
});
