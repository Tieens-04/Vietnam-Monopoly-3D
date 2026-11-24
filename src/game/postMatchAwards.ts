import type { PlayerMatchStats, PostMatchAward } from './onlineTypes';
import { formatBusinessTourCompact } from './rules';
import type { PlayerState } from './types';

const RENT_AWARD_THRESHOLD = 100_000;

type AwardStatKey = Exclude<keyof PlayerMatchStats, 'totalRentCollected'>;

interface AwardCandidate {
  player: PlayerState;
  value: number;
}

interface AwardDefinition {
  id: PostMatchAward['id'];
  icon: string;
  title: string;
  subtitle: string;
  statKey: AwardStatKey;
  minThreshold: number;
  formatValue: (value: number) => string;
}

const AWARD_DEFINITIONS: Record<PostMatchAward['id'], AwardDefinition> = {
  CHUA_DAO_HOANG: {
    id: 'CHUA_DAO_HOANG',
    icon: '🏝️',
    title: 'Chúa Đảo Hoang',
    subtitle: 'Ghé thăm Đảo Hoang nhiều nhất trận',
    statKey: 'jailVisits',
    minThreshold: 1,
    formatValue: (value) => `${value} lần ra đảo`,
  },
  TRUM_THU_HO: {
    id: 'TRUM_THU_HO',
    icon: '💰',
    title: 'Trùm Thu Họ',
    subtitle: 'Cú thu tiền thuê một lượt cao nhất',
    statKey: 'maxSingleRentCollected',
    minThreshold: RENT_AWARD_THRESHOLD,
    formatValue: (value) => formatBusinessTourCompact(value),
  },
  THANH_PHA_HOAI: {
    id: 'THANH_PHA_HOAI',
    icon: '💣',
    title: 'Thánh Phá Hoại',
    subtitle: 'Tích cực mua đứt và tung thẻ công kích',
    statKey: 'sabotageCount',
    minThreshold: 1,
    formatValue: (value) => `${value} pha công kích`,
  },
  NHA_TAI_TRO_VANG: {
    id: 'NHA_TAI_TRO_VANG',
    icon: '💸',
    title: 'Nhà Tài Trợ Vàng',
    subtitle: 'Đóng góp tiền thuê nhiều nhất cả bàn',
    statKey: 'totalRentPaid',
    minThreshold: RENT_AWARD_THRESHOLD,
    formatValue: (value) => formatBusinessTourCompact(value),
  },
  PHUOT_THU: {
    id: 'PHUOT_THU',
    icon: '✈️',
    title: 'Phượt Thủ Xuyên Việt',
    subtitle: 'Bay du lịch nhiều chuyến nhất trận',
    statKey: 'worldTourFlights',
    minThreshold: 1,
    formatValue: (value) => `${value} chuyến bay`,
  },
};

function readSanitizedStat(
  statsByPlayerId: Record<number, PlayerMatchStats>,
  playerId: number,
  key: AwardStatKey
): number {
  const raw = statsByPlayerId?.[playerId]?.[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, raw) : 0;
}

function pickBestCandidate(
  candidates: ReadonlyArray<PlayerState>,
  statsByPlayerId: Record<number, PlayerMatchStats>,
  statKey: AwardStatKey,
  minThreshold: number
): AwardCandidate | null {
  let best: AwardCandidate | null = null;

  for (const player of candidates) {
    const value = readSanitizedStat(statsByPlayerId, player.id, statKey);
    if (value < minThreshold) continue;

    // Deterministic tie-breaking: lowest player.id always wins equal metric values.
    if (
      best === null ||
      value > best.value ||
      (value === best.value && player.id < best.player.id)
    ) {
      best = { player, value };
    }
  }

  return best;
}

function buildAward(definition: AwardDefinition, winner: AwardCandidate): PostMatchAward {
  return {
    id: definition.id,
    icon: definition.icon,
    title: definition.title,
    subtitle: definition.subtitle,
    playerId: winner.player.id,
    playerName: winner.player.name,
    playerColor: winner.player.color,
    valueLabel: definition.formatValue(winner.value),
  };
}

/**
 * Creates a fresh zero-initialized per-player match statistics record.
 */
export function createEmptyPlayerMatchStats(): PlayerMatchStats {
  return {
    jailVisits: 0,
    maxSingleRentCollected: 0,
    totalRentCollected: 0,
    totalRentPaid: 0,
    sabotageCount: 0,
    worldTourFlights: 0,
  };
}

/**
 * Computes up to 4 humorous post-match awards from final player states and match stats.
 * Skips categories that fail their qualifying threshold and breaks ties by lowest player.id.
 */
export function computePostMatchAwards(
  players: ReadonlyArray<PlayerState>,
  statsByPlayerId: Record<number, PlayerMatchStats>
): PostMatchAward[] {
  if (players.length === 0) return [];

  const awards: PostMatchAward[] = [];

  for (const id of ['CHUA_DAO_HOANG', 'TRUM_THU_HO', 'THANH_PHA_HOAI'] as const) {
    const def = AWARD_DEFINITIONS[id];
    const winner = pickBestCandidate(players, statsByPlayerId, def.statKey, def.minThreshold);
    if (winner) {
      awards.push(buildAward(def, winner));
    }
  }

  const rentCollectorWinnerId =
    awards.find((award) => award.id === 'TRUM_THU_HO')?.playerId ?? null;
  const rentPayerDef = AWARD_DEFINITIONS.NHA_TAI_TRO_VANG;
  const distinctCandidates =
    rentCollectorWinnerId === null
      ? players
      : players.filter((player) => player.id !== rentCollectorWinnerId);

  // Prefer awarding Nhà Tài Trợ Vàng to someone other than Trùm Thu Họ when another player qualifies.
  const rentPayerWinner =
    pickBestCandidate(
      distinctCandidates,
      statsByPlayerId,
      rentPayerDef.statKey,
      rentPayerDef.minThreshold
    ) ??
    pickBestCandidate(
      players,
      statsByPlayerId,
      rentPayerDef.statKey,
      rentPayerDef.minThreshold
    );

  if (rentPayerWinner) {
    awards.push(buildAward(rentPayerDef, rentPayerWinner));
  } else {
    const flightDef = AWARD_DEFINITIONS.PHUOT_THU;
    const flightWinner = pickBestCandidate(
      players,
      statsByPlayerId,
      flightDef.statKey,
      flightDef.minThreshold
    );
    if (flightWinner) {
      awards.push(buildAward(flightDef, flightWinner));
    }
  }

  return awards;
}
