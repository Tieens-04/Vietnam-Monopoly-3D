import assert from 'node:assert/strict';
import test from 'node:test';
import type { PostMatchAward, SeriesStandingEntry } from '../game/onlineTypes';
import {
  VICTORY_CARD_HEIGHT,
  VICTORY_CARD_WIDTH,
  copyVictoryCardToClipboard,
  downloadVictoryCardPng,
  renderVictoryCardCanvas,
  type VictoryCardExportData,
} from './victoryCardExport';

interface RecordedTextCall {
  text: string;
  x: number;
  y: number;
  font: string;
}

function createMockCanvasContext(): {
  ctx: CanvasRenderingContext2D;
  textCalls: RecordedTextCall[];
  fontsSeen: string[];
} {
  const textCalls: RecordedTextCall[] = [];
  const fontsSeen: string[] = [];
  let currentFont = '16px sans-serif';

  const makeGradient = () => ({
    addColorStop: () => {},
  });

  const ctxStub = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    globalAlpha: 1,
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    get font() {
      return currentFont;
    },
    set font(value: string) {
      currentFont = value;
      fontsSeen.push(value);
    },
    createLinearGradient: () => makeGradient(),
    createRadialGradient: () => makeGradient(),
    fillRect: () => {},
    strokeRect: () => {},
    clearRect: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    quadraticCurveTo: () => {},
    arcTo: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    save: () => {},
    restore: () => {},
    clip: () => {},
    translate: () => {},
    measureText: (text: string) => ({ width: text.length * 8.5 }),
    fillText: (text: string, x: number, y: number) => {
      textCalls.push({ text: String(text), x, y, font: currentFont });
    },
    strokeText: () => {},
  };

  return {
    ctx: ctxStub as unknown as CanvasRenderingContext2D,
    textCalls,
    fontsSeen,
  };
}

function createSampleExportData(): VictoryCardExportData {
  const awards: PostMatchAward[] = [
    {
      id: 'CHUA_DAO_HOANG',
      icon: '🏝️',
      title: 'Chúa Đảo Hoang',
      subtitle: 'Ghé thăm Đảo Hoang nhiều nhất trận',
      playerId: 1,
      playerName: 'Bảo Long',
      playerColor: '#66C61C',
      valueLabel: '3 lần ra đảo',
    },
    {
      id: 'TRUM_THU_HO',
      icon: '💰',
      title: 'Trùm Thu Họ',
      subtitle: 'Cú thu tiền thuê một lượt cao nhất',
      playerId: 0,
      playerName: 'Minh Anh',
      playerColor: '#F5B800',
      valueLabel: '640K',
    },
    {
      id: 'THANH_PHA_HOAI',
      icon: '💣',
      title: 'Thánh Phá Hoại',
      subtitle: 'Tích cực mua đứt và tung thẻ công kích',
      playerId: 2,
      playerName: 'Khánh Vy',
      playerColor: '#E91E63',
      valueLabel: '2 pha công kích',
    },
    {
      id: 'NHA_TAI_TRO_VANG',
      icon: '💸',
      title: 'Nhà Tài Trợ Vàng',
      subtitle: 'Đóng góp tiền thuê nhiều nhất cả bàn',
      playerId: 1,
      playerName: 'Bảo Long',
      playerColor: '#66C61C',
      valueLabel: '920K',
    },
  ];

  // Intentionally unsorted so renderVictoryCardCanvas verifies descending seriesPoints, then wins
  const seriesStandings: SeriesStandingEntry[] = [
    {
      participantId: 'p-baolong',
      playerName: 'Bảo Long',
      tokenType: 'yacht',
      wins: 1,
      matchesPlayed: 3,
      seriesPoints: 6,
    },
    {
      participantId: 'p-minhanh',
      playerName: 'Minh Anh',
      tokenType: 'car',
      wins: 2,
      matchesPlayed: 3,
      seriesPoints: 11,
    },
    {
      participantId: 'p-khanhvy',
      playerName: 'Khánh Vy',
      tokenType: 'jet',
      wins: 1,
      matchesPlayed: 3,
      seriesPoints: 6,
    },
  ];

  return {
    roomCode: 'VN2026',
    winnerName: 'Minh Anh',
    victoryLabel: 'Độc quyền khu nghỉ dưỡng',
    rankedPlayers: [
      { rank: 1, name: 'Minh Anh', color: '#F5B800', netWorthText: '4 850 000', isWinner: true },
      { rank: 2, name: 'Bảo Long', color: '#66C61C', netWorthText: '2 420 000' },
      { rank: 3, name: 'Khánh Vy', color: '#E91E63', netWorthText: 'PHÁ SẢN' },
    ],
    awards,
    seriesStandings,
  };
}

