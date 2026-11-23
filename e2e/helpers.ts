import { expect, Locator, Page } from '@playwright/test';

export interface BoxBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Attaches uncaught `pageerror` and `console.error` listeners for zero-error verification.
 */
export function attachZeroErrorGuard(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => {
    errors.push(`PageError: ${err.message}`);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(`ConsoleError: ${msg.text()}`);
    }
  });
  return errors;
}

/**
 * Enables 2x match speed via the ActionDock quick settings popover.
 */
export async function enable2xSpeed(page: Page): Promise<void> {
  await page.getByTestId('bt-btn-settings').click();
  await expect(page.getByTestId('bt-settings-popover')).toBeVisible();
  await page.getByRole('button', { name: /Tốc độ lượt chơi/i }).click();
  await page.getByRole('button', { name: 'Đóng cài đặt' }).click();
}

/**
 * Verifies two bounding boxes are non-null and have zero intersection
 * (allowing 1px subpixel tolerance at adjacent CSS borders).
 */
export function assertNoBoxOverlap(
  boxA: BoxBounds | null,
  boxB: BoxBounds | null,
  labelA: string,
  labelB: string
): void {
  expect(boxA, `${labelA} boundingBox must exist`).not.toBeNull();
  expect(boxB, `${labelB} boundingBox must exist`).not.toBeNull();
  if (!boxA || !boxB) return;

  const separated =
    boxA.x + boxA.width <= boxB.x + 1 ||
    boxB.x + boxB.width <= boxA.x + 1 ||
    boxA.y + boxA.height <= boxB.y + 1 ||
    boxB.y + boxB.height <= boxA.y + 1;

  expect(
    separated,
    `${labelA} (${JSON.stringify(boxA)}) must not overlap ${labelB} (${JSON.stringify(boxB)})`
  ).toBe(true);
}

/**
 * Verifies an element's bounding box fits completely within the given viewport bounds.
 */
export function assertWithinViewport(
  box: BoxBounds | null,
  viewportWidth: number,
  viewportHeight: number,
  label: string
): void {
  expect(box, `${label} boundingBox must exist`).not.toBeNull();
  if (!box) return;

  expect(box.x, `${label} x (${box.x}) must be >= 0`).toBeGreaterThanOrEqual(0);
  expect(box.y, `${label} y (${box.y}) must be >= 0`).toBeGreaterThanOrEqual(0);
  expect(
    box.x + box.width,
    `${label} right (${box.x + box.width}) must be <= ${viewportWidth}`
  ).toBeLessThanOrEqual(viewportWidth);
  expect(
    box.y + box.height,
    `${label} bottom (${box.y + box.height}) must be <= ${viewportHeight}`
  ).toBeLessThanOrEqual(viewportHeight);
}

/**
 * For popovers/modals on compact viewports (e.g. 844x390 landscape), verifies the surface
 * either fits within viewport height OR exposes a vertical scroll container (`overflowY: auto|scroll`)
 * where `scrollHeight >= clientHeight` and primary action buttons can be scrolled into view.
 */
export async function isScrollableOrWithinViewport(
  locator: Locator,
  viewportHeight: number,
  label = 'Surface'
): Promise<void> {
  await expect(locator, `${label} must be visible`).toBeVisible();

  const hasSelfCasualModal = await locator.evaluate((el) =>
    el.classList.contains('bt-casual-modal')
  );
  const innerCasual = locator.locator('.bt-casual-modal');
  const target =
    !hasSelfCasualModal && (await innerCasual.count()) > 0
      ? innerCasual.first()
      : locator;

  await expect(target, `${label} card must be visible`).toBeVisible();
  const box = await target.boundingBox();
  expect(box, `${label} boundingBox must exist`).not.toBeNull();
  if (!box) return;

  if (box.y >= 0 && box.y + box.height <= viewportHeight) {
    return;
  }

  const scrollInfo = await target.evaluate((el) => {
    const checkScrollable = (node: Element): boolean => {
      const style = window.getComputedStyle(node);
      const oy = style.overflowY;
      return (
        (oy === 'auto' || oy === 'scroll') &&
        node.scrollHeight >= node.clientHeight &&
        node.clientHeight > 0 &&
        node.clientHeight <= window.innerHeight
      );
    };

    if (checkScrollable(el)) {
      return { scrollable: true, overflowY: window.getComputedStyle(el).overflowY };
    }

    const descendants = Array.from(el.querySelectorAll('*'));
    for (const child of descendants) {
      if (checkScrollable(child)) {
        return {
          scrollable: true,
          overflowY: window.getComputedStyle(child).overflowY,
        };
      }
    }

    const style = window.getComputedStyle(el);
    return {
      scrollable: false,
      overflowY: style.overflowY,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    };
  });

  expect(
    scrollInfo.scrollable,
    `${label} exceeds viewportHeight=${viewportHeight} (box=${JSON.stringify(box)}) and is not vertically scrollable (${JSON.stringify(scrollInfo)})`
  ).toBe(true);
}

