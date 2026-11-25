import React, { useId } from 'react';
import type { BoardTauntKind } from '../game/onlineTypes';
import type { AvatarMood } from '../game/avatarLogic';

export type Emote3DKey =
  | 'laugh'
  | 'cool'
  | 'rich'
  | 'shock'
  | 'angry'
  | 'fire'
  | 'cry'
  | 'crown'
  | 'clap';

export interface Emote3DEntry {
  key: Emote3DKey;
  label: string;
  moodBurst: AvatarMood;
}

export const EMOTE_3D_PREFIX = 'emote3d:';

export const EMOTE_3D_CATALOG: ReadonlyArray<Emote3DEntry> = [
  { key: 'laugh', label: 'Cười sảng khoái', moodBurst: 'celebrating' },
  { key: 'cool', label: 'Đẳng cấp tỷ phú', moodBurst: 'celebrating' },
  { key: 'rich', label: 'Đếm tiền mỏi tay', moodBurst: 'celebrating' },
  { key: 'shock', label: 'Hốt hoảng', moodBurst: 'stressed' },
  { key: 'angry', label: 'Tức giận', moodBurst: 'stressed' },
  { key: 'fire', label: 'Quyết chiến', moodBurst: 'active' },
  { key: 'cry', label: 'Khóc ròng', moodBurst: 'stressed' },
  { key: 'crown', label: 'Vua bàn cờ', moodBurst: 'celebrating' },
  { key: 'clap', label: 'Chúc mừng', moodBurst: 'celebrating' },
];

const EMOTE_3D_KEY_SET = new Set<string>(EMOTE_3D_CATALOG.map((e) => e.key));

export function encodeEmote3D(key: Emote3DKey): string {
  return `${EMOTE_3D_PREFIX}${key}`;
}

export function parseEmote3DKey(raw: string | null | undefined): Emote3DKey | null {
  if (!raw || !raw.startsWith(EMOTE_3D_PREFIX)) return null;
  const candidate = raw.slice(EMOTE_3D_PREFIX.length).trim();
  return EMOTE_3D_KEY_SET.has(candidate) ? (candidate as Emote3DKey) : null;
}

export function getEmote3DMeta(key: Emote3DKey): Emote3DEntry {
  return EMOTE_3D_CATALOG.find((e) => e.key === key) ?? EMOTE_3D_CATALOG[0];
}

export interface Taunt3DItemMeta {
  kind: BoardTauntKind;
  label: string;
  impactMood: AvatarMood;
  accentHex: string;
}

export const TAUNT_3D_CATALOG: ReadonlyArray<Taunt3DItemMeta> = [
  {
    kind: 'slipper',
    label: 'Dép tổ ong',
    impactMood: 'stressed',
    accentHex: '#0284c7',
  },
  {
    kind: 'tomato',
    label: 'Cà chua',
    impactMood: 'stressed',
    accentHex: '#dc2626',
  },
  {
    kind: 'confetti',
    label: 'Pháo giấy',
    impactMood: 'celebrating',
    accentHex: '#d97706',
  },
  {
    kind: 'cash_stack',
    label: 'Cọc tiền',
    impactMood: 'celebrating',
    accentHex: '#059669',
  },
];

export function getTaunt3DMeta(kind: BoardTauntKind): Taunt3DItemMeta {
  return TAUNT_3D_CATALOG.find((t) => t.kind === kind) ?? TAUNT_3D_CATALOG[0];
}

/**
 * Volumetric 3D-shaded clay/glossy emoji icons (multi-stop radial shading,
 * specular highlights, rim lighting, ambient occlusion). Renders identically
 * across Windows/macOS/Linux without OS emoji font discrepancies.
 */
