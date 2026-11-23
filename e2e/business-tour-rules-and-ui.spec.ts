import { expect, Locator, Page, test } from '@playwright/test';
import {
  attachZeroErrorGuard,
  enable2xSpeed,
  getConfirmRollBtn,
  getJailBailBtn,
  getJailCardBtn,
  getJailRollBtn,
  getMatchClock,
  getMode2v2Toggle,
  getModeFfaToggle,
  getPauseModal,
  getRerollDiceBtn,
  getTabOffline,
  getTabOnline,
  getTacticalDiceToggle,
  getTacticalEvenBtn,
  getTacticalOddBtn,
  getTileScreenPoint,
  getAssetsBtn,
} from './helpers';

async function readRerollDiceSum(rerollBtn: Locator): Promise<number> {
  const page = rerollBtn.page();
  const fixedAncestor = rerollBtn.locator('xpath=ancestor::div[contains(@class,"fixed")][1]');
  const container =
    (await fixedAncestor.count().catch(() => 0)) > 0
      ? fixedAncestor
      : rerollBtn.locator('xpath=..');

  const scopedAttrCandidates = [
    rerollBtn,
    rerollBtn.locator('xpath=ancestor::*[@data-dice-sum][1]'),
    container.locator('[data-dice-sum]').first(),
  ];
  for (const cand of scopedAttrCandidates) {
    if ((await cand.count().catch(() => 0)) > 0) {
      const attrVal = await cand.getAttribute('data-dice-sum').catch(() => null);
      if (attrVal && /^\d+$/.test(attrVal.trim())) {
        const parsed = Number(attrVal.trim());
        if (parsed >= 2 && parsed <= 12) return parsed;
      }
    }
  }

  const raw = (await container.innerText()).replace(/\s+/g, ' ').trim();

  const parseFromText = (text: string): number | null => {
    const eqMatch = text.match(/(\d+)\s*\+\s*(\d+)\s*=\s*(\d+)/);
    if (eqMatch) {
      const sum = Number(eqMatch[3]);
      if (sum >= 2 && sum <= 12) return sum;
    }
    const plusMatch = text.match(/(\d+)\s*\+\s*(\d+)/);
    if (plusMatch) {
      const sum = Number(plusMatch[1]) + Number(plusMatch[2]);
      if (sum >= 2 && sum <= 12) return sum;
    }
    const pairMatch = text.match(/\b([1-6])\s*[-–&,]\s*([1-6])\b/);
    if (pairMatch) {
      const sum = Number(pairMatch[1]) + Number(pairMatch[2]);
      if (sum >= 2 && sum <= 12) return sum;
    }
    for (const labeledMatch of text.matchAll(
      /(?:Tổng(?:\s*điểm)?|Điểm|Kết\s*quả|Giữ(?:\s*(?:&\s*Đi|Kết\s*Quả|Nguyên))?|Đi(?:\s*Tiếp)?|Xác\s*nhận(?:\s*đi)?|Bước)[:\s(]*(\d+)(?!\d)(?!\s*(?:s\b|giây|lượt))/gi
    )) {
      const val = Number(labeledMatch[1]);
      if (val >= 2 && val <= 12) return val;
    }
    for (const stepMatch of text.matchAll(/(\d+)\s*bước/gi)) {
      const val = Number(stepMatch[1]);
      if (val >= 2 && val <= 12) return val;
    }
    return null;
  };

  const direct = parseFromText(raw);
  if (direct !== null) return direct;

  const diceFacesSum = await container
    .evaluate((el) => {
      const labelRe = /Đổ\s*Lại|Lượt|Tài\s*Sản/i;
      const numericRe = /^\d+$/;
      const dieRe = /^[1-6]$/;
      const wordRe = /\p{L}/u;
      const leafTags = new Set(['SPAN', 'DIV', 'B', 'STRONG', 'P', 'EM', 'I', 'SMALL']);

      const candidates: Array<{
        node: Element;
        text: string;
        excluded: boolean;
        detachedCandidate: boolean;
      }> = [];
      const stack: Array<{ node: Node; exitingBadge: boolean; exitPendingCharge: boolean }> = [];
      for (let i = el.childNodes.length - 1; i >= 0; i--) {
        stack.push({ node: el.childNodes[i], exitingBadge: false, exitPendingCharge: false });
      }

      let pendingChargeLabel = false;

      while (stack.length > 0) {
        const frame = stack.pop()!;
        const cur = frame.node;

        if (frame.exitingBadge) {
          pendingChargeLabel = frame.exitPendingCharge;
          continue;
        }

        if (cur.nodeType === Node.TEXT_NODE) {
          const txt = (cur.textContent || '').trim();
          if (!txt) continue;
          const stripped = txt.replace(/\d+\s*\/\s*\d+/g, '');
          if (
            labelRe.test(txt) &&
            (!/\d/.test(txt) ||
              (/\d+\s*\/\s*\d+/.test(txt) && !/\d/.test(stripped) && txt.trim().endsWith(':')))
          ) {
            pendingChargeLabel = true;
          } else if (wordRe.test(txt) || (/\d+\s*\/\s*\d+/.test(txt) && !txt.trim().endsWith(':'))) {
            pendingChargeLabel = false;
          }
          continue;
        }

        if (cur.nodeType !== Node.ELEMENT_NODE) continue;
        const elem = cur as Element;
        const tag = elem.tagName.toUpperCase();
        if (tag === 'BUTTON' || tag === 'SVG' || tag === 'SCRIPT' || tag === 'STYLE') continue;

        if (leafTags.has(tag) && elem.children.length === 0) {
          const txt = (elem.textContent || '').trim();
          if (!txt) continue;

          if (numericRe.test(txt)) {
            let rule1Excluded = false;
            let anc = elem.parentElement;
            while (anc && anc !== el) {
              if (anc.tagName.toUpperCase() !== 'BUTTON') {
                const ancParts: string[] = [];
                let ancNumLeaves = 0;
                const subStack: Node[] = [anc];
                while (subStack.length > 0) {
                  const s = subStack.pop()!;
                  if (s.nodeType === Node.TEXT_NODE) {
                    const stxt = (s.textContent || '').trim();
                    if (stxt) ancParts.push(stxt);
                  } else if (s.nodeType === Node.ELEMENT_NODE) {
                    const se = s as Element;
                    const st = se.tagName.toUpperCase();
                    if (st === 'BUTTON' || st === 'SVG' || st === 'SCRIPT' || st === 'STYLE') continue;
                    if (leafTags.has(st) && se.children.length === 0) {
                      const stxt = (se.textContent || '').trim();
                      if (numericRe.test(stxt)) ancNumLeaves++;
                    }
                    for (let ci = se.childNodes.length - 1; ci >= 0; ci--) {
                      subStack.push(se.childNodes[ci]);
                    }
                  }
                }
                const ancText = ancParts.join(' ').replace(/\s+/g, ' ').trim();
                const strippedAncText = ancText.replace(/\d+\s*\/\s*\d+/g, '');
                const isAncRatioBadge =
                  ancNumLeaves === 2 &&
                  /\d+\s*\/\s*\d+/.test(ancText) &&
                  labelRe.test(ancText) &&
                  !/\d/.test(strippedAncText);
                if ((labelRe.test(ancText) && ancNumLeaves <= 1) || isAncRatioBadge) {
                  rule1Excluded = true;
                  break;
                }
              }
              anc = anc.parentElement;
            }

            const detachedCandidate = !rule1Excluded && pendingChargeLabel;
            if (rule1Excluded || detachedCandidate) {
              pendingChargeLabel = false;
            }
            candidates.push({
              node: elem,
              text: txt,
              excluded: rule1Excluded,
              detachedCandidate,
            });
          } else {
            const stripped = txt.replace(/\d+\s*\/\s*\d+/g, '');
            if (
              labelRe.test(txt) &&
              (!/\d/.test(txt) ||
                (/\d+\s*\/\s*\d+/.test(txt) && !/\d/.test(stripped) && txt.trim().endsWith(':')))
            ) {
              pendingChargeLabel = true;
            } else if (wordRe.test(txt) || (/\d+\s*\/\s*\d+/.test(txt) && !txt.trim().endsWith(':'))) {
              pendingChargeLabel = false;
            }
          }
          continue;
        }

        let isBadgeWrapper = false;
        const elemParts: string[] = [];
        let elemNumLeaves = 0;
        const scanStack: Node[] = [elem];
        while (scanStack.length > 0) {
          const s = scanStack.pop()!;
          if (s.nodeType === Node.TEXT_NODE) {
            const stxt = (s.textContent || '').trim();
            if (stxt) elemParts.push(stxt);
          } else if (s.nodeType === Node.ELEMENT_NODE) {
            const se = s as Element;
            const st = se.tagName.toUpperCase();
            if (st === 'BUTTON' || st === 'SVG' || st === 'SCRIPT' || st === 'STYLE') continue;
            if (leafTags.has(st) && se.children.length === 0) {
              const stxt = (se.textContent || '').trim();
              if (numericRe.test(stxt)) elemNumLeaves++;
            }
            for (let ci = se.childNodes.length - 1; ci >= 0; ci--) {
              scanStack.push(se.childNodes[ci]);
            }
          }
        }
        const elemText = elemParts.join(' ').replace(/\s+/g, ' ').trim();
        const strippedElemText = elemText.replace(/\d+\s*\/\s*\d+/g, '');
        const isElemRatioBadge =
          elemNumLeaves === 2 &&
          /\d+\s*\/\s*\d+/.test(elemText) &&
          labelRe.test(elemText) &&
          !/\d/.test(strippedElemText);
        let exitPendingAfterBadge = false;
        if ((labelRe.test(elemText) && elemNumLeaves === 1) || isElemRatioBadge) {
          isBadgeWrapper = true;
          exitPendingAfterBadge = isElemRatioBadge && elemText.trim().endsWith(':');
        } else if (labelRe.test(elemText) && elemNumLeaves === 0) {
          if (!/\d/.test(elemText)) {
            pendingChargeLabel = true;
            continue;
          } else if (/\d+\s*\/\s*\d+/.test(elemText) && !/\d/.test(strippedElemText)) {
            pendingChargeLabel = elemText.trim().endsWith(':') || (labelRe.test(elemText) && /:/.test(elemText));
            continue;
          }
        }

        if (isBadgeWrapper) {
          stack.push({ node: elem, exitingBadge: true, exitPendingCharge: exitPendingAfterBadge });
        }
        for (let ci = elem.childNodes.length - 1; ci >= 0; ci--) {
          stack.push({ node: elem.childNodes[ci], exitingBadge: false, exitPendingCharge: false });
        }
      }

      let nonExcludedDiceCount = 0;
      for (let i = 0; i < candidates.length; i++) {
        if (!candidates[i].excluded && dieRe.test(candidates[i].text)) {
          nonExcludedDiceCount++;
        }
      }

      const kept: Array<{ node: Element; text: string }> = [];
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        if (c.excluded) continue;
        if (c.detachedCandidate) {
          const isDieDigit = dieRe.test(c.text);
          const othersRemaining = isDieDigit ? nonExcludedDiceCount - 1 : nonExcludedDiceCount;
          if (othersRemaining >= 2) {
            if (isDieDigit) nonExcludedDiceCount--;
            continue;
          }
        }
        kept.push({ node: c.node, text: c.text });
      }

      for (let i = 0; i < kept.length - 1; i++) {
        const a = kept[i];
        const b = kept[i + 1];
        if (
          a.node.parentElement &&
          a.node.parentElement === b.node.parentElement &&
          dieRe.test(a.text) &&
          dieRe.test(b.text)
        ) {
          return Number(a.text) + Number(b.text);
        }
      }

      for (let i = 0; i < kept.length - 1; i++) {
        const a = kept[i];
        const b = kept[i + 1];
        if (dieRe.test(a.text) && dieRe.test(b.text)) {
          return Number(a.text) + Number(b.text);
        }
      }

      return null;
    })
    .catch(() => null);
  if (diceFacesSum !== null) return diceFacesSum;

  const cue = page.getByTestId('bt-landing-cue');
  if (await cue.isVisible().catch(() => false)) {
    const cueRaw = (await cue.innerText()).replace(/\s+/g, ' ').trim();
    const fromCue = parseFromText(cueRaw);
    if (fromCue !== null) return fromCue;
  }

  const globalAttr = page.locator('[data-dice-sum]:visible').first();
  if ((await globalAttr.count().catch(() => 0)) > 0) {
    const attrVal = await globalAttr.getAttribute('data-dice-sum').catch(() => null);
    if (attrVal && /^\d+$/.test(attrVal.trim())) {
      const parsed = Number(attrVal.trim());
      if (parsed >= 2 && parsed <= 12) return parsed;
    }
  }

  throw new Error(`Could not parse rolled dice sum from REROLL_DECISION UI text: "${raw}"`);
}

