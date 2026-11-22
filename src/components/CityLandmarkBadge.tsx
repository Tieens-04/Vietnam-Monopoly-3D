import React, { useEffect, useRef } from 'react';
import { BOARD_TILES } from '../game/boardData';
import { TileKind } from '../game/types';
import { getCityVisualProfile } from '../game/visualTheme';
import {
  drawCityLandmarkIllustration,
  resolveDeedGroupPalette,
} from '../three/textures';

interface CityLandmarkBadgeProps {
  tileIndex: number;
  size?: number;
  className?: string;
}

export const CityLandmarkBadge: React.FC<CityLandmarkBadgeProps> = ({
  tileIndex,
  size = 52,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tile = BOARD_TILES[tileIndex];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !tile) return;
    if (tile.kind !== TileKind.PROPERTY && tile.kind !== TileKind.RESORT) return;

    const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    const px = Math.round(size * dpr);
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, px, px);
    const profile = getCityVisualProfile(tileIndex);
    const pal =
      tile.kind === TileKind.RESORT
        ? { topHex: '#0EA5E9', emblemHex: '#0369A1' }
        : resolveDeedGroupPalette(tile.group, tile.groupColor);

    drawCityLandmarkIllustration(
      ctx,
      profile.landmarkMotif,
      px / 2,
      px / 2,
      px * 0.45,
      pal.topHex,
      pal.emblemHex
    );
  }, [size, tile, tileIndex]);

  if (!tile || (tile.kind !== TileKind.PROPERTY && tile.kind !== TileKind.RESORT)) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        filter: 'drop-shadow(0 3px 6px rgba(15, 23, 42, 0.28))',
      }}
      className={`shrink-0 ${className}`}
    />
  );
};
