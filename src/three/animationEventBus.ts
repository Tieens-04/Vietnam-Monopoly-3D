import { TacticalDiceChoice } from '../game/types';

export type AnimationCategory =
  | 'character'
  | 'dice'
  | 'building'
  | 'economy'
  | 'camera'
  | 'event'
  | 'endgame';

export type AnimationCuePayload =
  | { kind: 'DICE_ANTICIPATION'; die1: number; die2: number; choice: TacticalDiceChoice }
  | { kind: 'DICE_SETTLE_FX'; isDoubles: boolean; choice: TacticalDiceChoice }
  | {
      kind: 'TOKEN_REACTION';
      playerId: number;
      reaction: 'cash_gain' | 'cash_pay' | 'buy_proud' | 'bankrupt' | 'jail';
    }
  | {
      kind: 'BUILDING_EVENT';
      tileIndex: number;
      effect:
        | 'buy'
        | 'upgrade'
        | 'landmark'
        | 'buyout'
        | 'sell'
        | 'quake'
        | 'outage'
        | 'shield_on'
        | 'shield_break'
        | 'championship'
        | 'monopoly_wave';
      colorHex?: string;
    }
  | { kind: 'CHANCE_CARD_3D_FLIP'; cardId: string }
  | { kind: 'WORLD_TOUR_FLIGHT'; playerId: number; fromTile: number; toTile: number }
  | { kind: 'ENDGAME_CEREMONY'; winnerIds: number[]; teamMode: boolean }
  | { kind: 'ENDGAME_CEREMONY_CLEAR' }
  | {
      kind: 'CAMERA_FOCUS';
      shot: 'auto' | 'overview' | 'transaction' | 'landmark' | 'special_event' | 'victory_podium';
      tileIndex?: number;
      shake?: boolean;
    };

export type AnimationCueListener = (cue: AnimationCuePayload) => void;

export interface AnimationEventDispatcher {
  subscribe: (listener: AnimationCueListener) => () => void;
  subscribeKind: <K extends AnimationCuePayload['kind']>(
    kind: K,
    listener: (cue: Extract<AnimationCuePayload, { kind: K }>) => void
  ) => () => void;
  dispatch: (cue: AnimationCuePayload) => void;
  getListenerCount: () => number;
  clear: () => void;
  dispose: () => void;
}

/**
 * Non-blocking cue bus connecting gameplay events to visual-only animations.
 * Never returns Promises or awaits completion, keeping turn progression and
 * server-authoritative timing strictly decoupled from 3D visuals.
 */
export function createAnimationEventDispatcher(): AnimationEventDispatcher {
  const listeners = new Set<AnimationCueListener>();
  let disposed = false;

  const subscribe = (listener: AnimationCueListener): (() => void) => {
    if (disposed) {
      return () => {};
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const subscribeKind = <K extends AnimationCuePayload['kind']>(
    kind: K,
    listener: (cue: Extract<AnimationCuePayload, { kind: K }>) => void
  ): (() => void) => {
    return subscribe((cue) => {
      if (cue.kind === kind) {
        listener(cue as Extract<AnimationCuePayload, { kind: K }>);
      }
    });
  };

  const dispatch = (cue: AnimationCuePayload): void => {
    if (disposed || listeners.size === 0) return;
    const snapshot = Array.from(listeners);
    for (const listener of snapshot) {
      try {
        listener(cue);
      } catch {
        // Isolate non-fatal visual listener errors so gameplay state never stalls
      }
    }
  };

  const clear = (): void => {
    listeners.clear();
  };

  const dispose = (): void => {
    disposed = true;
    listeners.clear();
  };

  return {
    subscribe,
    subscribeKind,
    dispatch,
    getListenerCount: () => listeners.size,
    clear,
    dispose,
  };
}
