import { useMemo } from 'react';
import {
  expandWorkout,
  formatDuration,
  intensityLabel,
  type Workout,
} from '@engine';
import { INTENSITY_COLOR, INTENSITY_HEIGHT } from '../lib/sessions';
import { useGridSnap } from './Charts';

interface Props {
  workout: Workout;
  vdot: number;
  height?: number;
  compact?: boolean;
}

const W = 1000;

/** Profil d'intensité : largeur = durée, hauteur et teinte = zone (comme un profil altimétrique). */
export function WorkoutProfile({ workout, vdot, height = 120, compact }: Props) {
  const segments = useMemo(() => expandWorkout(workout, vdot), [workout, vdot]);
  const snap = useGridSnap();
  const total = segments.reduce((s, x) => s + x.durationSec, 0) || 1;

  let x = 0;
  const rects = segments.map((seg, i) => {
    const w = (seg.durationSec / total) * W;
    const h = INTENSITY_HEIGHT[seg.step.intensity] * height;
    const r = { i, x, w, h, seg };
    x += w;
    return r;
  });

  // ligne de crête en escalier
  const ridge = rects.map((r) => `L${r.x.toFixed(1)},${(height - r.h).toFixed(1)} L${(r.x + r.w).toFixed(1)},${(height - r.h).toFixed(1)}`).join(' ');
  const path = `M0,${height} ${ridge} L${W},${height}`;

  // courbes de niveau : repères des zones Endurance / Seuil / VMA
  const guides = compact
    ? []
    : [
        { label: 'Endurance', h: INTENSITY_HEIGHT.easy },
        { label: 'Seuil', h: INTENSITY_HEIGHT.threshold },
        { label: 'VMA', h: INTENSITY_HEIGHT.interval },
      ].map((g) => ({ ...g, y: height - g.h * height }));

  return (
    <div ref={snap.ref} className="wprofile" style={{ paddingTop: compact ? 0 : snap.top }}>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
        role="img"
        aria-label={`Profil de la séance, ${formatDuration(total)}`}
        style={{ display: 'block' }}
      >
        {guides.map((g) => (
          <line key={g.label} x1={0} x2={W} y1={g.y} y2={g.y} stroke="var(--ink-3)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        ))}
        {rects.map((r) => (
          <rect key={r.i} x={r.x} y={height - r.h} width={Math.max(0.5, r.w)} height={r.h} fill={INTENSITY_COLOR[r.seg.step.intensity]}>
            <title>{`${formatDuration(r.seg.durationSec)}, ${intensityLabel(r.seg.step.intensity).toLowerCase()}`}</title>
          </rect>
        ))}
        <path d={path} fill="none" stroke="var(--ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <line x1={0} x2={W} y1={height - 0.5} y2={height - 0.5} stroke="var(--ink)" vectorEffect="non-scaling-stroke" />
      </svg>
      {guides.map((g) => (
        <span key={g.label} className="wprofile-guide" style={{ top: g.y + (compact ? 0 : snap.top) }}>
          {g.label}
        </span>
      ))}
      {!compact && (
        <div className="wprofile-axis tnum">
          <span>0</span>
          <span>{formatDuration(total)}</span>
        </div>
      )}
    </div>
  );
}