async function dismissDecisionModalsOnce(page: Page): Promise<boolean> {
  const buyModal = page.getByTestId('buy-decision-modal');
  const upgModal = page.getByTestId('upgrade-decision-modal');
  const buyoutModal = page.getByTestId('buyout-decision-modal');
  const champModal = page.getByTestId('championship-decision-modal');
  const targetModal = page.getByTestId('tactical-card-target-modal');
  const wtModal = page.getByTestId('world-tour-modal');
  const cardModal = page.getByTestId('luck-card-modal');
  const assetModal = page.getByTestId('asset-management-modal');

  if (await buyModal.isVisible().catch(() => false)) {
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();
    return true;
  }
  if (await upgModal.isVisible().catch(() => false)) {
    await upgModal.getByRole('button', { name: 'Giữ Nguyên' }).click();
    return true;
  }
  if (await buyoutModal.isVisible().catch(() => false)) {
    await buyoutModal.getByRole('button', { name: 'Bỏ Qua' }).click();
    return true;
  }
  if (await champModal.isVisible().catch(() => false)) {
    await champModal.getByRole('button', { name: 'Bỏ Qua' }).click();
    return true;
  }
  if (await targetModal.isVisible().catch(() => false)) {
    await targetModal.getByRole('button', { name: 'Bỏ Qua' }).click();
    return true;
  }
  if (await wtModal.isVisible().catch(() => false)) {
    await wtModal.getByRole('button', { name: /Đổ Xúc Xắc Thường/i }).click();
    return true;
  }
  if (await cardModal.isVisible().catch(() => false)) {
    const btn = cardModal.getByRole('button', { name: /Tiếp Tục Ngay/i });
    if (await btn.isVisible().catch(() => false)) await btn.click();
    else await page.waitForTimeout(200);
    return true;
  }
  if (await assetModal.isVisible().catch(() => false)) {
    const closeBtn = assetModal.getByRole('button', { name: 'Đóng', exact: true });
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
      return true;
    }

    const autoSellBtn = assetModal.getByRole('button', {
      name: 'Bán Tự Động Tối Ưu',
      exact: true,
    });
    const confirmSaleBtn = assetModal.getByRole('button', {
      name: 'Xác Nhận Bán & Thanh Toán',
      exact: true,
    });
    const bankruptBtn = assetModal.getByRole('button', { name: 'Phá Sản', exact: true });

    if (
      (await autoSellBtn.isVisible().catch(() => false)) &&
      (await autoSellBtn.isEnabled().catch(() => false))
    ) {
      await autoSellBtn.click();
      await page.waitForTimeout(100);
      if (
        (await confirmSaleBtn.isVisible().catch(() => false)) &&
        (await confirmSaleBtn.isEnabled().catch(() => false))
      ) {
        await confirmSaleBtn.click();
      }
    } else if (
      (await confirmSaleBtn.isVisible().catch(() => false)) &&
      (await confirmSaleBtn.isEnabled().catch(() => false))
    ) {
      await confirmSaleBtn.click();
    } else if (
      (await bankruptBtn.isVisible().catch(() => false)) &&
      (await bankruptBtn.isEnabled().catch(() => false))
    ) {
      await bankruptBtn.click();
    }
    await page.waitForTimeout(200);
    return true;
  }
  return false;
}

