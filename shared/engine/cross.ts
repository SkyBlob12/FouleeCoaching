import type { CrossIntensity, OtherSport, Workout } from './types';

/** IF équivalent (100 pts = 1 h au seuil) : un match de handball ≈ 0,82. */
export const CROSS_IF: Record<CrossIntensity, number> = { low: 0.55, moderate: 0.7, high: 0.82 };

export const CROSS_LABEL: Record<CrossIntensity, string> = { low: 'Facile', moderate: 'Modéré', high: 'Intense' };

export function crossLoad(o: Pick<OtherSport, 'intensity' | 'durationMin'>): number {
  const f = CROSS_IF[o.intensity];
  return (o.durationMin / 60) * f * f * 100;
}

export function crossWorkout(o: OtherSport): Workout {
  const name = o.label ? `${capitalize(o.sport)} : ${o.label.toLowerCase()}` : capitalize(o.sport);
  return {
    type: 'cross',
    title: name,
    purpose:
      o.intensity === 'high'
        ? 'Séance intense hors course : comptée comme une séance dure. Le plan évite la qualité la veille et le lendemain.'
        : 'Activité complémentaire comptée dans ta charge de la semaine.',
    blocks: [
      {
        repeat: 1,
        steps: [{ kind: 'steady', intensity: o.intensity === 'high' ? 'threshold' : o.intensity === 'moderate' ? 'marathon' : 'easy', durationSec: o.durationMin * 60 }],
      },
    ],
    cross: { sport: o.sport, intensity: o.intensity, durationMin: o.durationMin },
  };
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