test('renderVictoryCardCanvas creates 1200x675 canvas and draws roomCode, winnerName, awards, and sorted seriesStandings', () => {
  const { ctx, textCalls, fontsSeen } = createMockCanvasContext();
  const sample = createSampleExportData();

  let createdWidth = 0;
  let createdHeight = 0;
  const mockCanvas = {
    width: 0,
    height: 0,
    getContext: (kind: string) => (kind === '2d' ? ctx : null),
  } as unknown as HTMLCanvasElement;

  const resultCanvas = renderVictoryCardCanvas(sample, (w, h) => {
    createdWidth = w;
    createdHeight = h;
    mockCanvas.width = w;
    mockCanvas.height = h;
    return mockCanvas;
  });

  assert.equal(VICTORY_CARD_WIDTH, 1200);
  assert.equal(VICTORY_CARD_HEIGHT, 675);
  assert.equal(createdWidth, 1200);
  assert.equal(createdHeight, 675);
  assert.equal(resultCanvas.width, 1200);
  assert.equal(resultCanvas.height, 675);

  assert.ok(
    fontsSeen.some((f) => f.includes('Be Vietnam Pro')),
    'Expected Canvas 2D font descriptors to use Be Vietnam Pro'
  );

  const allDrawnText = textCalls.map((call) => call.text).join('\n');
  assert.ok(allDrawnText.includes('VN2026'), 'Expected roomCode VN2026 to be drawn');
  assert.ok(allDrawnText.includes('Minh Anh'), 'Expected winnerName Minh Anh to be drawn');
  assert.ok(
    allDrawnText.includes('Độc quyền khu nghỉ dưỡng'),
    'Expected victoryLabel to be drawn'
  );

  for (const player of sample.rankedPlayers) {
    assert.ok(allDrawnText.includes(player.name), `Expected player ${player.name} to be drawn`);
    assert.ok(
      allDrawnText.includes(player.netWorthText),
      `Expected net worth ${player.netWorthText} to be drawn`
    );
  }

  for (const award of sample.awards) {
    assert.ok(allDrawnText.includes(award.title), `Expected award title ${award.title} to be drawn`);
    assert.ok(
      allDrawnText.includes(award.valueLabel),
      `Expected award value ${award.valueLabel} to be drawn`
    );
  }

  assert.ok(allDrawnText.includes('11'), 'Expected top series points 11 to be drawn');
  assert.ok(allDrawnText.includes('2'), 'Expected top wins count 2 to be drawn');

  // Verify Minh Anh (11 pts) appears above Bảo Long (6 pts) in the series leaderboard block
  const seriesMinhAnhCall = textCalls.find(
    (c) => c.text.includes('Minh Anh') && c.y > 380
  );
  const seriesBaoLongCall = textCalls.find(
    (c) => c.text.includes('Bảo Long') && c.y > 380
  );
  assert.ok(seriesMinhAnhCall && seriesBaoLongCall, 'Expected series rows in lower card');
  assert.ok(
    seriesMinhAnhCall.y < seriesBaoLongCall.y,
    'Expected higher seriesPoints player to render above lower seriesPoints player'
  );
});

