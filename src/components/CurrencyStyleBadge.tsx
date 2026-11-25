import React from 'react';
import { CURRENCY_STYLE_OPTIONS } from '../game/currencyLogic';
import { CurrencyStyleId } from '../game/types';

export const CurrencyStyleIcon: React.FC<{
  styleId: CurrencyStyleId;
  className?: string;
}> = ({ styleId, className = 'h-4.5 w-4.5 shrink-0' }) => {
  if (styleId === 'cash') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
        <rect
          x="2"
          y="6.5"
          width="20"
          height="12"
          rx="2.6"
          fill="#0EA5B7"
          stroke="#0E7490"
          strokeWidth="1.5"
        />
        <rect
          x="2"
          y="4.5"
          width="20"
          height="12"
          rx="2.6"
          fill="#22C55E"
          stroke="#15803D"
          strokeWidth="1.5"
        />
        <rect x="9.8" y="4.2" width="4.4" height="12.6" fill="#F8FAFC" />
        <rect x="11.4" y="4.2" width="1.2" height="12.6" fill="#FACC15" />
        <circle cx="6.2" cy="10.5" r="1.5" fill="#DCFCE7" />
        <circle cx="17.8" cy="10.5" r="1.5" fill="#DCFCE7" />
      </svg>
    );
  }

  if (styleId === 'coins') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
        <circle
          cx="9.2"
          cy="13.8"
          r="6.2"
          fill="#CBD5E1"
          stroke="#64748B"
          strokeWidth="1.4"
        />
        <circle
          cx="14.5"
          cy="10.2"
          r="6.6"
          fill="#FACC15"
          stroke="#B45309"
          strokeWidth="1.5"
        />
        <circle
          cx="14.5"
          cy="10.2"
          r="4.5"
          fill="none"
          stroke="#FEF08A"
          strokeWidth="1.1"
        />
        <path
          d="M14.5 7.2l.9 1.9 2.1.3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1-1.5-1.4 2.1-.3z"
          fill="#FFFBEB"
        />
      </svg>
    );
  }

  if (styleId === 'bullion') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
        <polygon
          points="2.5,16.5 5.2,9.5 16.8,9.5 19.5,16.5"
          fill="#F59E0B"
          stroke="#92400E"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <polygon
          points="5.2,9.5 6.8,7.2 15.2,7.2 16.8,9.5"
          fill="#FDE047"
          stroke="#B45309"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <circle
          cx="17.6"
          cy="15.2"
          r="4.8"
          fill="#EF4444"
          stroke="#991B1B"
          strokeWidth="1.3"
        />
        <circle
          cx="17.6"
          cy="15.2"
          r="2.4"
          fill="#FFFFFF"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect
        x="1.8"
        y="5"
        width="17.5"
        height="11.5"
        rx="2.6"
        fill="#22C55E"
        stroke="#15803D"
        strokeWidth="1.5"
      />
      <rect x="8.8" y="4.8" width="3.4" height="11.9" fill="#F8FAFC" />
      <circle cx="5.4" cy="10.8" r="1.3" fill="#DCFCE7" />
      <circle
        cx="17.4"
        cy="15.2"
        r="5.2"
        fill="#FACC15"
        stroke="#B45309"
        strokeWidth="1.4"
      />
      <circle cx="17.4" cy="15.2" r="2.3" fill="#FEF9C3" />
    </svg>
  );
};

export const CurrencyStylePicker: React.FC<{
  value: CurrencyStyleId;
  onChange: (next: CurrencyStyleId) => void;
  compact?: boolean;
}> = ({ value, onChange, compact = false }) => {
  const activeMeta =
    CURRENCY_STYLE_OPTIONS.find((opt) => opt.id === value) ?? CURRENCY_STYLE_OPTIONS[0];

  return (
    <div data-testid="bt-currency-style-picker" className="bt-currency-picker-wrap space-y-1.5">
      <div className="bt-currency-grid bt-segment-well grid grid-cols-2 gap-1 p-1 rounded-xl">
        {CURRENCY_STYLE_OPTIONS.map((opt) => {
          const active = opt.id === value;
          return (
            <button
              key={opt.id}
              type="button"
              data-testid={`bt-currency-opt-${opt.id}`}
              aria-pressed={active}
              onClick={() => onChange(opt.id)}
              title={`${opt.title}: ${opt.subtitle}`}
              className={`bt-currency-opt-btn py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 text-[11px] font-bold leading-tight text-center transition-all cursor-pointer whitespace-nowrap ${
                active
                  ? 'bt-segment-active-light ring-1 ring-amber-400/70'
                  : 'text-[#3f4a5e] hover:bg-white/65 hover:text-[#141c2b]'
              }`}
            >
              <CurrencyStyleIcon styleId={opt.id} className="h-4 w-4 shrink-0" />
              <span>{opt.shortLabel}</span>
            </button>
          );
        })}
      </div>
      {!compact && (
        <p className="text-[11px] font-semibold text-[#525e73] leading-snug px-0.5">
          {activeMeta.subtitle}
        </p>
      )}
    </div>
  );
};
