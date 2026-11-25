import React from 'react';
import {
  Banknote,
  Building2,
  Dices,
  Flame,
  HandCoins,
  Palmtree,
  Shield,
  Sparkles,
  Trophy,
  Zap,
} from 'lucide-react';
import type { BoardTauntKind } from '../game/onlineTypes';

/**
 * Tactile physical-style toggle switch visual used inside semantic <button aria-pressed={...}> controls.
 */
export const ToggleSwitch: React.FC<{
  checked: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md';
}> = ({ checked, disabled = false, size = 'md' }) => {
  const trackSize = size === 'sm' ? 'h-5 w-9' : 'h-5.5 w-10';
  const thumbSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const translateClass =
    size === 'sm'
      ? checked
        ? 'translate-x-4'
        : 'translate-x-0.5'
      : checked
        ? 'translate-x-5'
        : 'translate-x-0.5';

  return (
    <>
      <span className="sr-only">{checked ? 'Đang Bật' : 'Đang Tắt'}</span>
      <span
        aria-hidden="true"
        className={`relative inline-flex shrink-0 items-center rounded-full border transition-colors duration-150 ${trackSize} ${
          checked
            ? 'bg-emerald-600 border-emerald-700'
            : 'bg-[#d8d2c5] border-[#c4bcae]'
        } ${disabled ? 'opacity-60' : ''}`}
      >
        <span
          className={`inline-block rounded-full bg-white shadow-xs transition-transform duration-150 ${thumbSize} ${translateClass}`}
        />
      </span>
    </>
  );
};

/**
 * Crisp circular progress pips indicating ownership in a color group or resort set.
 */
export const GroupProgressDots: React.FC<{
  ownedCount: number;
  totalCount: number;
  colorHex: string;
}> = ({ ownedCount, totalCount, colorHex }) => {
  const safeTotal = Math.max(1, totalCount);
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center gap-1"
    >
      {Array.from({ length: safeTotal }, (_, i) => {
        const filled = i < ownedCount;
        return (
          <span
            key={i}
            className="h-2.5 w-2.5 rounded-full border transition-colors"
            style={{
              backgroundColor: filled ? colorHex : 'transparent',
              borderColor: filled ? colorHex : '#b8b09e',
            }}
          />
        );
      })}
    </span>
  );
};

/**
 * Clean architectural SVG icon for Title Deed construction tiers (Empty -> 1/2/3 Houses -> Hotel ★ -> Resort).
 */
export const BuildingLevelVisual: React.FC<{
  level: number;
  isResort?: boolean;
  className?: string;
}> = ({ level, isResort = false, className = 'h-6 w-6' }) => {
  if (isResort) {
    return (
      <svg viewBox="0 0 28 24" aria-hidden="true" className={className}>
        <ellipse cx="14" cy="20" rx="11" ry="2.5" fill="#bae6fd" />
        <path
          d="M13.5 19 C13 13 13.5 8.5 15.5 5"
          fill="none"
          stroke="#92400e"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path d="M15.5 5 C11.5 3.5 8.5 5.5 7.5 8 C11 7.2 13.5 6.8 15.5 5 Z" fill="#16a34a" />
        <path d="M15.5 5 C18.5 3 22 4.5 23 7.2 C19.8 6.8 17.5 6.2 15.5 5 Z" fill="#22c55e" />
        <path d="M15.5 5 C14.8 2 17 1 19 2.2 C17.6 3.5 16.5 4.2 15.5 5 Z" fill="#15803d" />
      </svg>
    );
  }

  if (level >= 4) {
    return (
      <svg viewBox="0 0 28 24" aria-hidden="true" className={className}>
        <rect x="6" y="6" width="16" height="15" rx="2" fill="#e11d48" stroke="#881337" strokeWidth="1.4" />
        <rect x="9" y="3" width="10" height="3.5" rx="1" fill="#f5b800" stroke="#b45309" strokeWidth="1" />
        <rect x="9.5" y="9" width="3.5" height="3.5" rx="0.6" fill="#fef08a" />
        <rect x="15" y="9" width="3.5" height="3.5" rx="0.6" fill="#fef08a" />
        <rect x="12" y="15" width="4" height="6" rx="0.8" fill="#ffe4e6" />
      </svg>
    );
  }

  if (level <= 0) {
    return (
      <svg viewBox="0 0 28 24" aria-hidden="true" className={className}>
        <polygon
          points="4,17 14,12 24,17 14,22"
          fill="#d6d0c4"
          stroke="#8c8370"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <polygon
          points="7,17 14,13.6 21,17 14,20.4"
          fill="#efece4"
        />
      </svg>
    );
  }

  const houseCount = Math.min(3, Math.max(1, level));
  const xs = houseCount === 1 ? [14] : houseCount === 2 ? [9.5, 18.5] : [6.5, 14, 21.5];

  return (
    <svg viewBox="0 0 28 24" aria-hidden="true" className={className}>
      {xs.map((cx, idx) => (
        <g key={idx} transform={`translate(${cx}, 13)`}>
          <polygon
            points="-4.2,0 0,-4.4 4.2,0"
            fill="#16a34a"
            stroke="#14532d"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
          <rect
            x="-3.3"
            y="0"
            width="6.6"
            height="6.8"
            rx="0.8"
            fill="#ffffff"
            stroke="#15803d"
            strokeWidth="1.1"
          />
        </g>
      ))}
    </svg>
  );
};