async function waitForHumanRollReady(page: Page): Promise<void> {
  const rollBtn = page.getByTestId('bt-roll-dice-btn');
  const bailBtn = getJailBailBtn(page);
  const jailCardBtn = getJailCardBtn(page);

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if ((await page.locator('body').getAttribute('data-state').catch(() => null)) === 'gameover') {
      throw new Error('Match reached gameover while waiting for human roll ready');
    }
    if (await rollBtn.isVisible().catch(() => false)) return;
    if (await bailBtn.isVisible().catch(() => false)) {
      if (await bailBtn.isEnabled().catch(() => false)) {
        await bailBtn.click();
      } else if (
        (await jailCardBtn.isVisible().catch(() => false)) &&
        (await jailCardBtn.isEnabled().catch(() => false))
      ) {
        await jailCardBtn.click();
      } else {
        await getJailRollBtn(page).click();
      }
      await page.waitForTimeout(150);
    } else if (!(await dismissDecisionModalsOnce(page))) {
      await page.waitForTimeout(200);
    }
  }
  await expect(rollBtn).toBeVisible();
}

async function resolveAnyLandingModal(page: Page): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await page.getByTestId('bt-roll-dice-btn').isVisible().catch(() => false)) return;
    if (await getJailBailBtn(page).isVisible().catch(() => false)) return;
    if ((await page.locator('body').getAttribute('data-state').catch(() => null)) === 'gameover') return;

    if (!(await dismissDecisionModalsOnce(page))) {
      await page.waitForTimeout(250);
    }
  }
}

