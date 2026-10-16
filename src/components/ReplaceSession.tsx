import { useMemo, useState } from 'react';
import { customSession, estimateWorkout, formatDuration, formatKm, type CustomKind, type Sport, type Workout } from '@engine';
import { useReady } from '../lib/data';
import { CUSTOM_KINDS, CUSTOM_LEVELS } from '../lib/sessions';

interface Props {
  sport: Sport;
  busy: boolean;
  onReplace: (w: Workout) => Promise<void>;
}

/** Choix d'une autre séance, calée sur les allures actuelles, à mettre à la place de celle-ci. */
export function ReplaceSession({ sport, busy, onReplace }: Props) {
  const { profile, plan, saved } = useReady();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<CustomKind>('easy');
  const [level, setLevel] = useState(0.5);
  const [km, setKm] = useState('8');

  const kinds = CUSTOM_KINDS.filter((k) => !k.trail || sport === 'trail');
  const meta = kinds.find((k) => k.kind === kind) ?? kinds[0];
  const workout = useMemo(
    () =>
      customSession(meta.kind, {
        vdot: profile.vdot,
        sport,
        category: plan?.category,
        level,
        km: Number(km.replace(',', '.')) || 8,
        athleteLevel: profile.level,
        fragile: saved?.fragile,
      }),
    [meta.kind, sport, plan?.category, level, km, profile.vdot, profile.level, saved?.fragile],
  );
  const est = estimateWorkout(workout, profile.vdot);

  if (!open) {
    return (
      <button className="btn btn-secondary" disabled={busy} onClick={() => setOpen(true)}>
        Remplacer par une autre séance
      </button>
    );
  }

  return (
    <div className="stack replace">
      <label className="field">
        <span>Remplacer par</span>
        <select value={meta.kind} onChange={(e) => setKind(e.target.value as CustomKind)}>
          {kinds.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
        <span className="hint">{meta.hint}</span>
      </label>
      {meta.distance ? (
        <label className="field">
          <span>Distance (km)</span>
          <input type="number" min={3} max={60} inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} />
        </label>
      ) : (
        <div className="field">
          <span>Difficulté</span>
          <div className="seg" role="group" aria-label="Difficulté">
            {CUSTOM_LEVELS.map((l) => (
              <button key={l.v} type="button" aria-pressed={level === l.v} onClick={() => setLevel(l.v)}>
                {l.l}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="small muted">
        {workout.title} : {formatDuration(est.durationSec)}
        {est.distanceM > 0 ? `, ${formatKm(est.distanceM)}` : ''}.
      </p>
      <div className="row">
        <button className="btn btn-primary" disabled={busy} onClick={() => onReplace(workout).then(() => setOpen(false))}>
          Remplacer
        </button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => setOpen(false)}>
          Annuler
        </button>
      </div>
    </div>
  );
}