export const Emote3DIcon: React.FC<{
  emoteKey: Emote3DKey;
  className?: string;
}> = ({ emoteKey, className = 'h-10 w-10' }) => {
  const uid = useId().replace(/:/g, '');

  const renderGoldenSphere = (
    topColor = '#FFF3A8',
    midColor = '#FFC627',
    deepColor = '#D97706',
    rimColor = '#F59E0B'
  ) => (
    <>
      <defs>
        <radialGradient id={`${uid}-ball`} cx="35%" cy="28%" r="68%">
          <stop offset="0%" stopColor={topColor} />
          <stop offset="45%" stopColor={midColor} />
          <stop offset="86%" stopColor={deepColor} />
          <stop offset="100%" stopColor={rimColor} />
        </radialGradient>
        <radialGradient id={`${uid}-spec`} cx="34%" cy="24%" r="36%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.88" />
          <stop offset="65%" stopColor="#FFFFFF" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-shadow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#141C2B" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#141C2B" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="32" cy="57.5" rx="18" ry="4.5" fill={`url(#${uid}-shadow)`} />
      <circle cx="32" cy="31" r="24" fill={`url(#${uid}-ball)`} />
      <ellipse cx="24" cy="20" rx="11" ry="7.5" transform="rotate(-20 24 20)" fill={`url(#${uid}-spec)`} />
    </>
  );

  switch (emoteKey) {
    case 'laugh':
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
          {renderGoldenSphere()}
          {/* Rosy cheeks */}
          <ellipse cx="18.5" cy="34" rx="4.5" ry="2.6" fill="#F97316" fillOpacity="0.4" />
          <ellipse cx="45.5" cy="34" rx="4.5" ry="2.6" fill="#F97316" fillOpacity="0.4" />
          {/* Squinting joyful eyes */}
          <path d="M17 26.5 C20 22.5, 25 22.5, 27.5 26.5" fill="none" stroke="#451A03" strokeWidth="3.2" strokeLinecap="round" />
          <path d="M36.5 26.5 C39 22.5, 44 22.5, 47 26.5" fill="none" stroke="#451A03" strokeWidth="3.2" strokeLinecap="round" />
          {/* Glossy 3D laughing tears */}
          <path d="M15 29 C9 30, 6 35, 9.5 38.5 C12.5 41.5, 17 38, 16 32 Z" fill="#38BDF8" stroke="#0284C7" strokeWidth="1.2" />
          <circle cx="10.5" cy="34.5" r="1.6" fill="#FFFFFF" fillOpacity="0.85" />
          <path d="M49 29 C55 30, 58 35, 54.5 38.5 C51.5 41.5, 47 38, 48 32 Z" fill="#38BDF8" stroke="#0284C7" strokeWidth="1.2" />
          <circle cx="52.5" cy="34.5" r="1.6" fill="#FFFFFF" fillOpacity="0.85" />
          {/* Big open laughing mouth */}
          <path d="M19 35.5 Q32 34.5 45 35.5 C44.5 46, 39 50.5, 32 50.5 C25 50.5, 19.5 46, 19 35.5 Z" fill="#7F1D1D" />
          <path d="M21 36.2 Q32 35.4 43 36.2 L42.2 39.5 Q32 40.5 21.8 39.5 Z" fill="#FFFFFF" />
          <ellipse cx="32" cy="46.8" rx="7.5" ry="3.4" fill="#FB7185" />
        </svg>
      );

    case 'cool':
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
          {renderGoldenSphere()}
          {/* 3D Glossy Aviator Sunglasses */}
          <defs>
            <linearGradient id={`${uid}-lens`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#334155" />
              <stop offset="45%" stopColor="#0F172A" />
              <stop offset="100%" stopColor="#020617" />
            </linearGradient>
          </defs>
          <path d="M8.5 24.5 L55.5 24.5" stroke="#0F172A" strokeWidth="3.2" strokeLinecap="round" />
          <rect x="11" y="22.5" width="19" height="13.5" rx="5.5" fill={`url(#${uid}-lens)`} stroke="#1E293B" strokeWidth="1.6" />
          <rect x="34" y="22.5" width="19" height="13.5" rx="5.5" fill={`url(#${uid}-lens)`} stroke="#1E293B" strokeWidth="1.6" />
          {/* Specular diagonal reflection */}
          <path d="M14.5 25 L20 25 L16 33 L13 33 Z" fill="#FFFFFF" fillOpacity="0.38" />
          <path d="M37.5 25 L43 25 L39 33 L36 33 Z" fill="#FFFFFF" fillOpacity="0.38" />
          {/* Confident smirk */}
          <path d="M23 43.5 Q33 47.5 43 40.5" fill="none" stroke="#451A03" strokeWidth="3.2" strokeLinecap="round" />
        </svg>
      );

    case 'rich':
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
          {renderGoldenSphere()}
          {/* Glowing emerald $ eyes */}
          <text x="21.5" y="32" textAnchor="middle" fill="#065F46" fontSize="16" fontWeight="900" fontFamily="system-ui, sans-serif">
            $
          </text>
          <text x="21" y="31.2" textAnchor="middle" fill="#10B981" fontSize="16" fontWeight="900" fontFamily="system-ui, sans-serif">
            $
          </text>
          <text x="42.5" y="32" textAnchor="middle" fill="#065F46" fontSize="16" fontWeight="900" fontFamily="system-ui, sans-serif">
            $
          </text>
          <text x="42" y="31.2" textAnchor="middle" fill="#10B981" fontSize="16" fontWeight="900" fontFamily="system-ui, sans-serif">
            $
          </text>
          {/* Open mouth + green money tongue */}
          <path d="M20 37.5 Q32 41 44 37.5 C43.5 45.5, 38.5 48.5, 32 48.5 C25.5 48.5, 20.5 45.5, 20 37.5 Z" fill="#451A03" />
          <path d="M26 42.5 C26 42.5, 26 52, 32 52 C38 52, 38 42.5, 38 42.5 Z" fill="#22C55E" stroke="#15803D" strokeWidth="1.4" />
          <text x="32" y="49.5" textAnchor="middle" fill="#ECFDF5" fontSize="8.5" fontWeight="900" fontFamily="system-ui, sans-serif">
            $
          </text>
        </svg>
      );

    case 'shock':
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
          <defs>
            <linearGradient id={`${uid}-shock-face`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#60A5FA" />
              <stop offset="42%" stopColor="#CBD5E1" />
              <stop offset="68%" stopColor="#FCD34D" />
              <stop offset="100%" stopColor="#D97706" />
            </linearGradient>
            <radialGradient id={`${uid}-spec`} cx="34%" cy="24%" r="36%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.82" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`${uid}-shadow`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#141C2B" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#141C2B" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx="32" cy="57.5" rx="18" ry="4.5" fill={`url(#${uid}-shadow)`} />
          <circle cx="32" cy="31" r="24" fill={`url(#${uid}-shock-face)`} />
          <ellipse cx="24" cy="19" rx="10" ry="6.5" transform="rotate(-18 24 19)" fill={`url(#${uid}-spec)`} />
          {/* Wide glossy eyes */}
          <ellipse cx="22.5" cy="27.5" rx="4.8" ry="5.8" fill="#FFFFFF" stroke="#1E293B" strokeWidth="1.3" />
          <circle cx="22.5" cy="28" r="2.2" fill="#0F172A" />
          <circle cx="21.5" cy="26.5" r="0.9" fill="#FFFFFF" />
          <ellipse cx="41.5" cy="27.5" rx="4.8" ry="5.8" fill="#FFFFFF" stroke="#1E293B" strokeWidth="1.3" />
          <circle cx="41.5" cy="28" r="2.2" fill="#0F172A" />
          <circle cx="40.5" cy="26.5" r="0.9" fill="#FFFFFF" />
          {/* Raised brows */}
          <path d="M16.5 19.5 Q22.5 16 27.5 19" fill="none" stroke="#1E293B" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M36.5 19 Q41.5 16 47.5 19.5" fill="none" stroke="#1E293B" strokeWidth="2.4" strokeLinecap="round" />
          {/* Surprised O mouth */}
          <ellipse cx="32" cy="43" rx="6.2" ry="8" fill="#7F1D1D" stroke="#450A0A" strokeWidth="1.5" />
          <ellipse cx="32" cy="47" rx="3.8" ry="2.2" fill="#FB7185" />
          {/* Sweat drop */}
          <path d="M51 14 C54 19, 55.5 22, 52.5 24.5 C49.5 26.5, 46.5 23.5, 48.5 19 Z" fill="#38BDF8" stroke="#0284C7" strokeWidth="1.2" />
        </svg>
      );

    case 'angry':
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
          {renderGoldenSphere('#FCA5A5', '#EF4444', '#991B1B', '#7F1D1D')}
          {/* Furrowed angry brows */}
          <path d="M15.5 22 L28.5 27.5" stroke="#450A0A" strokeWidth="3.6" strokeLinecap="round" />
          <path d="M48.5 22 L35.5 27.5" stroke="#450A0A" strokeWidth="3.6" strokeLinecap="round" />
          {/* Intense eyes */}
          <circle cx="22.5" cy="31" r="3.4" fill="#2A0505" />
          <circle cx="21.4" cy="29.8" r="1.1" fill="#FFFFFF" />
          <circle cx="41.5" cy="31" r="3.4" fill="#2A0505" />
          <circle cx="40.4" cy="29.8" r="1.1" fill="#FFFFFF" />
          {/* Gritted frown */}
          <path d="M22 45 C25 40.5, 39 40.5, 42 45" fill="none" stroke="#450A0A" strokeWidth="3.4" strokeLinecap="round" />
          {/* Steam puffs */}
          <circle cx="12" cy="40" r="3.5" fill="#FFFFFF" fillOpacity="0.8" />
          <circle cx="52" cy="40" r="3.5" fill="#FFFFFF" fillOpacity="0.8" />
        </svg>
      );

    case 'fire':
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
          <defs>
            <linearGradient id={`${uid}-f-outer`} x1="0.5" y1="0" x2="0.5" y2="1">
              <stop offset="0%" stopColor="#FDE047" />
              <stop offset="35%" stopColor="#F97316" />
              <stop offset="85%" stopColor="#DC2626" />
              <stop offset="100%" stopColor="#991B1B" />
            </linearGradient>
            <linearGradient id={`${uid}-f-inner`} x1="0.5" y1="0" x2="0.5" y2="1">
              <stop offset="0%" stopColor="#FEF9C3" />
              <stop offset="55%" stopColor="#FACC15" />
              <stop offset="100%" stopColor="#F97316" />
            </linearGradient>
            <radialGradient id={`${uid}-shadow`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#991B1B" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#991B1B" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx="32" cy="57.5" rx="17" ry="4" fill={`url(#${uid}-shadow)`} />
          <path
            d="M34 6 C35 16, 46 20, 48 31 C50.5 27, 51 23, 50.5 21 C56 28, 56 42, 49 49.5 C44.5 54.5, 38.5 56.5, 32 56.5 C21 56.5, 13 48, 13.5 36.5 C14 27, 21 22, 23 14 C25 18, 25 22, 24.5 24 C27.5 18, 31 12, 34 6 Z"
            fill={`url(#${uid}-f-outer)`}
          />
          <path
            d="M32.5 23 C36 30, 42 34, 41.5 43 C41 49.5, 36.8 53, 32 53 C26.2 53, 22.5 48.5, 22.8 42.5 C23 36.5, 27.5 33, 29 27.5 C30 30, 30.8 31.5, 31.5 31.5 C32 28.5, 32.2 25.8, 32.5 23 Z"
            fill={`url(#${uid}-f-inner)`}
          />
          <ellipse cx="32" cy="46.5" rx="4.5" ry="5.5" fill="#FEFCE8" fillOpacity="0.9" />
        </svg>
      );

    case 'cry':
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
          {renderGoldenSphere()}
          {/* Twin glossy 3D tear waterfalls */}
          <defs>
            <linearGradient id={`${uid}-tear`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7DD3FC" />
              <stop offset="60%" stopColor="#0EA5E9" />
              <stop offset="100%" stopColor="#0284C7" />
            </linearGradient>
          </defs>
          <rect x="17.5" y="29" width="7.5" height="25" rx="3.7" fill={`url(#${uid}-tear)`} />
          <rect x="39" y="29" width="7.5" height="25" rx="3.7" fill={`url(#${uid}-tear)`} />
          <rect x="19.2" y="31" width="1.8" height="19" rx="0.9" fill="#FFFFFF" fillOpacity="0.6" />
          <rect x="40.7" y="31" width="1.8" height="19" rx="0.9" fill="#FFFFFF" fillOpacity="0.6" />
          {/* Closed sad eyes */}
          <path d="M16.5 27.5 Q21.5 30.5 26 27.5" fill="none" stroke="#451A03" strokeWidth="3" strokeLinecap="round" />
          <path d="M38 27.5 Q42.5 30.5 47.5 27.5" fill="none" stroke="#451A03" strokeWidth="3" strokeLinecap="round" />
          {/* Sad brows */}
          <path d="M16 22.5 L25 19.5" stroke="#451A03" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M48 22.5 L39 19.5" stroke="#451A03" strokeWidth="2.4" strokeLinecap="round" />
          {/* Wailing mouth */}
          <path d="M25.5 45 C27 38.5, 37 38.5, 38.5 45 C37 47.5, 27 47.5, 25.5 45 Z" fill="#7F1D1D" />
        </svg>
      );

    case 'crown':
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
          <defs>
            <linearGradient id={`${uid}-gold`} x1="0.2" y1="0" x2="0.8" y2="1">
              <stop offset="0%" stopColor="#FEF08A" />
              <stop offset="35%" stopColor="#FACC15" />
              <stop offset="75%" stopColor="#D97706" />
              <stop offset="100%" stopColor="#92400E" />
            </linearGradient>
            <linearGradient id={`${uid}-band`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#B45309" />
              <stop offset="45%" stopColor="#FDE047" />
              <stop offset="100%" stopColor="#92400E" />
            </linearGradient>
            <radialGradient id={`${uid}-shadow`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#141C2B" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#141C2B" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx="32" cy="54" rx="20" ry="4.5" fill={`url(#${uid}-shadow)`} />
          <path
            d="M10 44 L7 20 L21 31 L32 14 L43 31 L57 20 L54 44 Z"
            fill={`url(#${uid}-gold)`}
            stroke="#92400E"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          {/* Crown orb tips */}
          <circle cx="7.5" cy="19" r="3.4" fill="#FEF08A" stroke="#B45309" strokeWidth="1.2" />
          <circle cx="32" cy="13" r="4" fill="#FEF08A" stroke="#B45309" strokeWidth="1.2" />
          <circle cx="56.5" cy="19" r="3.4" fill="#FEF08A" stroke="#B45309" strokeWidth="1.2" />
          {/* Base rim */}
          <rect x="10" y="42" width="44" height="8.5" rx="3.5" fill={`url(#${uid}-band)`} stroke="#92400E" strokeWidth="1.4" />
          {/* 3D Cabochon Gems */}
          <circle cx="32" cy="36" r="4.2" fill="#E11D48" stroke="#FFF1F2" strokeWidth="1" />
          <circle cx="30.8" cy="34.8" r="1.3" fill="#FFFFFF" fillOpacity="0.85" />
          <circle cx="20" cy="38.5" r="3" fill="#0EA5E9" stroke="#E0F2FE" strokeWidth="0.9" />
          <circle cx="44" cy="38.5" r="3" fill="#10B981" stroke="#D1FAE5" strokeWidth="0.9" />
        </svg>
      );

    case 'clap':
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
          <defs>
            <linearGradient id={`${uid}-hand-a`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FEF08A" />
              <stop offset="55%" stopColor="#FBBF24" />
              <stop offset="100%" stopColor="#D97706" />
            </linearGradient>
            <linearGradient id={`${uid}-hand-b`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FDE68A" />
              <stop offset="55%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#B45309" />
            </linearGradient>
          </defs>
          {/* Golden clap burst rays */}
          <path d="M22 12 L25 18 M32 8 L32 15 M43 11 L39 17" stroke="#F59E0B" strokeWidth="3.2" strokeLinecap="round" />
          {/* Back hand */}
          <path
            d="M27 21 C29 18, 33 18.5, 34.5 21.5 L45 34 C48 37.5, 47.5 44, 43 48 L36 53 C31 56, 24.5 54, 21.5 48.5 L16 37 C14.5 34, 17 31, 20 32.5 L24 34.5 L21 25.5 C20 22.5, 24.5 19.5, 27 21 Z"
            fill={`url(#${uid}-hand-b)`}
            stroke="#92400E"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {/* Front clapping hand */}
          <path
            d="M36 23 C38.5 20.5, 42.5 21.5, 43.5 24.5 L50 38 C52 42.5, 50.5 49, 45.5 52.5 L39 56 C34 58.5, 28 56, 25.5 50.5 L21 39 C19.8 36, 22.5 33.5, 25.5 35 L29.5 37.5 L27.5 28 C26.8 25, 31 23, 33.5 25 L36 27 Z"
            fill={`url(#${uid}-hand-a)`}
            stroke="#92400E"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M35 31 L41 42" stroke="#FEF9C3" strokeWidth="2.2" strokeLinecap="round" strokeOpacity="0.7" />
        </svg>
      );
  }
};