test('renderVictoryCardCanvas handles offline empty awards and empty seriesStandings gracefully', () => {
  const { ctx, textCalls } = createMockCanvasContext();
  const mockCanvas = {
    width: 0,
    height: 0,
    getContext: (kind: string) => (kind === '2d' ? ctx : null),
  } as unknown as HTMLCanvasElement;

  const canvas = renderVictoryCardCanvas(
    {
      winnerName: 'Tỷ Phú Offline',
      victoryLabel: 'Hết giờ (20:00) — Tổng Tài Sản',
      rankedPlayers: [
        { rank: 1, name: 'Tỷ Phú Offline', color: '#F5B800', netWorthText: '3 100 000', isWinner: true },
        { rank: 2, name: 'Bot Cá Mập', color: '#29B6F6', netWorthText: '1 800 000' },
      ],
      awards: [],
      seriesStandings: [],
    },
    (w, h) => {
      mockCanvas.width = w;
      mockCanvas.height = h;
      return mockCanvas;
    }
  );

  assert.equal(canvas.width, 1200);
  assert.equal(canvas.height, 675);
  const joined = textCalls.map((c) => c.text).join('\n');
  assert.ok(joined.includes('Tỷ Phú Offline'));
  assert.ok(joined.includes('Bot Cá Mập'));
});

test('copyVictoryCardToClipboard returns copied when clipboard write succeeds (via DI and global navigator)', async () => {
  const dummyCanvas = {
    toBlob: (cb: (blob: Blob | null) => void) => cb(new Blob(['png'], { type: 'image/png' })),
    toDataURL: () => 'data:image/png;base64,AAAA',
  } as unknown as HTMLCanvasElement;

  let writtenItemsCount = 0;
  let fallbackCalls = 0;
  const diResult = await copyVictoryCardToClipboard(dummyCanvas, 'test-card.png', {
    createClipboardItem: (blob) => ({ types: [blob.type] } as unknown as ClipboardItem),
    clipboardWriter: async (items) => {
      writtenItemsCount = items.length;
    },
    fallbackDownload: () => {
      fallbackCalls += 1;
    },
  });

  assert.equal(diResult, 'copied');
  assert.equal(writtenItemsCount, 1);
  assert.equal(fallbackCalls, 0);

  // Also verify global navigator.clipboard + globalThis.ClipboardItem path cleanly with try/finally
  const prevNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const prevClipboardItemDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'ClipboardItem');
  let globalWritten = 0;
  class FakeClipboardItem {
    constructor(public readonly data: Record<string, Blob>) {}
  }
  try {
    Object.defineProperty(globalThis, 'ClipboardItem', {
      configurable: true,
      writable: true,
      value: FakeClipboardItem,
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      writable: true,
      value: {
        clipboard: {
          write: async (items: unknown[]) => {
            globalWritten = items.length;
          },
        },
      },
    });

    const globalResult = await copyVictoryCardToClipboard(dummyCanvas, 'global-card.png');
    assert.equal(globalResult, 'copied');
    assert.equal(globalWritten, 1);
  } finally {
    if (prevNavigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', prevNavigatorDescriptor);
    } else {
      delete (globalThis as Record<string, unknown>).navigator;
    }
    if (prevClipboardItemDescriptor) {
      Object.defineProperty(globalThis, 'ClipboardItem', prevClipboardItemDescriptor);
    } else {
      delete (globalThis as Record<string, unknown>).ClipboardItem;
    }
  }
});