test.describe('Business Tour Rules Alignment & UI/Online Parity', () => {
  test('BUG-04a: 20-min match clock displays MM:SS, ticks down, and freezes while Offline PauseModal is open', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);

    await page.goto('/?autostart=1&players=2&hotseat=1');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');

    const clock = getMatchClock(page);
    await expect(clock).toBeVisible();
    const initialText = (await clock.innerText()).trim();
    expect(initialText).toMatch(/\b(19|20):\d{2}\b/);

    await page.waitForTimeout(1_400);
    const tickedText = (await clock.innerText()).trim();
    expect(tickedText).toMatch(/\b(19|20):\d{2}\b/);
    expect(tickedText).not.toBe(initialText);

    // Pause freezes match clock
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'paused');
    const pausedText1 = (await clock.innerText()).trim();
    await page.waitForTimeout(1_400);
    const pausedText2 = (await clock.innerText()).trim();
    expect(pausedText2).toBe(pausedText1);

    await page.keyboard.press('Escape');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    expect(errors).toEqual([]);
  });

  test('BUG-04b: Match clock expiry triggers TIME_LIMIT Sudden Death ranked by Net Worth', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);

    await page.goto('/?autostart=1&players=2&hotseat=1&matchTime=12&dice=1-2,1-3');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await enable2xSpeed(page);

    const buyModal = page.getByTestId('buy-decision-modal');
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await expect(buyModal).toContainText('Đà Lạt');
    await buyModal.getByRole('button', { name: /Mua Ngay/i }).click();

    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await expect(buyModal).toContainText('Vịnh Hạ Long');
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    await expect(page.locator('body')).toHaveAttribute('data-state', 'gameover', {
      timeout: 22_000,
    });
    const victoryModal = page.getByTestId('victory-modal');
    await expect(victoryModal).toBeVisible();
    await expect(victoryModal).toContainText(/Hết giờ|20:00|Tài Sản/i);

    // P1 & P2 both have 2,000,000 Net Worth; P2 has 2,000,000 cash > P1's 1,930,000 cash -> P2 ranks #1
    const rank1 = page.getByTestId('victory-rank-row-1');
    await expect(rank1).toContainText('Người Chơi 2');
    await expect(rank1).toContainText('Vô địch');
    await expect(rank1).toContainText('2 000 000');

    expect(errors).toEqual([]);
  });

  test('BUG-05a: 2v2 Doubles lobby toggle, team HUD badges & teammate rent/buyout exemption', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);

    // P0 (Team 0) -> 1-2 Đà Lạt (buy 1 Nhà = 120K)
    // P1 (Team 1) -> 2-3 Ninh Bình (skip)
    // P2 (Team 0, P0's teammate!) -> 1-2 Đà Lạt (zero rent, zero buyout modal!)
    await page.goto('/?hotseat=1&dice=1-2,2-3,1-2');
    const lobby = page.getByTestId('bt-casual-lobby');
    await expect(lobby).toBeVisible();

    const mode2v2 = getMode2v2Toggle(lobby);
    await expect(mode2v2).toBeVisible();
    await mode2v2.click();
    await expect(mode2v2).toHaveAttribute('aria-pressed', 'true');
    await expect(lobby.locator('input[id^="player-name-"]')).toHaveCount(4);

    await lobby.locator('[data-start="true"]').click();
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await enable2xSpeed(page);

    await expect(page.getByTestId('player-card-0')).toContainText(/Đội\s*(A|Xanh|1)/i);
    await expect(page.getByTestId('player-card-1')).toContainText(/Đội\s*(B|Đỏ|2)/i);
    await expect(page.getByTestId('player-card-2')).toContainText(/Đội\s*(A|Xanh|1)/i);
    await expect(page.getByTestId('player-card-3')).toContainText(/Đội\s*(B|Đỏ|2)/i);

    const buyModal = page.getByTestId('buy-decision-modal');

    // P0 buys Đà Lạt (1 Nhà = 120K -> cash 1 880 000)
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: /1 Nhà/i }).click();
    await buyModal.getByRole('button', { name: /Mua Ngay/i }).click();

    // P1 skips Ninh Bình
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    // P2 (Team 0 teammate) lands on Đà Lạt -> NO rent charged, NO buyout modal!
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await expect(page.getByTestId('buyout-decision-modal')).toHaveCount(0);
    await expect(page.getByTestId('player-card-0')).toContainText('1 880 000');
    await expect(page.getByTestId('player-card-2')).toContainText('2 000 000');

    expect(errors).toEqual([]);
  });

  test('BUG-05b: 2v2 Doubles combined Resort Monopoly victory (P0 2 Resorts + P2 2 Resorts)', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);

    // Verified mod-32 sequence (0 doubles, 0 Chance, 0 owned opponent tiles):
    // R1 P0: 1-3 -> 4 (Vịnh Hạ Long BUY) | R2 P1: 1-2 -> 3 (skip) | R3 P2: 3-4 -> 7 (skip) | R4 P3: 2-3 -> 5 (skip)
    // R5 P0: 4-6 -> 14 (Đảo Lý Sơn BUY)   | R6 P1: 1-2 -> 6 (skip) | R7 P2: 5-6 -> 18 (Côn Đảo BUY) | R8 P3: 1-3 -> 9 (skip)
    // R9 P0: 1-2 -> 17 (skip)             | R10 P1: 1-2 -> 9 (skip)| R11 P2: 3-4 -> 25 (Phú Quốc BUY -> 4/4 Team 0 RESORT_MONOPOLY!)
    await page.goto(
      '/?hotseat=1&dice=1-3,1-2,3-4,2-3,4-6,1-2,5-6,1-3,1-2,1-2,3-4'
    );
    const lobby = page.getByTestId('bt-casual-lobby');
    await expect(lobby).toBeVisible();
    await getMode2v2Toggle(lobby).click();
    await lobby.locator('[data-start="true"]').click();

    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await enable2xSpeed(page);

    const buyModal = page.getByTestId('buy-decision-modal');
    const actions: Array<{ tile: string; buy: boolean }> = [
      { tile: 'Vịnh Hạ Long', buy: true },
      { tile: 'Đà Lạt', buy: false },
      { tile: 'Hội An', buy: false },
      { tile: 'Ninh Bình', buy: false },
      { tile: 'Đảo Lý Sơn', buy: true },
      { tile: 'Huế', buy: false },
      { tile: 'Côn Đảo', buy: true },
      { tile: 'Quy Nhơn', buy: false },
      { tile: 'Buôn Ma Thuột', buy: false },
      { tile: 'Quy Nhơn', buy: false },
      { tile: 'Phú Quốc', buy: true },
    ];

    for (const step of actions) {
      await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
      await page.getByTestId('bt-roll-dice-btn').click();
      await expect(buyModal).toBeVisible();
      await expect(buyModal).toContainText(step.tile);
      if (step.buy) {
        await buyModal.getByRole('button', { name: /Mua Ngay/i }).click();
      } else {
        await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();
      }
    }

    await expect(page.locator('body')).toHaveAttribute('data-state', 'gameover');
    const victoryModal = page.getByTestId('victory-modal');
    await expect(victoryModal).toBeVisible();
    await expect(victoryModal).toContainText('Độc Quyền Du Lịch');
    await expect(victoryModal).toContainText(/Đội\s*(A|Xanh)/i);

    expect(errors).toEqual([]);
  });

  test('BUG-10: Tactical Dice defaults OFF in lobby, toggles ON, and supports Chẵn / Lẻ / Đổ Lại', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);

    // Default match (Tactical Dice OFF): Chẵn / Lẻ controls MUST NOT render
    await page.goto('/?autostart=1&players=2&hotseat=1');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await expect(getTacticalEvenBtn(page)).toHaveCount(0);
    await expect(getTacticalOddBtn(page)).toHaveCount(0);

    // Start 2-player Human vs Bot match with Tactical Dice toggled ON
    await page.goto('/?players=2');
    const lobby = page.getByTestId('bt-casual-lobby');
    await expect(lobby).toBeVisible();

    const tacticalToggle = getTacticalDiceToggle(lobby);
    await expect(tacticalToggle).toBeVisible();
    await expect(tacticalToggle).toHaveAttribute('aria-pressed', 'false');
    await tacticalToggle.click();
    await expect(tacticalToggle).toHaveAttribute('aria-pressed', 'true');

    await lobby.locator('[data-start="true"]').click();
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await enable2xSpeed(page);

    const evenBtn = getTacticalEvenBtn(page);
    const oddBtn = getTacticalOddBtn(page);
    const rerollBtn = getRerollDiceBtn(page);
    const confirmBtn = getConfirmRollBtn(page);

    // AWAIT_ROLL (Human P1 Turn 1): initial charges = 3; select Chẵn and roll -> REROLL_DECISION
    await expect(evenBtn).toBeVisible();
    await expect(evenBtn).toContainText('3');
    await expect(oddBtn).toContainText('3');
    await evenBtn.click();
    await page.getByTestId('bt-roll-dice-btn').click();

    await expect(rerollBtn).toBeVisible();
    await expect(confirmBtn).toBeVisible();
    const evenSum = await readRerollDiceSum(rerollBtn);
    expect(evenSum % 2, `Chẵn roll sum (${evenSum}) must be even`).toBe(0);
    await expect(rerollBtn).toContainText('2');

    // Reroll once -> REROLL_DICE immediately commits movement (ROLLING_DICE -> MOVING_TOKEN -> tile resolution)
    await rerollBtn.click();
    await resolveAnyLandingModal(page);

    // Wait for Human P1's next roll: shared evenOddCharges decremented 3 -> 2
    await waitForHumanRollReady(page);
    await expect(evenBtn).toBeVisible();
    await expect(evenBtn).toContainText('2');
    await expect(oddBtn).toContainText('2');

    // Select Lẻ and roll -> REROLL_DECISION must show odd sum and decremented reroll charge (2 -> 1)
    await oddBtn.click();
    await page.getByTestId('bt-roll-dice-btn').click();

    await expect(rerollBtn).toBeVisible();
    await expect(confirmBtn).toBeVisible();
    const oddSum = await readRerollDiceSum(rerollBtn);
    expect(oddSum % 2, `Lẻ roll sum (${oddSum}) must be odd`).toBe(1);
    await expect(rerollBtn).toContainText('1');
    await confirmBtn.click();
    await resolveAnyLandingModal(page);

    // Wait for Human P1's following roll: shared evenOddCharges decremented 2 -> 1
    await waitForHumanRollReady(page);
    await expect(oddBtn).toContainText('1');
    await expect(evenBtn).toContainText('1');
    expect(errors).toEqual([]);
  });

  test('BUG-14: ch-10 Birthday forces full 25K payout via DEBT_RESOLUTION asset sale when cash < 25K', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);

    await page.goto('/?autostart=1&players=2&hotseat=1&cash=250000&dice=1-2,2-3,4-5&cards=ch-10');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await enable2xSpeed(page);

    const buyModal = page.getByTestId('buy-decision-modal');

    // Roll 1 (P1): Đà Lạt -> skip (cash stays 250K)
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    // Roll 2 (P2): Ninh Bình -> buy 2 Nhà (90K + 150K = 240K -> P2 cash = 10K!)
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: /2 Nhà/i }).click();
    await buyModal.getByRole('button', { name: /Mua Ngay/i }).click();

    // Roll 3 (P1): Cơ Hội (12) -> ch-10 (+25K from P2)
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    const cardModal = page.getByTestId('luck-card-modal');
    await expect(cardModal).toBeVisible();
    await expect(cardModal).toContainText('Mừng Sinh Nhật Chủ Tịch');
    await cardModal.getByRole('button', { name: /Tiếp Tục Ngay/i }).click();

    // P2 enters forced DEBT_RESOLUTION to pay full 25K
    const debtModal = page.getByTestId('asset-management-modal');
    await expect(debtModal).toBeVisible();
    await expect(debtModal).toContainText('25 000');
    await debtModal.getByRole('button', { name: /Ninh Bình/i }).click();
    await debtModal.getByRole('button', { name: /Xác Nhận Bán & Thanh Toán/i }).click();

    await expect(debtModal).toHaveCount(0);
    await expect(page.getByTestId('player-card-0')).toContainText('275 000');
    await expect(page.getByTestId('player-card-1')).toContainText('225 000');

    expect(errors).toEqual([]);
  });

  test('BUG-18: ch-14 POWER_OUTAGE stays active on owner landing and clears only on opponent landing', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);

    await page.goto(
      '/?autostart=1&players=2&hotseat=1&dice=1-2,2-3,1-2,3-4,3-3,5-6,2-4,4-4,2-4&cards=ch-5,ch-14'
    );
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await enable2xSpeed(page);

    const buyModal = page.getByTestId('buy-decision-modal');
    const upgModal = page.getByTestId('upgrade-decision-modal');
    const cardModal = page.getByTestId('luck-card-modal');
    const targetModal = page.getByTestId('tactical-card-target-modal');
    const inspector = page.getByTestId('tile-inspector-card');

    // Roll 1 (P1): Đà Lạt -> skip
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    // Roll 2 (P2): Ninh Bình -> buy Lv0
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: /Đất trống/i }).click();
    await buyModal.getByRole('button', { name: /Mua Ngay/i }).click();

    // Roll 3 (P1): Huế -> skip
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    // Roll 4 (P2): Cơ Hội -> ch-5 (TP. HCM) -> skip
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(cardModal).toBeVisible();
    await cardModal.getByRole('button', { name: /Tiếp Tục Ngay/i }).click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    // Roll 5 (P1): Cơ Hội -> ch-14 POWER_OUTAGE -> target Ninh Bình
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(cardModal).toBeVisible();
    await cardModal.getByRole('button', { name: /Tiếp Tục Ngay/i }).click();
    await expect(targetModal).toBeVisible();
    await targetModal.getByRole('button', { name: /Ninh Bình/i }).click();

    // Roll 6 (P1): Hải Phòng -> skip
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    // Roll 7 (P2): lands on OWN Ninh Bình (5) -> skip upgrade -> Outage MUST remain!
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(upgModal).toBeVisible();
    await upgModal.getByRole('button', { name: 'Giữ Nguyên' }).click();

    const ninhBinhPt1 = await getTileScreenPoint(page, 5);
    expect(ninhBinhPt1).not.toBeNull();
    await page.mouse.click(ninhBinhPt1!.x, ninhBinhPt1!.y);
    await expect(inspector).toBeVisible();
    await expect(inspector).toContainText(/Đang mất điện/i);
    await expect(inspector).toContainText('0K');
    await inspector.getByRole('button', { name: 'Đóng thông tin ô đất' }).click();

    // Roll 8 (P1): TP. HCM -> skip
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    // Roll 9 (P1): opponent lands on Ninh Bình (5) -> pays 0K rent, then Outage clears!
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    const buyoutModal = page.getByTestId('buyout-decision-modal');
    await expect(buyoutModal).toBeVisible();
    await buyoutModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    await expect(page.getByTestId('player-card-0')).toContainText('2 300 000'); // 2M + 300K START salary, 0K rent!

    const ninhBinhPt2 = await getTileScreenPoint(page, 5);
    expect(ninhBinhPt2).not.toBeNull();
    await page.mouse.click(ninhBinhPt2!.x, ninhBinhPt2!.y);
    await expect(inspector).toBeVisible();
    await expect(inspector).not.toContainText(/Đang mất điện/i);

    expect(errors).toEqual([]);
  });

  test('BUG-31 & BUG-33: StartModal preserves 4 player configs on ?players=2 and prevents Enter/Space hijack', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);

    await page.goto('/?players=2');
    const lobby = page.getByTestId('bt-casual-lobby');
    await expect(lobby).toBeVisible();
    await expect(page.locator('body')).toHaveAttribute('data-state', 'title');

    // BUG-33: clicking 4 Người expands to all 4 player inputs (not sliced to 2)
    await lobby.getByRole('button', { name: '4 Người' }).click();
    await expect(lobby.locator('#player-name-0')).toBeVisible();
    await expect(lobby.locator('#player-name-1')).toBeVisible();
    await expect(lobby.locator('#player-name-2')).toBeVisible();
    await expect(lobby.locator('#player-name-3')).toBeVisible();

    // BUG-31: Enter/Space on Online tab switches tab without starting offline game
    const onlineTab = getTabOnline(lobby);
    await onlineTab.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'title');
    await expect(page.getByTestId('bt-create-room-btn')).toBeVisible();

    // Space on Offline tab switches back without starting game
    const offlineTab = getTabOffline(lobby);
    await offlineTab.focus();
    await page.keyboard.press('Space');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'title');

    // Space on 4 Người toggle selects 4 players cleanly, then Start CTA launches 4-player match
    const fourBtn = lobby.getByRole('button', { name: '4 Người' });
    await fourBtn.focus();
    await page.keyboard.press('Space');
    await lobby.locator('[data-start="true"]').click();

    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await expect(page.getByTestId('player-card-0')).toBeVisible();
    await expect(page.getByTestId('player-card-1')).toBeVisible();
    await expect(page.getByTestId('player-card-2')).toBeVisible();
    await expect(page.getByTestId('player-card-3')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('BUG-32: AssetManagementModal ignores Space roll and auto-closes on phase/turn transition', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);

    await page.goto('/?autostart=1&players=2&hotseat=1&dice=1-2,1-3,2-4');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await enable2xSpeed(page);

    const buyModal = page.getByTestId('buy-decision-modal');

    // P1 buys Đà Lạt so Tài Sản button is available
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: /Mua Ngay/i }).click();

    // P2 skips Vịnh Hạ Long -> back to P1 AWAIT_ROLL
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    // P1 opens AssetManagementModal during AWAIT_ROLL
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await getAssetsBtn(page).click();
    const assetsModal = page.getByTestId('asset-management-modal');
    await expect(assetsModal).toBeVisible();

    // Move focus off the auto-focused ✕ close button (useDialogFocusTrap) onto the non-button
    // dialog container so Space tests App.tsx's showAssetsModal Space-roll guard without activating ✕.
    const assetsDialog = assetsModal.locator('[role="dialog"]');
    await assetsDialog.focus();
    await expect(assetsDialog).toBeFocused();

    // Space must NOT roll dice while AssetManagementModal is open
    await page.keyboard.press('Space');
    await page.waitForTimeout(350);
    await expect(assetsModal).toBeVisible();
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();

    // Wait for 45s turn timer to auto-advance out of AWAIT_ROLL -> modal MUST auto-close without occluding decision UI
    await expect(assetsModal).toHaveCount(0, { timeout: 55_000 });
    expect(errors).toEqual([]);
  });

  test('BUG-34 & BUG-35: Online mode locks 2× speed and PauseModal shows copy-link toast without hiding decision UI', async ({
    browser,
  }) => {
    const hostContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    const guestContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    const hostErrors = attachZeroErrorGuard(hostPage);
    const guestErrors = attachZeroErrorGuard(guestPage);

    await hostPage.goto('/');
    await getTabOnline(hostPage).click();
    await hostPage.getByRole('button', { name: '2 Người' }).click();
    await hostPage.getByTestId('bt-create-room-btn').click();

    const roomCodeEl = hostPage.getByTestId('bt-online-room-code');
    await expect(roomCodeEl).toBeVisible();
    const roomCode = (await roomCodeEl.innerText()).trim();

    await guestPage.goto(`/?room=${roomCode}`);
    await expect(guestPage.getByTestId('bt-join-room-btn')).toBeEnabled();
    await guestPage.getByTestId('bt-join-room-btn').click();
    await expect(hostPage.getByText('Danh Sách Ghế Ngồi (2/2 Người)')).toBeVisible();

    await hostPage.getByTestId('bt-online-start-btn').click();
    await expect(hostPage.locator('body')).toHaveAttribute('data-state', 'playing');
    await expect(guestPage.locator('body')).toHaveAttribute('data-state', 'playing');

    // BUG-34: 2× speed toggle is disabled and 2× badge is absent in Online mode
    await hostPage.getByTestId('bt-btn-settings').click();
    const settingsPop = hostPage.getByTestId('bt-settings-popover');
    await expect(settingsPop).toBeVisible();
    await expect(settingsPop.getByRole('button', { name: /Tốc độ lượt chơi/i })).toBeDisabled();
    await expect(hostPage.getByTestId('bt-btn-settings').getByText('2×')).toHaveCount(0);
    await hostPage.getByRole('button', { name: 'Đóng cài đặt' }).click();

    // BUG-35: Open PauseModal in Online mode, test Copy Link toast & non-occluding live WebGL
    await hostPage.getByTestId('bt-btn-pause').click();
    const hostPauseModal = getPauseModal(hostPage);
    await expect(hostPauseModal).toBeVisible();

    // While Host PauseModal is STILL OPEN: Host's ActionDock roll control remains visible
    await expect(hostPage.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await hostPauseModal.getByRole('button', { name: /Copy Link Mời/i }).click();
    await expect(hostPauseModal).toContainText(/Đã Chép/i);

    await hostPauseModal.getByRole('button', { name: /Tiếp Tục Chơi/i }).click();
    await expect(hostPauseModal).toHaveCount(0);
    await expect(hostPage.getByTestId('bt-roll-dice-btn')).toBeVisible();

    // Open PauseModal on guestPage while Host rolls -> drives live WebSocket 3D animation on Guest
    await guestPage.getByTestId('bt-btn-pause').click();
    const guestPauseModal = getPauseModal(guestPage);
    await expect(guestPauseModal).toBeVisible();

    await guestPage.waitForTimeout(100);
    const guestCanvas = guestPage.locator('canvas[data-rendered-frames]');
    await expect(guestCanvas).toBeVisible();
    const framesBefore = Number(await guestCanvas.getAttribute('data-rendered-frames'));

    await hostPage.getByTestId('bt-roll-dice-btn').click();

    await expect
      .poll(
        async () => Number(await guestCanvas.getAttribute('data-rendered-frames')),
        { timeout: 6_000 }
      )
      .toBeGreaterThanOrEqual(framesBefore + 3);

    // Guest PauseModal stayed open/responsive without freezing WebGL or blocking sync
    await expect(guestPauseModal).toBeVisible();
    await guestPauseModal.getByRole('button', { name: /Tiếp Tục Chơi/i }).click();
    await expect(guestPauseModal).toHaveCount(0);
    await expect(guestPage.locator('body')).toHaveAttribute('data-state', 'playing');

    expect(hostErrors).toEqual([]);
    expect(guestErrors).toEqual([]);
    await hostContext.close();
    await guestContext.close();
  });

  test('BUG-36: RulebookModal, StartModal Online hint & Resort TileInspectorCard outage 0K copy parity', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);

    await page.goto('/');
    const lobby = page.getByTestId('bt-casual-lobby');
    await expect(lobby).toBeVisible();

    // StartModal hides Space hint on Online tab
    await expect(lobby).toContainText(/Phím Space Đổ xúc xắc/i);
    await getTabOnline(lobby).click();
    await expect(lobby).not.toContainText(/Phím Space Đổ xúc xắc/i);

    // RulebookModal reflects accurate Business Tour rules + kept economic variants
    await lobby.getByRole('button', { name: 'Luật Chơi' }).click();
    const rulebook = page.getByTestId('rulebook-modal');
    await expect(rulebook).toBeVisible();
    await expect(rulebook).toContainText('Đảo Hoang');
    await expect(rulebook).toContainText(/Thuế 10%|10%/);
    await expect(rulebook).toContainText('50K');
    await expect(rulebook).toContainText('150K');
    await expect(rulebook).toContainText('400K');
    await expect(rulebook).toContainText('1M');
    await expect(rulebook).toContainText('0K');
    await expect(rulebook).toContainText('100%');
    await expect(rulebook).toContainText(/2v2|Đấu Đội/i);
    await expect(rulebook).toContainText(/20 phút|20:00/i);
    await expect(rulebook).toContainText(/Xúc xắc chiến thuật/i);
    await expect(rulebook).not.toContainText(/nâng cấp.*từ xa|Đặc Quyền Ô Bắt Đầu/i);

    // Resort POWER_OUTAGE TileInspectorCard displays 0K
    await page.goto('/?autostart=1&players=2&hotseat=1&dice=1-2,1-3,4-5&cards=ch-14');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await enable2xSpeed(page);

    const buyModal = page.getByTestId('buy-decision-modal');
    const cardModal = page.getByTestId('luck-card-modal');
    const targetModal = page.getByTestId('tactical-card-target-modal');

    // Roll 1 (P1): Đà Lạt -> skip
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    // Roll 2 (P2): Vịnh Hạ Long (Resort 4) -> buy
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await expect(buyModal).toContainText('Vịnh Hạ Long');
    await buyModal.getByRole('button', { name: /Mua Ngay/i }).click();

    // Roll 3 (P1): Cơ Hội -> ch-14 -> target Vịnh Hạ Long
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(cardModal).toBeVisible();
    await cardModal.getByRole('button', { name: /Tiếp Tục Ngay/i }).click();
    await expect(targetModal).toBeVisible();
    await targetModal.getByRole('button', { name: /Vịnh Hạ Long/i }).click();

    const resortPt = await getTileScreenPoint(page, 4);
    expect(resortPt).not.toBeNull();
    await page.mouse.click(resortPt!.x, resortPt!.y);

    const inspector = page.getByTestId('tile-inspector-card');
    await expect(inspector).toBeVisible();
    await expect(inspector).toContainText('Vịnh Hạ Long');
    await expect(inspector).toContainText(/Đang mất điện/i);
    await expect(inspector).toContainText('0K');

    expect(errors).toEqual([]);
  });

  test('BUG-14 (Tier 5): Offline ch-10 queues 2 property-owning debtors sequentially, settles sale then bankruptcy, and restores doubles turn', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);

    // P0 (250K): 1-3 -> 4 (skip)
    // P1 (250K): 2-3 -> 5 (buy 2 Nhà = 240K -> 10K cash)
    // P2 (250K): 2-4 -> 6 (buy 2 Nhà = 250K -> 0K cash)
    // P0 (250K): 4-4 (doubles!) -> 12 (ch-10: +25K from P1 & P2 -> both enter pendingDebtQueue!)
    // After P1 sells Ninh Bình & pays 25K (cash -> 225K) and P2 declares bankruptcy (pays 250K -> P0 cash 525K),
    // P0's doubles turn restores cleanly and P0 rolls 1-2 -> 15 Nha Trang!
    await page.goto(
      '/?autostart=1&players=3&hotseat=1&cash=250000&dice=1-3,2-3,2-4,4-4,1-2&cards=ch-10'
    );
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await enable2xSpeed(page);

    const buyModal = page.getByTestId('buy-decision-modal');
    const cardModal = page.getByTestId('luck-card-modal');
    const debtModal = page.getByTestId('asset-management-modal');

    // Roll 1 (P0): Vịnh Hạ Long -> skip
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await expect(buyModal).toContainText('Vịnh Hạ Long');
    await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();

    // Roll 2 (P1): Ninh Bình -> buy 2 Nhà (240K -> 10K cash left)
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await expect(buyModal).toContainText('Ninh Bình');
    await buyModal.getByRole('button', { name: /2 Nhà/i }).click();
    await buyModal.getByRole('button', { name: /Mua Ngay/i }).click();

    // Roll 3 (P2): Huế -> buy 2 Nhà (250K -> 0K cash left)
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await expect(buyModal).toContainText('Huế');
    await buyModal.getByRole('button', { name: /2 Nhà/i }).click();
    await buyModal.getByRole('button', { name: /Mua Ngay/i }).click();

    // Roll 4 (P0): 4-4 doubles -> Cơ Hội (12) -> ch-10
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(cardModal).toBeVisible();
    await expect(cardModal).toContainText('Mừng Sinh Nhật Chủ Tịch');
    await cardModal.getByRole('button', { name: /Tiếp Tục Ngay/i }).click();

    // Debtor #1 (P1): Ninh Bình debt resolution via SELL_AND_PAY_DEBT
    await expect(debtModal).toBeVisible();
    await expect(debtModal).toContainText('Người Chơi 2');
    await expect(debtModal).toContainText('Ninh Bình');
    await expect(debtModal).toContainText('25 000');
    await debtModal.getByRole('button', { name: /Ninh Bình/i }).click();
    await debtModal.getByRole('button', { name: /Xác Nhận Bán & Thanh Toán/i }).click();

    // Debtor #2 (P2): queue immediately shifts to P2 (Huế) -> settle via DECLARE_BANKRUPTCY
    await expect(debtModal).toBeVisible();
    await expect(debtModal).toContainText('Người Chơi 3');
    await expect(debtModal).toContainText('Huế');
    await expect(debtModal).toContainText('25 000');
    await debtModal.getByRole('button', { name: 'Phá Sản' }).click();

    await expect(debtModal).toHaveCount(0);
    await expect(page.getByTestId('player-card-0')).toContainText('525 000');
    await expect(page.getByTestId('player-card-1')).toContainText('225 000');
    await expect(page.getByTestId('player-card-2')).toContainText(/Phá sản/i);

    // P0's doubles turn is restored! Roll 1-2 -> lands on Nha Trang
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await expect(buyModal).toContainText('Nha Trang');

    expect(errors).toEqual([]);
  });

  test('BUG-18 (Tier 5 TEAMS_2V2): ch-14 POWER_OUTAGE stays active when teammate lands and clears only on opponent landing', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);

    // R1 P0 (Team 0): 3-4 -> 7 Hội An (buy Đất trống 120K -> 1.88M)
    // R2 P1 (Team 1): 6-6 -> 12 Cơ Hội (ch-14 POWER_OUTAGE -> target Hội An) + R3 P1 bonus: 1-2 -> 15 (skip)
    // R4 P2 (Team 0 teammate): 1-3 -> 4 (skip)
    // R5 P3 (Team 1 opponent): 1-2 -> 3 (skip)
    // R6 P0: 1-3 -> 11 (skip)
    // R7 P1: 1-2 -> 18 (skip)
    // R8 P2 (Team 0 teammate): 1-2 -> 7 Hội An -> 0 rent, NO buyout, outage MUST STAY!
    // R9 P3 (Team 1 opponent): 1-3 -> 7 Hội An -> 0K rent, buyout modal -> Bỏ Qua -> outage CLEARS!
    await page.goto(
      '/?hotseat=1&dice=3-4,6-6,1-2,1-3,1-2,1-3,1-2,1-2,1-3&cards=ch-14'
    );
    const lobby = page.getByTestId('bt-casual-lobby');
    await expect(lobby).toBeVisible();
    await getMode2v2Toggle(lobby).click();
    await lobby.locator('[data-start="true"]').click();

    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await enable2xSpeed(page);

    const buyModal = page.getByTestId('buy-decision-modal');
    const cardModal = page.getByTestId('luck-card-modal');
    const targetModal = page.getByTestId('tactical-card-target-modal');
    const inspector = page.getByTestId('tile-inspector-card');

    // R1 P0 -> Hội An (buy Đất trống)
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(buyModal).toBeVisible();
    await expect(buyModal).toContainText('Hội An');
    await buyModal.getByRole('button', { name: /Đất trống/i }).click();
    await buyModal.getByRole('button', { name: /Mua Ngay/i }).click();

    // R2 P1 -> ch-14 on Hội An
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(cardModal).toBeVisible();
    await cardModal.getByRole('button', { name: /Tiếp Tục Ngay/i }).click();
    await expect(targetModal).toBeVisible();
    await targetModal.getByRole('button', { name: /Hội An/i }).click();

    // R3..R7 skips
    for (const expectedTile of ['Nha Trang', 'Vịnh Hạ Long', 'Đà Lạt', 'Phan Thiết', 'Côn Đảo']) {
      await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
      await page.getByTestId('bt-roll-dice-btn').click();
      await expect(buyModal).toBeVisible();
      await expect(buyModal).toContainText(expectedTile);
      await buyModal.getByRole('button', { name: 'Bỏ Qua' }).click();
    }

    // R8 P2 (Team 0 teammate) lands on Hội An (7): zero rent, zero buyout, outage MUST remain!
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await page.getByTestId('bt-roll-dice-btn').click();
    await expect(page.getByTestId('bt-roll-dice-btn')).toBeVisible();
    await expect(page.getByTestId('buyout-decision-modal')).toHaveCount(0);
    await expect(page.getByTestId('player-card-2')).toContainText('2 000 000');

    const hoiAnPt1 = await getTileScreenPoint(page, 7);
    expect(hoiAnPt1).not.toBeNull();
    await page.mouse.click(hoiAnPt1!.x, hoiAnPt1!.y);
    await expect(inspector).toBeVisible();
    await expect(inspector).toContainText('Hội An');
    await expect(inspector).toContainText(/Đang mất điện/i);
    await expect(inspector).toContainText('0K');
    await inspector.getByRole('button', { name: 'Đóng thông tin ô đất' }).click();

    // R9 P3 (Team 1 opponent) lands on Hội An (7): 0K rent + outage CLEARS!
    await page.getByTestId('bt-roll-dice-btn').click();
    const buyoutModal = page.getByTestId('buyout-decision-modal');
    await expect(buyoutModal).toBeVisible();
    await buyoutModal.getByRole('button', { name: 'Bỏ Qua' }).click();
    await expect(page.getByTestId('player-card-3')).toContainText('2 000 000');
    await expect(page.getByTestId('player-card-0')).toContainText('1 880 000');

    const hoiAnPt2 = await getTileScreenPoint(page, 7);
    expect(hoiAnPt2).not.toBeNull();
    await page.mouse.click(hoiAnPt2!.x, hoiAnPt2!.y);
    await expect(inspector).toBeVisible();
    await expect(inspector).toContainText('Hội An');
    await expect(inspector).not.toContainText(/Đang mất điện/i);

    expect(errors).toEqual([]);
  });

  test('BUG-35 & BUG-41 (Tier 5 Online): 2v2 canStart guard in lobby and Escape/KeyP priority over AssetManagementModal & PauseModal', async ({
    browser,
  }) => {
    const hostContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const guestContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    const hostErrors = attachZeroErrorGuard(hostPage);
    const guestErrors = attachZeroErrorGuard(guestPage);

    await hostPage.goto('/');
    await getTabOnline(hostPage).click();
    await getMode2v2Toggle(hostPage).click();
    await hostPage.getByRole('button', { name: /Bù Bot AI nếu thiếu người/i }).click();
    await hostPage.getByTestId('bt-create-room-btn').click();

    const roomCodeEl = hostPage.getByTestId('bt-online-room-code');
    await expect(roomCodeEl).toBeVisible();
    const roomCode = (await roomCodeEl.innerText()).trim();

    // 1 human, 2v2, fillBots=false -> Start disabled + hint shown
    const startBtn = hostPage.getByTestId('bt-online-start-btn');
    await expect(startBtn).toBeDisabled();
    await expect(hostPage.getByTestId('bt-online-start-hint')).toBeVisible();

    // Guest joins (now 2 humans, 2v2, fillBots=false) -> Start MUST STILL be disabled!
    await guestPage.goto(`/?room=${roomCode}`);
    await expect(guestPage.getByTestId('bt-join-room-btn')).toBeEnabled();
    await guestPage.getByTestId('bt-join-room-btn').click();
    await expect(hostPage.getByText('Danh Sách Ghế Ngồi (2/4 Người)')).toBeVisible();
    await expect(startBtn).toBeDisabled();
    await expect(hostPage.getByTestId('bt-online-start-hint')).toBeVisible();

    // Toggling fillBots ON enables Start for 2v2; toggling OFF disables again
    const inRoomFillBotsBtn = hostPage.getByRole('button', { name: /Đang Tắt|Đang Bật/i }).first();
    await inRoomFillBotsBtn.click();
    await expect(startBtn).toBeEnabled();
    await expect(hostPage.getByTestId('bt-online-start-hint')).toHaveCount(0);
    await inRoomFillBotsBtn.click();
    await expect(startBtn).toBeDisabled();

    // Switch to FFA 2 Người so Host & Guest start a 2-human Online match cleanly
    await getModeFfaToggle(hostPage).click();
    await hostPage.getByRole('button', { name: '2 Người' }).click();
    await expect(startBtn).toBeEnabled();
    await startBtn.click();

    await expect(hostPage.locator('body')).toHaveAttribute('data-state', 'playing');
    await expect(guestPage.locator('body')).toHaveAttribute('data-state', 'playing');

    // Helper to resolve non-buy modals on a page while advancing until target condition
    const resolveTransientModal = async (p: Page): Promise<boolean> => {
      if (await p.getByTestId('luck-card-modal').isVisible().catch(() => false)) {
        const btn = p.getByTestId('luck-card-modal').getByRole('button', { name: /Tiếp Tục Ngay/i });
        if (await btn.isVisible().catch(() => false)) {
          await btn.click();
          return true;
        }
      }
      if (await p.getByTestId('tactical-card-target-modal').isVisible().catch(() => false)) {
        await p.getByTestId('tactical-card-target-modal').getByRole('button', { name: 'Bỏ Qua' }).click();
        return true;
      }
      if (await p.getByTestId('championship-decision-modal').isVisible().catch(() => false)) {
        await p.getByTestId('championship-decision-modal').getByRole('button', { name: 'Bỏ Qua' }).click();
        return true;
      }
      if (await p.getByTestId('world-tour-modal').isVisible().catch(() => false)) {
        await p.getByTestId('world-tour-modal').getByRole('button', { name: /Đổ Xúc Xắc Thường/i }).click();
        return true;
      }
      if (await p.getByTestId('buyout-decision-modal').isVisible().catch(() => false)) {
        await p.getByTestId('buyout-decision-modal').getByRole('button', { name: 'Bỏ Qua' }).click();
        return true;
      }
      return false;
    };

    // Drive turns until Host reaches BUY_DECISION so we test Online PauseModal over decision modal & then buy 1 tile
    const buyDeadline = Date.now() + 45_000;
    let hostBought = false;
    while (Date.now() < buyDeadline && !hostBought) {
      if (await hostPage.getByTestId('buy-decision-modal').isVisible().catch(() => false)) {
        // Test Online PauseModal (z-45) opened over BuyDecisionModal -> Escape closes PauseModal FIRST!
        await hostPage.keyboard.press('Escape');
        const pauseModal = getPauseModal(hostPage);
        await expect(pauseModal).toBeVisible();
        await expect(hostPage.getByTestId('buy-decision-modal')).toBeVisible();
        await hostPage.keyboard.press('Escape');
        await expect(pauseModal).toHaveCount(0);
        await expect(hostPage.getByTestId('buy-decision-modal')).toBeVisible();

        await hostPage.getByTestId('buy-decision-modal').getByRole('button', { name: /Mua Ngay/i }).click();
        hostBought = true;
        break;
      }
      if (await resolveTransientModal(hostPage)) continue;
      if (await hostPage.getByTestId('bt-roll-dice-btn').isVisible().catch(() => false)) {
        await hostPage.getByTestId('bt-roll-dice-btn').click();
        await hostPage.waitForTimeout(350);
        continue;
      }
      if (await hostPage.getByTestId('bt-jail-bail-btn').isVisible().catch(() => false)) {
        await hostPage.getByTestId('bt-jail-bail-btn').click();
        await hostPage.waitForTimeout(350);
        continue;
      }
      if (await guestPage.getByTestId('buy-decision-modal').isVisible().catch(() => false)) {
        await guestPage.getByTestId('buy-decision-modal').getByRole('button', { name: 'Bỏ Qua' }).click();
        continue;
      }
      if (await resolveTransientModal(guestPage)) continue;
      if (await guestPage.getByTestId('bt-roll-dice-btn').isVisible().catch(() => false)) {
        await guestPage.getByTestId('bt-roll-dice-btn').click();
        await guestPage.waitForTimeout(350);
        continue;
      }
      if (await guestPage.getByTestId('bt-jail-bail-btn').isVisible().catch(() => false)) {
        await guestPage.getByTestId('bt-jail-bail-btn').click();
        await guestPage.waitForTimeout(350);
        continue;
      }
      await hostPage.waitForTimeout(250);
    }
    expect(hostBought).toBe(true);

    // Advance until Host is back in AWAIT_ROLL with Tài Sản (1) button visible
    const returnDeadline = Date.now() + 45_000;
    while (Date.now() < returnDeadline) {
      if (
        (await hostPage.getByTestId('bt-roll-dice-btn').isVisible().catch(() => false)) &&
        (await getAssetsBtn(hostPage).isVisible().catch(() => false))
      ) {
        break;
      }
      if (await hostPage.getByTestId('buy-decision-modal').isVisible().catch(() => false)) {
        await hostPage.getByTestId('buy-decision-modal').getByRole('button', { name: 'Bỏ Qua' }).click();
      } else if (await hostPage.getByTestId('upgrade-decision-modal').isVisible().catch(() => false)) {
        await hostPage.getByTestId('upgrade-decision-modal').getByRole('button', { name: 'Giữ Nguyên' }).click();
      } else if (await resolveTransientModal(hostPage)) {
        // resolved
      } else if (await hostPage.getByTestId('bt-roll-dice-btn').isVisible().catch(() => false)) {
        await hostPage.getByTestId('bt-roll-dice-btn').click();
      } else if (await guestPage.getByTestId('buy-decision-modal').isVisible().catch(() => false)) {
        await guestPage.getByTestId('buy-decision-modal').getByRole('button', { name: 'Bỏ Qua' }).click();
      } else if (await resolveTransientModal(guestPage)) {
        // resolved
      } else if (await guestPage.getByTestId('bt-roll-dice-btn').isVisible().catch(() => false)) {
        await guestPage.getByTestId('bt-roll-dice-btn').click();
      } else if (await guestPage.getByTestId('bt-jail-bail-btn').isVisible().catch(() => false)) {
        await guestPage.getByTestId('bt-jail-bail-btn').click();
      }
      await hostPage.waitForTimeout(250);
    }

    const assetsBtn = getAssetsBtn(hostPage);
    await expect(assetsBtn).toBeVisible();

    // Escape closes non-debt AssetManagementModal WITHOUT opening PauseModal
    await assetsBtn.click();
    const assetsModal = hostPage.getByTestId('asset-management-modal');
    await expect(assetsModal).toBeVisible();
    await hostPage.keyboard.press('Escape');
    await expect(assetsModal).toHaveCount(0);
    await expect(getPauseModal(hostPage)).toHaveCount(0);

    // KeyP closes non-debt AssetManagementModal WITHOUT opening PauseModal, then KeyP opens PauseModal cleanly
    await assetsBtn.click();
    await expect(assetsModal).toBeVisible();
    await assetsModal.locator('[role="dialog"]').focus();
    await hostPage.keyboard.press('KeyP');
    await expect(assetsModal).toHaveCount(0);
    await expect(getPauseModal(hostPage)).toHaveCount(0);

    await hostPage.keyboard.press('KeyP');
    await expect(getPauseModal(hostPage)).toBeVisible();
    await hostPage.keyboard.press('Escape');
    await expect(getPauseModal(hostPage)).toHaveCount(0);

    expect(hostErrors).toEqual([]);
    expect(guestErrors).toEqual([]);
    await hostContext.close();
    await guestContext.close();
  });

  test('Festival x2 lobby toggle defaults to OFF and announces 3 Festival cities when enabled', async ({
    page,
  }) => {
    const errors = attachZeroErrorGuard(page);
    await page.goto('/');

    const lobby = page.getByTestId('bt-casual-lobby');
    await expect(lobby).toBeVisible();

    const festivalToggle = lobby.getByTestId('bt-festival-toggle');
    await expect(festivalToggle).toBeVisible();
    await expect(festivalToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(festivalToggle).toContainText('Đang Tắt');

    // Verify Rulebook explains both National Cup progressive multiplier and optional Festival x2
    await lobby.getByRole('button', { name: 'Luật Chơi' }).click();
    const rulebook = page.getByTestId('rulebook-modal');
    await expect(rulebook).toBeVisible();
    await expect(rulebook).toContainText('Cúp Quốc Gia');
    await expect(rulebook).toContainText('Lễ Hội Đầu Mùa');
    await page.keyboard.press('Escape');
    await expect(rulebook).toHaveCount(0);

    // 1. Default OFF start -> 1 initial log, no Festival cities
    await lobby.locator('[data-start="true"]').click();
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await page.getByTestId('bt-btn-settings').click();
    await page.getByRole('button', { name: /Nhật Ký Ván Đấu/i }).click();
    await expect(page.getByText('Nhật Ký Trận Đấu (1)')).toBeVisible();
    await expect(page.getByText(/Lễ Hội Đầu Mùa/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Đóng nhật ký trận đấu' }).click();

    // 2. Return to Lobby, toggle Festival x2 ON -> 2 initial logs including 3 Festival cities
    await page.getByTestId('bt-btn-pause').click();
    await getPauseModal(page).getByRole('button', { name: 'Sảnh Chờ Mới' }).click();
    await expect(lobby).toBeVisible();

    await festivalToggle.click();
    await expect(festivalToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(festivalToggle).toContainText('Đang Bật');

    await lobby.locator('[data-start="true"]').click();
    await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
    await page.getByTestId('bt-btn-settings').click();
    await page.getByRole('button', { name: /Nhật Ký Ván Đấu/i }).click();
    await expect(page.getByText('Nhật Ký Trận Đấu (2)')).toBeVisible();
    await expect(page.getByText(/🎉 Lễ Hội Đầu Mùa \(×2 tiền thuê suốt ván\):/)).toBeVisible();

    expect(errors).toEqual([]);
  });
});