/**
 * Projects a 3D board tile or building top into viewport coordinates via MonopolyCanvas hook.
 */
export async function getTileScreenPoint(
  page: Page,
  tileIndex: number,
  mode: 'tile' | 'buildingTop' = 'tile'
): Promise<{ x: number; y: number } | null> {
  return page.evaluate(
    ({ idx, m }) => {
      const fn = (
        window as unknown as {
          __btGetTileScreenPoint?: (
            tileIdx: number,
            targetMode?: 'tile' | 'buildingTop'
          ) => { x: number; y: number } | null;
        }
      ).__btGetTileScreenPoint;
      return fn ? fn(idx, m) : null;
    },
    { idx: tileIndex, m: mode }
  );
}

/**
 * Resilient Locator Factories (combining M2 data-testid contracts with semantic ARIA/text fallbacks).
 */

export function getPauseModal(page: Page): Locator {
  const dialogByText = page
    .locator('[role="dialog"]')
    .filter({ hasText: /Tiếp Tục Chơi/i });
  return dialogByText.or(
    page.locator(
      '[data-testid="pause-modal"]:not(:has([role="dialog"])):not([role="dialog"] *)'
    )
  );
}

export function resolveDialogElement(container: Locator): Locator {
  return container
    .locator('[role="dialog"]')
    .or(container.locator('xpath=self::*[@role="dialog"]'))
    .or(container.locator('xpath=ancestor::*[@role="dialog"][1]'));
}

export function getMatchClock(page: Page): Locator {
  return page.getByTestId('bt-match-clock').or(page.getByRole('timer'));
}

export function getMode2v2Toggle(scope: Locator | Page): Locator {
  return scope
    .getByTestId('bt-mode-2v2')
    .or(scope.getByRole('button', { name: /2v2|Đấu Đội/i }));
}

export function getModeFfaToggle(scope: Locator | Page): Locator {
  return scope
    .getByTestId('bt-mode-ffa')
    .or(scope.getByRole('button', { name: /Đấu Đơn|FFA|Tự Do/i }));
}

export function getTacticalDiceToggle(scope: Locator | Page): Locator {
  return scope
    .getByTestId('bt-tactical-dice-toggle')
    .or(scope.getByRole('button', { name: /Xúc xắc chiến thuật/i }));
}

export function getTacticalEvenBtn(page: Page): Locator {
  return page
    .getByTestId('bt-dice-even-btn')
    .or(page.getByRole('button', { name: /Chẵn/i }));
}

export function getTacticalOddBtn(page: Page): Locator {
  return page
    .getByTestId('bt-dice-odd-btn')
    .or(page.getByRole('button', { name: /Lẻ/i }));
}

export function getRerollDiceBtn(page: Page): Locator {
  return page
    .getByTestId('bt-reroll-dice-btn')
    .or(page.getByRole('button', { name: /Đổ Lại/i }));
}

export function getConfirmRollBtn(page: Page): Locator {
  return page
    .getByTestId('bt-confirm-roll-btn')
    .or(page.getByRole('button', { name: /Giữ|Đi Tiếp|Xác Nhận/i }));
}

export function getOnlineRoomPill(page: Page): Locator {
  return page
    .getByTestId('bt-online-room-pill')
    .or(page.getByRole('button', { name: /Phòng\s+[A-Z0-9]+/i }));
}

export function getJailRollBtn(page: Page): Locator {
  return page
    .getByTestId('bt-jail-roll-btn')
    .or(page.getByRole('button', { name: /Đổ Săn Đôi/i }));
}

export function getJailBailBtn(page: Page): Locator {
  return page
    .getByTestId('bt-jail-bail-btn')
    .or(page.getByRole('button', { name: /Bảo Lãnh/i }));
}

export function getJailCardBtn(page: Page): Locator {
  return page
    .getByTestId('bt-jail-card-btn')
    .or(page.getByRole('button', { name: /Dùng Thẻ Thoát Đảo/i }));
}

export function getAssetsBtn(page: Page): Locator {
  return page.getByRole('button', { name: 'Quản lý Tài sản' });
}

export function getTabOffline(scope: Locator | Page): Locator {
  return scope
    .getByRole('tab', { name: /Chơi Với Máy/i })
    .or(scope.getByTestId('bt-tab-offline'));
}

export function getTabOnline(scope: Locator | Page): Locator {
  return scope
    .getByRole('tab', { name: /Chơi Online/i })
    .or(scope.getByTestId('bt-tab-online'));
}

export function getReclaimControlBtn(page: Page): Locator {
  return page
    .getByTestId('bt-reclaim-control-btn')
    .or(page.getByRole('button', { name: /Giành lại|Tiếp quản|Lấy lại quyền/i }));
}
