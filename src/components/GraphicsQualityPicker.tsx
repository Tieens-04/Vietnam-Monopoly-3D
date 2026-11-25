import React from 'react';
import { Feather, SlidersHorizontal, Sparkles, Zap } from 'lucide-react';
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

const QUALITY_ICONS: Record<GraphicsQualityPref, React.ReactNode> = {
  auto: <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />,
  low: <Feather className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />,
  medium: <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />,
  high: <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />,
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
      <div className="bt-quality-grid bt-segment-well grid grid-cols-2 gap-1 p-1 rounded-xl">
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
              className={`py-1.5 px-1.5 rounded-lg flex items-center justify-center gap-1 text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-[#182232] text-white shadow-xs'
                  : 'text-[#3f4a5e] hover:bg-white/70 hover:text-[#141c2b]'
              }`}
            >
              {QUALITY_ICONS[opt.id]}
              <span>{opt.shortLabel}</span>
            </button>
          );
        })}
      </div>
      {!compact && (
        <p className="text-[11px] font-semibold text-[#525e73] leading-snug px-0.5">
          {resolvedBadgeText}
        </p>
      )}
    </div>
  );
};