/**
 * Volumetric 3D-shaded interaction projectile artwork (used both in the
 * player interaction picker AND in the flying Avatar-to-Avatar 3D overlay).
 */
export const Taunt3DItemIcon: React.FC<{
  kind: BoardTauntKind;
  className?: string;
}> = ({ kind, className = 'h-10 w-10' }) => {
  const uid = useId().replace(/:/g, '');

  if (kind === 'slipper') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
        <defs>
          <linearGradient id={`${uid}-sole`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#E0F2FE" />
            <stop offset="45%" stopColor="#7DD3FC" />
            <stop offset="100%" stopColor="#0284C7" />
          </linearGradient>
          <linearGradient id={`${uid}-strap`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F0F9FF" />
            <stop offset="50%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#0369A1" />
          </linearGradient>
          <radialGradient id={`${uid}-shadow`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0C4A6E" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#0C4A6E" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="33" cy="56" rx="18" ry="4.5" fill={`url(#${uid}-shadow)`} />
        <g transform="rotate(-16 32 32)">
          {/* 3D thick EVA sole side wall */}
          <path
            d="M20 49 C18.5 39, 19.5 23, 21.5 14 C23.5 7, 39.5 7, 42.5 14.5 C45 21, 44.5 36, 43 48.5 C42 54.5, 21.5 55, 20 49 Z"
            transform="translate(2.5 3)"
            fill="#0369A1"
          />
          {/* Top footbed */}
          <path
            d="M20 49 C18.5 39, 19.5 23, 21.5 14 C23.5 7, 39.5 7, 42.5 14.5 C45 21, 44.5 36, 43 48.5 C42 54.5, 21.5 55, 20 49 Z"
            fill={`url(#${uid}-sole)`}
            stroke="#0369A1"
            strokeWidth="1.6"
          />
          {/* Iconic Vietnamese Dép Tổ Ong honeycomb strap */}
          <path
            d="M19.5 27 C23 19.5, 41 19.5, 44.5 27 L43.8 38.5 C39.5 34.5, 24.5 34.5, 20.2 38.5 Z"
            fill={`url(#${uid}-strap)`}
            stroke="#075985"
            strokeWidth="1.5"
          />
          {/* Honeycomb ventilation holes */}
          <circle cx="27" cy="27.5" r="2.1" fill="#0C4A6E" fillOpacity="0.65" />
          <circle cx="32" cy="26.2" r="2.1" fill="#0C4A6E" fillOpacity="0.65" />
          <circle cx="37" cy="27.5" r="2.1" fill="#0C4A6E" fillOpacity="0.65" />
          <circle cx="29.5" cy="31.5" r="1.9" fill="#0C4A6E" fillOpacity="0.65" />
          <circle cx="34.5" cy="31.5" r="1.9" fill="#0C4A6E" fillOpacity="0.65" />
          {/* Glossy rim highlight */}
          <path d="M23.5 24 C27.5 21.5, 36.5 21.5, 40.5 24" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeOpacity="0.7" />
        </g>
      </svg>
    );
  }

  if (kind === 'tomato') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
        <defs>
          <radialGradient id={`${uid}-tom`} cx="35%" cy="32%" r="64%">
            <stop offset="0%" stopColor="#FCA5A5" />
            <stop offset="32%" stopColor="#EF4444" />
            <stop offset="78%" stopColor="#B91C1C" />
            <stop offset="100%" stopColor="#7F1D1D" />
          </radialGradient>
          <radialGradient id={`${uid}-spec`} cx="35%" cy="28%" r="34%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.88" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${uid}-shadow`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#7F1D1D" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#7F1D1D" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="32" cy="56" rx="18" ry="4.5" fill={`url(#${uid}-shadow)`} />
        {/* Plump 3D tomato body */}
        <path
          d="M32 18 C45 18, 54 25.5, 54 37.5 C54 49, 44.5 55, 32 55 C19.5 55, 10 49, 10 37.5 C10 25.5, 19 18, 32 18 Z"
          fill={`url(#${uid}-tom)`}
        />
        <ellipse cx="22.5" cy="29.5" rx="8.5" ry="5.5" transform="rotate(-24 22.5 29.5)" fill={`url(#${uid}-spec)`} />
        {/* 3D Green Star Calyx & Stem */}
        <path
          d="M32 18.5 C27 14, 19 16, 17 20 C22.5 19.8, 26.5 20.5, 30 22.5 C26.5 24, 24 26.5, 23 28.5 C27.5 27.5, 30.5 25.5, 32 23 C33.5 25.5, 36.5 27.5, 41 28.5 C40 26.5, 37.5 24, 34 22.5 C37.5 20.5, 41.5 19.8, 47 20 C45 16, 37 14, 32 18.5 Z"
          fill="#22C55E"
          stroke="#15803D"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path d="M32 19 C32 14, 34 10.5, 37 9" fill="none" stroke="#166534" strokeWidth="3.2" strokeLinecap="round" />
      </svg>
    );
  }

  if (kind === 'confetti') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
        <defs>
          <linearGradient id={`${uid}-cone`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FEF08A" />
            <stop offset="48%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#B45309" />
          </linearGradient>
        </defs>
        {/* Flying streamers & 3D stars */}
        <path d="M31 24 C34 15, 42 12, 49 14" fill="none" stroke="#EC4899" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M35 28 C44 26, 51 28, 56 23" fill="none" stroke="#0EA5E9" strokeWidth="3" strokeLinecap="round" />
        <path d="M27 21 C25 14, 28 9, 34 7" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" />
        <circle cx="51" cy="36" r="3.2" fill="#F43F5E" />
        <circle cx="43" cy="20" r="2.8" fill="#FACC15" />
        <circle cx="21" cy="14" r="2.5" fill="#8B5CF6" />
        <polygon points="55,14 56.8,17.8 61,18.2 57.8,21 58.6,25 55,23 51.4,25 52.2,21 49,18.2 53.2,17.8" fill="#FACC15" stroke="#B45309" strokeWidth="0.9" />
        {/* 3D Party Popper Cone */}
        <path
          d="M11 53 L24 23 L41 40 Z"
          fill={`url(#${uid}-cone)`}
          stroke="#92400E"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <ellipse cx="32.5" cy="31.5" rx="5.2" ry="12" transform="rotate(-45 32.5 31.5)" fill="#7C2D12" stroke="#FDE047" strokeWidth="1.5" />
        {/* Diagonal festive stripe */}
        <path d="M18.5 36.5 L27.5 45.5" stroke="#EF4444" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
    );
  }

  // cash_stack
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={`${uid}-bill-top`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#86EFAC" />
          <stop offset="55%" stopColor="#22C55E" />
          <stop offset="100%" stopColor="#15803D" />
        </linearGradient>
        <linearGradient id={`${uid}-band`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FDE047" />
          <stop offset="50%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>
        <radialGradient id={`${uid}-shadow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#14532D" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#14532D" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="32" cy="54" rx="22" ry="5" fill={`url(#${uid}-shadow)`} />
      {/* Bottom stacked bills depth */}
      <path d="M10 35 L36 22 L55 32 L55 44 L29 56 L10 46 Z" fill="#166534" stroke="#14532D" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M11 42 L29 51.5 L54 40" fill="none" stroke="#BBF7D0" strokeWidth="1.4" strokeOpacity="0.65" />
      <path d="M11 38 L29 47.5 L54 36" fill="none" stroke="#BBF7D0" strokeWidth="1.4" strokeOpacity="0.8" />
      {/* Top bill face */}
      <path d="M10 31 L36 18 L55 28 L29 41 Z" fill={`url(#${uid}-bill-top)`} stroke="#14532D" strokeWidth="1.5" strokeLinejoin="round" />
      {/* Inner banknote emblem */}
      <ellipse cx="32.5" cy="29.5" rx="7" ry="4" transform="rotate(-25 32.5 29.5)" fill="#DCFCE7" fillOpacity="0.55" />
      {/* Golden cash strap wrapping top & front side */}
      <path d="M25 23.5 L34 19 L43 23.7 L34 28.2 Z" fill={`url(#${uid}-band)`} stroke="#92400E" strokeWidth="1.1" />
      <path d="M34 28.2 L43 23.7 L43 49.5 L34 53.8 Z" fill="#D97706" stroke="#92400E" strokeWidth="1.1" />
      {/* Sparkle */}
      <path d="M16 14 L17.5 18 L21.5 19.5 L17.5 21 L16 25 L14.5 21 L10.5 19.5 L14.5 18 Z" fill="#FACC15" />
    </svg>
  );
};
