import React, { useEffect, useRef } from 'react';
import type { BoardTauntKind } from '../game/onlineTypes';
import {
  readPrefersReducedMotion,
  subscribePrefersReducedMotion,
} from '../three/animationDirector';
import { getTaunt3DMeta, Taunt3DItemIcon } from './EmoteAndTaunt3D';
import { emitAvatarMoodBurst } from './PlayerAvatar3D';

export interface AvatarTauntFlight {
  id: number;
  kind: BoardTauntKind;
  fromPlayerId: number;
  targetPlayerId: number;
  startedAt: number;
}

interface AvatarTauntOverlayProps {
  flights: AvatarTauntFlight[];
  onFlightComplete: (flightId: number) => void;
}

interface Point2D {
  x: number;
  y: number;
}

function measureAvatarCenter(playerId: number, fallbackIndex: number): Point2D {
  const el = document.querySelector(`[data-testid="player-avatar-ring-${playerId}"]`);
  if (el) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5 };
    }
  }
  const w = window.innerWidth || 1280;
  const h = window.innerHeight || 800;
  const corners: Point2D[] = [
    { x: 56, y: 56 },
    { x: w - 56, y: 56 },
    { x: w - 56, y: h - 56 },
    { x: 56, y: h - 56 },
  ];
  return corners[Math.abs(fallbackIndex) % 4];
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

const FLIGHT_DURATION_MS = 700;
const IMPACT_DURATION_MS = 950;
const TOTAL_DURATION_MS = FLIGHT_DURATION_MS + IMPACT_DURATION_MS;

const PARTICLE_SEEDS = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2 + (i % 2 === 0 ? 0.12 : -0.15);
  const speed = 44 + ((i * 29) % 58);
  const spin = (i % 2 === 0 ? 1 : -1) * (180 + ((i * 53) % 240));
  const colors = ['#F43F5E', '#FACC15', '#10B981', '#0EA5E9', '#A855F7', '#F97316'];
  return {
    angle,
    speed,
    spin,
    color: colors[i % colors.length],
    size: 7 + (i % 4) * 2.2,
  };
});

const TRAIL_COUNT = 5;