/**
 * Clean vector icons for 3D board taunts (no OS emoji).
 */
export const TauntSvgIcon: React.FC<{
  kind: BoardTauntKind;
  className?: string;
}> = ({ kind, className = 'h-4 w-4 shrink-0' }) => {
  if (kind === 'slipper') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
        <path
          d="M7 18.5c0 1.4 1.2 2.5 3.2 2.5h4.2c1.8 0 3.1-1.1 3.1-2.6 0-1-.4-2-.8-3.4-.5-1.6-.3-3.1-.1-4.8.2-2.6-.7-6.2-4.1-6.2-3.4 0-4.8 3.2-4.8 6.4 0 2-.5 3.6-.7 5.2-.1 1 0 2 0 2.9Z"
          fill="#bae6fd"
          stroke="#0369a1"
          strokeWidth="1.8"
        />
        <path
          d="M8.5 11.5c1.8-1.6 5.2-1.6 7 0"
          stroke="#0284c7"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (kind === 'tomato') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
        <circle cx="12" cy="13.5" r="7" fill="#ef4444" stroke="#991b1b" strokeWidth="1.8" />
        <path
          d="M12 6.5c-1.5-1.8-3.5-1.5-4.5-.5 1.8.4 3.2.8 4.5.5Zm0 0c1.5-1.8 3.5-1.5 4.5-.5-1.8.4-3.2.8-4.5.5Zm0 0V4"
          stroke="#15803d"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (kind === 'confetti') {
    return <Sparkles className={`${className} text-amber-600`} aria-hidden="true" />;
  }
  return <Banknote className={`${className} text-emerald-600`} aria-hidden="true" />;
};

export type QuickEmoteKey = 'roll' | 'land' | 'rent' | 'shock' | 'fire' | 'cup';

export const EmoteSvgIcon: React.FC<{
  emoteKey: QuickEmoteKey;
  className?: string;
}> = ({ emoteKey, className = 'h-4 w-4 shrink-0' }) => {
  switch (emoteKey) {
    case 'roll':
      return <Dices className={`${className} text-rose-600`} aria-hidden="true" />;
    case 'land':
      return <Building2 className={`${className} text-sky-700`} aria-hidden="true" />;
    case 'rent':
      return <HandCoins className={`${className} text-emerald-700`} aria-hidden="true" />;
    case 'shock':
      return <Zap className={`${className} text-amber-600`} aria-hidden="true" />;
    case 'fire':
      return <Flame className={`${className} text-orange-600`} aria-hidden="true" />;
    case 'cup':
      return <Trophy className={`${className} text-amber-600`} aria-hidden="true" />;
  }
};

export const TileStatusMiniIcon: React.FC<{
  kind: 'outage' | 'cup' | 'shield' | 'resort';
  className?: string;
}> = ({ kind, className = 'h-2.5 w-2.5' }) => {
  switch (kind) {
    case 'outage':
      return <Zap className={`${className} text-slate-600`} strokeWidth={2.5} aria-hidden="true" />;
    case 'cup':
      return <Trophy className={`${className} text-amber-600`} strokeWidth={2.5} aria-hidden="true" />;
    case 'shield':
      return <Shield className={`${className} text-sky-600`} strokeWidth={2.5} aria-hidden="true" />;
    case 'resort':
      return <Palmtree className={`${className} text-emerald-600`} strokeWidth={2.5} aria-hidden="true" />;
  }
};

export type { BoardTauntKind };
