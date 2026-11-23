import React from 'react';
import {
  GRAPHICS_QUALITY_OPTIONS,
  GRAPHICS_TIER_LABELS,
} from '../game/graphicsQuality';
import { GraphicsQualityPref, GraphicsQualityTier } from '../game/types';

export interface GraphicsQualityPickerProps {
  value: GraphicsQualityPref;
  effectiveTier: GraphicsQualityTier;
  gpuLabel?: string;
  compact?: boolean;
  onChange: (next: GraphicsQualityPref) => void;
}

const QUALITY_ICONS: Record<GraphicsQualityPref, string> = {
  auto: '⚡',
  low: '🌱',
  medium: '⚖️',
  high: '✨',
};

export const GraphicsQualityPicker: React.FC<GraphicsQualityPickerProps> = ({
  value,
  effectiveTier,
  gpuLabel,
  compact = false,
  onChange,
}) => {
  const activeMeta =
    GRAPHICS_QUALITY_OPTIONS.find((opt) => opt.id === value) ??
    GRAPHICS_QUALITY_OPTIONS[0];

  const resolvedBadgeText =
    value === 'auto'
      ? `Đang áp dụng mức ${GRAPHICS_TIER_LABELS[effectiveTier]}${gpuLabel ? ` (${gpuLabel})` : ''} — ${activeMeta.subtitle}`
      : activeMeta.subtitle;

  return (
    <div data-testid="bt-graphics-quality-picker" className="bt-quality-picker-wrap space-y-1.5">
      <div className="bt-quality-grid grid grid-cols-2 gap-1 p-1 rounded-2xl bg-sky-100 border border-sky-200">
        {GRAPHICS_QUALITY_OPTIONS.map((opt) => {
          const active = opt.id === value;
          return (
            <button
              key={opt.id}
              type="button"
              data-testid={`bt-quality-opt-${opt.id}`}
              aria-pressed={active}
              onClick={() => onChange(opt.id)}
              title={`${opt.title}: ${opt.subtitle}`}
              className={`py-1.5 px-1.5 rounded-xl flex items-center justify-center gap-1 text-[11px] font-black transition-all cursor-pointer whitespace-nowrap ${
                active
                  ? 'bt-btn-cyan text-white shadow-xs'
                  : 'text-sky-900 hover:bg-white/70'
              }`}
            >
              <span aria-hidden="true" className="text-[11px] leading-none">
                {QUALITY_ICONS[opt.id]}
              </span>
              <span>{opt.shortLabel}</span>
            </button>
          );
        })}
      </div>
      {!compact && (
        <p className="text-[11px] font-bold text-sky-800/90 leading-snug px-0.5">
          {resolvedBadgeText}
        </p>
      )}
    </div>
  );
};