const SingleAvatarTauntFlight: React.FC<{
  flight: AvatarTauntFlight;
  reducedMotion: boolean;
  onComplete: (id: number) => void;
}> = ({ flight, reducedMotion, onComplete }) => {
  const projectileRef = useRef<HTMLDivElement | null>(null);
  const shadowRef = useRef<HTMLDivElement | null>(null);
  const launchRingRef = useRef<HTMLDivElement | null>(null);
  const impactRootRef = useRef<HTMLDivElement | null>(null);
  const shockwaveRef = useRef<HTMLDivElement | null>(null);
  const splatRef = useRef<HTMLDivElement | null>(null);
  const trailRefs = useRef<Array<HTMLDivElement | null>>([]);
  const particleRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const startPt = measureAvatarCenter(flight.fromPlayerId, flight.fromPlayerId);
    const endPt = measureAvatarCenter(flight.targetPlayerId, flight.targetPlayerId);
    const meta = getTaunt3DMeta(flight.kind);

    if (reducedMotion) {
      if (impactRootRef.current) {
        impactRootRef.current.style.transform = `translate3d(${endPt.x}px, ${endPt.y}px, 0)`;
        impactRootRef.current.style.opacity = '1';
      }
      emitAvatarMoodBurst({
        playerId: flight.targetPlayerId,
        mood: meta.impactMood,
        durationMs: 1100,
      });
      const timer = window.setTimeout(() => onComplete(flight.id), 700);
      return () => window.clearTimeout(timer);
    }

    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 800;
    const midX = (startPt.x + endPt.x) * 0.5;
    const midY = (startPt.y + endPt.y) * 0.5;
    // Curve the 3D parabolic arc toward the viewport center so top-to-top flights
    // sweep dramatically across the board instead of clipping the top screen edge.
    const ctrlX = midX + (vw * 0.5 - midX) * 0.28;
    const rawCtrlY =
      midY < vh * 0.32
        ? midY + Math.max(130, vh * 0.24)
        : Math.min(startPt.y, endPt.y, midY) - Math.max(120, vh * 0.2);
    const ctrlY = Math.max(84, Math.min(vh - 84, rawCtrlY));
    const dirSign = endPt.x >= startPt.x ? 1 : -1;

    const evalArc = (u: number): Point2D => {
      const inv = 1 - u;
      return {
        x: inv * inv * startPt.x + 2 * inv * u * ctrlX + u * u * endPt.x,
        y: inv * inv * startPt.y + 2 * inv * u * ctrlY + u * u * endPt.y,
      };
    };

    const t0 = performance.now();
    let impactTriggered = false;
    let raf = 0;

    const triggerAvatarImpactRecoil = () => {
      emitAvatarMoodBurst({
        playerId: flight.targetPlayerId,
        mood: meta.impactMood,
        durationMs: 1450,
      });
      const targetEl = document.querySelector(
        `[data-testid="player-avatar-ring-${flight.targetPlayerId}"]`
      );
      if (targetEl instanceof HTMLElement) {
        targetEl.classList.remove('bt-avatar-hit-shake');
        void targetEl.offsetWidth;
        targetEl.classList.add('bt-avatar-hit-shake');
        window.setTimeout(() => {
          targetEl.classList.remove('bt-avatar-hit-shake');
        }, 520);
      }
    };

    const step = (now: number) => {
      const elapsed = now - t0;

      // 1. Launch burst ring at sender avatar (0..280ms)
      if (launchRingRef.current) {
        const lp = Math.min(1, elapsed / 280);
        const s = 0.55 + easeOutCubic(lp) * 1.15;
        launchRingRef.current.style.transform = `translate3d(${startPt.x}px, ${startPt.y}px, 0) translate(-50%, -50%) scale(${s})`;
        launchRingRef.current.style.opacity = `${Math.max(0, 1 - lp)}`;
      }

      // 2. Flight phase (0..FLIGHT_DURATION_MS)
      if (elapsed <= FLIGHT_DURATION_MS) {
        const rawU = Math.min(1, elapsed / FLIGHT_DURATION_MS);
        const u = easeInOutQuad(rawU);
        const pt = evalArc(u);
        // True 3D Z-depth illusion: swells toward viewer at apex (sin(pi * u))
        const elevation = Math.sin(Math.PI * u);
        const depthScale = 0.72 + elevation * 0.92 + u * 0.22;

        let rx = 0;
        let ry = 0;
        let rz = 0;
        if (flight.kind === 'slipper') {
          rx = elevation * 28;
          ry = u * 540 * dirSign;
          rz = u * 720 * dirSign;
        } else if (flight.kind === 'tomato') {
          rx = u * 360;
          ry = u * 240 * dirSign;
          rz = u * 540 * dirSign;
        } else if (flight.kind === 'confetti') {
          const nextPt = evalArc(Math.min(1, u + 0.03));
          const angleDeg = (Math.atan2(nextPt.y - pt.y, nextPt.x - pt.x) * 180) / Math.PI;
          rx = elevation * 22;
          ry = Math.sin(u * Math.PI * 3) * 28;
          rz = angleDeg + 45;
        } else {
          // cash_stack
          rx = Math.sin(u * Math.PI * 4) * 34;
          ry = u * 360 * dirSign;
          rz = Math.sin(u * Math.PI * 3) * 26 * dirSign;
        }

        if (projectileRef.current) {
          projectileRef.current.style.opacity = '1';
          projectileRef.current.style.transform =
            `translate3d(${pt.x}px, ${pt.y}px, 0) translate(-50%, -50%) ` +
            `scale(${depthScale.toFixed(3)}) rotateX(${rx.toFixed(1)}deg) rotateY(${ry.toFixed(1)}deg) rotateZ(${rz.toFixed(1)}deg)`;
        }

        // Synchronized depth shadow offset downward proportional to elevation
        if (shadowRef.current) {
          const shadowOffsetY = 18 + elevation * 56;
          const shadowScale = 0.65 + (1 - elevation) * 0.45;
          const shadowOpacity = 0.14 + (1 - elevation) * 0.24;
          shadowRef.current.style.opacity = shadowOpacity.toFixed(3);
          shadowRef.current.style.transform =
            `translate3d(${pt.x}px, ${pt.y + shadowOffsetY}px, 0) translate(-50%, -50%) scale(${shadowScale.toFixed(3)}, ${(shadowScale * 0.42).toFixed(3)})`;
        }

        // Trailing 3D particles along the arc behind the projectile
        for (let i = 0; i < TRAIL_COUNT; i++) {
          const tr = trailRefs.current[i];
          if (!tr) continue;
          const trailU = Math.max(0, u - (i + 1) * 0.045);
          if (u < 0.05) {
            tr.style.opacity = '0';
            continue;
          }
          const tPt = evalArc(trailU);
          const tElev = Math.sin(Math.PI * trailU);
          const tScale = (0.65 + tElev * 0.55) * (1 - i * 0.14);
          tr.style.opacity = `${Math.max(0, 0.78 - i * 0.15)}`;
          tr.style.transform = `translate3d(${tPt.x}px, ${tPt.y}px, 0) translate(-50%, -50%) scale(${tScale.toFixed(3)})`;
        }
      } else {
        // 3. Impact phase (FLIGHT_DURATION_MS .. TOTAL_DURATION_MS)
        if (!impactTriggered) {
          impactTriggered = true;
          triggerAvatarImpactRecoil();
        }

        const ip = Math.min(1, (elapsed - FLIGHT_DURATION_MS) / IMPACT_DURATION_MS);
        const easedIp = easeOutCubic(ip);

        // Hide trail & ground shadow
        if (shadowRef.current) shadowRef.current.style.opacity = '0';
        for (let i = 0; i < TRAIL_COUNT; i++) {
          const tr = trailRefs.current[i];
          if (tr) tr.style.opacity = '0';
        }

        // Projectile bounce-off / dissolve on impact
        if (projectileRef.current) {
          if (flight.kind === 'slipper') {
            const bx = endPt.x - dirSign * easedIp * 46;
            const by = endPt.y - Math.sin(ip * Math.PI) * 44 + ip * ip * 38;
            const rot = dirSign * (720 + ip * 320);
            projectileRef.current.style.opacity = `${Math.max(0, 1 - ip * 1.45)}`;
            projectileRef.current.style.transform =
              `translate3d(${bx}px, ${by}px, 0) translate(-50%, -50%) scale(${(1.05 - ip * 0.35).toFixed(3)}) rotateZ(${rot.toFixed(1)}deg)`;
          } else {
            projectileRef.current.style.opacity = `${Math.max(0, 1 - ip * 4.5)}`;
          }
        }

        // Impact root centered on target avatar
        if (impactRootRef.current) {
          impactRootRef.current.style.opacity = '1';
          impactRootRef.current.style.transform = `translate3d(${endPt.x}px, ${endPt.y}px, 0)`;
        }

        // Shockwave ring
        if (shockwaveRef.current) {
          const swP = Math.min(1, ip * 2.1);
          shockwaveRef.current.style.transform = `translate(-50%, -50%) scale(${(0.45 + easeOutCubic(swP) * 1.65).toFixed(3)})`;
          shockwaveRef.current.style.opacity = `${Math.max(0, 0.9 - swP)}`;
        }

        // Tomato splat / comic impact star decal right over target avatar
        if (splatRef.current) {
          const popScale = ip < 0.14 ? 0.4 + (ip / 0.14) * 0.72 : 1.12 - (ip - 0.14) * 0.08;
          const dripY = flight.kind === 'tomato' ? ip * ip * 14 : 0;
          const fadeOut = ip > 0.65 ? Math.max(0, 1 - (ip - 0.65) / 0.35) : 1;
          splatRef.current.style.opacity = fadeOut.toFixed(3);
          splatRef.current.style.transform = `translate(-50%, -50%) translate3d(0, ${dripY.toFixed(1)}px, 0) scale(${popScale.toFixed(3)})`;
        }

        // Radial 3D burst particles (droplets / confetti / bills / comic sparks)
        for (let i = 0; i < PARTICLE_SEEDS.length; i++) {
          const pEl = particleRefs.current[i];
          if (!pEl) continue;
          const seed = PARTICLE_SEEDS[i];
          const dist = seed.speed * easedIp * (flight.kind === 'confetti' ? 1.25 : 1);
          const gravity =
            flight.kind === 'confetti' || flight.kind === 'cash_stack' ? ip * ip * 58 : ip * ip * 32;
          const px = Math.cos(seed.angle) * dist;
          const py = Math.sin(seed.angle) * dist + gravity;
          const pFade = Math.max(0, 1 - Math.max(0, ip - 0.35) / 0.65);
          const rot3d = seed.spin * ip;
          pEl.style.opacity = pFade.toFixed(3);
          pEl.style.transform =
            `translate(-50%, -50%) translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) ` +
            `rotateX(${(rot3d * 0.7).toFixed(0)}deg) rotateZ(${rot3d.toFixed(0)}deg)`;
        }
      }

      if (elapsed < TOTAL_DURATION_MS) {
        raf = requestAnimationFrame(step);
      } else {
        onComplete(flight.id);
      }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [flight, reducedMotion, onComplete]);

  const meta = getTaunt3DMeta(flight.kind);

  return (
    <div
      data-testid={`bt-avatar-taunt-flight-${flight.kind}`}
      className="fixed inset-0 pointer-events-none"
      style={{ perspective: '1100px' }}
    >
      {/* Sender Launch Ring */}
      {!reducedMotion && (
        <div
          ref={launchRingRef}
          className="fixed top-0 left-0 h-14 w-14 rounded-full border-3 will-change-transform"
          style={{
            borderColor: meta.accentHex,
            opacity: 0,
          }}
        />
      )}

      {/* Synchronized Depth Shadow */}
      {!reducedMotion && (
        <div
          ref={shadowRef}
          className="fixed top-0 left-0 h-10 w-10 rounded-full bg-[#141c2b] will-change-transform"
          style={{ opacity: 0, filter: 'blur(6px)' }}
        />
      )}

      {/* Motion Trail Particles */}
      {!reducedMotion &&
        Array.from({ length: TRAIL_COUNT }, (_, idx) => (
          <div
            key={idx}
            ref={(el) => {
              trailRefs.current[idx] = el;
            }}
            className="fixed top-0 left-0 rounded-full will-change-transform"
            style={{
              width: `${10 - idx * 1.4}px`,
              height: `${10 - idx * 1.4}px`,
              backgroundColor:
                flight.kind === 'tomato'
                  ? '#EF4444'
                  : flight.kind === 'cash_stack'
                    ? '#22C55E'
                    : flight.kind === 'confetti'
                      ? PARTICLE_SEEDS[idx].color
                      : '#38BDF8',
              opacity: 0,
            }}
          />
        ))}

      {/* Flying 3D Projectile */}
      {!reducedMotion && (
        <div
          ref={projectileRef}
          className="fixed top-0 left-0 will-change-transform"
          style={{
            opacity: 0,
            transformStyle: 'preserve-3d',
            filter: 'drop-shadow(0 10px 14px rgba(20, 28, 43, 0.34))',
          }}
        >
          <Taunt3DItemIcon kind={flight.kind} className="h-14 w-14" />
        </div>
      )}

      {/* Target Avatar Impact Layer */}
      <div
        ref={impactRootRef}
        className="fixed top-0 left-0 will-change-transform"
        style={{ opacity: 0, transformStyle: 'preserve-3d' }}
      >
        {/* Shockwave Ring */}
        {!reducedMotion && (
          <div
            ref={shockwaveRef}
            className="absolute top-0 left-0 h-16 w-16 rounded-full border-4 will-change-transform"
            style={{ borderColor: meta.accentHex, opacity: 0 }}
          />
        )}

        {/* Center Impact Decal (Tomato Splat / Slipper Comic Star / Cash & Confetti Glow) */}
        <div ref={splatRef} className="absolute top-0 left-0 will-change-transform">
          {reducedMotion ? (
            <div className="h-14 w-14 rounded-full bg-[#faf8f3] border-2 border-[#182232] shadow-lg flex items-center justify-center">
              <Taunt3DItemIcon kind={flight.kind} className="h-10 w-10" />
            </div>
          ) : flight.kind === 'tomato' ? (
            <svg viewBox="0 0 80 80" className="h-20 w-20 drop-shadow-md" aria-hidden="true">
              <path
                d="M40 12 C45 18, 55 11, 57 19 C64 21, 69 29, 62 36 C68 44, 61 54, 53 52 C51 62, 42 68, 37 59 C29 66, 19 60, 22 50 C12 49, 11 37, 19 33 C13 25, 22 15, 31 20 C33 13, 37 10, 40 12 Z"
                fill="#DC2626"
                fillOpacity="0.92"
              />
              <circle cx="33" cy="31" r="4.5" fill="#FCA5A5" fillOpacity="0.7" />
              <circle cx="48" cy="41" r="2.6" fill="#FEE2E2" fillOpacity="0.75" />
              <circle cx="29" cy="44" r="2" fill="#FEF08A" fillOpacity="0.85" />
              <circle cx="44" cy="30" r="1.8" fill="#FEF08A" fillOpacity="0.85" />
            </svg>
          ) : flight.kind === 'slipper' ? (
            <svg viewBox="0 0 80 80" className="h-20 w-20 drop-shadow-md" aria-hidden="true">
              <polygon
                points="40,6 47,26 68,18 55,36 74,47 52,50 56,72 40,56 24,72 28,50 6,47 25,36 12,18 33,26"
                fill="#FACC15"
                stroke="#EA580C"
                strokeWidth="3"
                strokeLinejoin="round"
              />
              <polygon
                points="40,18 44,31 57,26 49,38 60,45 47,47 49,59 40,49 31,59 33,47 20,45 31,38 23,26 36,31"
                fill="#FEF9C3"
              />
            </svg>
          ) : null}
        </div>

        {/* 3D Tumbling Burst Particles */}
        {!reducedMotion &&
          PARTICLE_SEEDS.map((seed, idx) => (
            <div
              key={idx}
              ref={(el) => {
                particleRefs.current[idx] = el;
              }}
              className="absolute top-0 left-0 will-change-transform"
              style={{ opacity: 0 }}
            >
              {flight.kind === 'cash_stack' ? (
                <span
                  className="block rounded-[3px] border border-emerald-900/60 shadow-xs"
                  style={{
                    width: `${seed.size * 1.8}px`,
                    height: `${seed.size * 1.05}px`,
                    backgroundColor: idx % 3 === 0 ? '#FACC15' : '#22C55E',
                  }}
                />
              ) : flight.kind === 'confetti' ? (
                <span
                  className="block rounded-[2px] shadow-xs"
                  style={{
                    width: `${seed.size * 1.35}px`,
                    height: `${seed.size * 0.65}px`,
                    backgroundColor: seed.color,
                  }}
                />
              ) : flight.kind === 'tomato' ? (
                <span
                  className="block rounded-full"
                  style={{
                    width: `${seed.size * 0.85}px`,
                    height: `${seed.size * 0.85}px`,
                    backgroundColor: idx % 3 === 0 ? '#F87171' : '#DC2626',
                  }}
                />
              ) : (
                <span
                  className="block rounded-full"
                  style={{
                    width: `${seed.size * 0.8}px`,
                    height: `${seed.size * 0.8}px`,
                    backgroundColor: idx % 2 === 0 ? '#38BDF8' : '#FACC15',
                  }}
                />
              )}
            </div>
          ))}
      </div>
    </div>
  );
};

export const AvatarTauntOverlay: React.FC<AvatarTauntOverlayProps> = ({
  flights,
  onFlightComplete,
}) => {
  const reducedMotionRef = useRef<boolean>(readPrefersReducedMotion());

  useEffect(() => {
    return subscribePrefersReducedMotion((next) => {
      reducedMotionRef.current = next;
    });
  }, []);

  if (flights.length === 0) return null;

  return (
    <div
      data-testid="bt-avatar-taunt-overlay"
      className="fixed inset-0 z-45 pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      {flights.map((flight) => (
        <SingleAvatarTauntFlight
          key={flight.id}
          flight={flight}
          reducedMotion={reducedMotionRef.current}
          onComplete={onFlightComplete}
        />
      ))}
    </div>
  );
};