test('copyVictoryCardToClipboard falls back to download and returns downloaded when ClipboardItem is missing, clipboard.write rejects, or toBlob fails', async () => {
  const dummyCanvas = {
    toBlob: (cb: (blob: Blob | null) => void) => cb(new Blob(['png'], { type: 'image/png' })),
    toDataURL: () => 'data:image/png;base64,AAAA',
  } as unknown as HTMLCanvasElement;

  const prevNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const prevClipboardItemDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'ClipboardItem');
  try {
    // Case 1: ClipboardItem missing globally
    delete (globalThis as Record<string, unknown>).ClipboardItem;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      writable: true,
      value: {
        clipboard: {
          write: async () => {},
        },
      },
    });

    const downloadedArgs1: Array<{ canvas: HTMLCanvasElement; filename: string }> = [];
    const resMissingItem = await copyVictoryCardToClipboard(dummyCanvas, 'fallback-1.png', {
      fallbackDownload: (canvas, filename) => {
        downloadedArgs1.push({ canvas, filename });
      },
    });
    assert.equal(resMissingItem, 'downloaded');
    assert.equal(downloadedArgs1.length, 1);
    assert.equal(downloadedArgs1[0].filename, 'fallback-1.png');

    // Case 2: clipboardWriter rejects
    const downloadedArgs2: string[] = [];
    const resRejected = await copyVictoryCardToClipboard(dummyCanvas, 'fallback-2.png', {
      createClipboardItem: (blob) => ({ blob } as unknown as ClipboardItem),
      clipboardWriter: async () => {
        throw new Error('Clipboard write blocked');
      },
      fallbackDownload: (_canvas, filename) => {
        downloadedArgs2.push(filename);
      },
    });
    assert.equal(resRejected, 'downloaded');
    assert.deepEqual(downloadedArgs2, ['fallback-2.png']);

    // Case 3: toBlob yields null
    const nullBlobCanvas = {
      toBlob: (cb: (blob: Blob | null) => void) => cb(null),
      toDataURL: () => 'data:image/png;base64,AAAA',
    } as unknown as HTMLCanvasElement;
    const downloadedArgs3: string[] = [];
    const resNullBlob = await copyVictoryCardToClipboard(nullBlobCanvas, 'fallback-3.png', {
      createClipboardItem: (blob) => ({ blob } as unknown as ClipboardItem),
      clipboardWriter: async () => {},
      fallbackDownload: (_canvas, filename) => {
        downloadedArgs3.push(filename);
      },
    });
    assert.equal(resNullBlob, 'downloaded');
    assert.deepEqual(downloadedArgs3, ['fallback-3.png']);
  } finally {
    if (prevNavigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', prevNavigatorDescriptor);
    } else {
      delete (globalThis as Record<string, unknown>).navigator;
    }
    if (prevClipboardItemDescriptor) {
      Object.defineProperty(globalThis, 'ClipboardItem', prevClipboardItemDescriptor);
    } else {
      delete (globalThis as Record<string, unknown>).ClipboardItem;
    }
  }
});

test('downloadVictoryCardPng exports image/png data URL and triggers anchor download click', () => {
  const prevDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let requestedMime = '';
  let clicked = false;
  let appended = false;
  let removed = false;

  const anchorStub = {
    href: '',
    download: '',
    style: { display: '' },
    click: () => {
      clicked = true;
    },
    remove: () => {
      removed = true;
    },
  };

  try {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      writable: true,
      value: {
        createElement: (tag: string) => {
          assert.equal(tag, 'a');
          return anchorStub;
        },
        body: {
          appendChild: (node: unknown) => {
            assert.equal(node, anchorStub);
            appended = true;
          },
          removeChild: (node: unknown) => {
            assert.equal(node, anchorStub);
            removed = true;
          },
        },
      },
    });

    const mockCanvas = {
      toDataURL: (mime: string) => {
        requestedMime = mime;
        return 'data:image/png;base64,TESTPNG';
      },
    } as unknown as HTMLCanvasElement;

    downloadVictoryCardPng(mockCanvas, 'tong-ket-vn2026.png');

    assert.equal(requestedMime, 'image/png');
    assert.equal(anchorStub.href, 'data:image/png;base64,TESTPNG');
    assert.equal(anchorStub.download, 'tong-ket-vn2026.png');
    assert.equal(appended, true);
    assert.equal(clicked, true);
    assert.equal(removed, true);
  } finally {
    if (prevDocumentDescriptor) {
      Object.defineProperty(globalThis, 'document', prevDocumentDescriptor);
    } else {
      delete (globalThis as Record<string, unknown>).document;
    }
  }
});
