import { declaredSamples, resolveProfile as resolveShared, type EffectiveProfile, type SavedProfile } from '../../shared/profile';
import {
  activityLoad,
  addDays,
  clampVdot,
  estimateFitness,
  fitnessSeries,
  hrBounds,
  isRun,
  vo2Progression,
  vo2Samples,
  vmaFromVdot,
  type ActivitySummary,
  type AthleteProfile,
  type FitnessEstimate,
  type Sport,
  type VdotSource,
} from '@engine';

export type { EffectiveProfile, SavedProfile } from '../../shared/profile';
export { aiAllowed, declaredSamples, declaredVdot } from '../../shared/profile';

export const VDOT_SOURCE_LABEL: Record<EffectiveProfile['vdotSource'], string> = {
  manual: 'saisie à la main',
  vma_test: 'd’après ton test VMA',
  declared_race: 'd’après ta course déclarée',
  activities: 'moyenne de tes dernières sorties',
  race: 'd’après tes courses Strava récentes',
  best_effort: 'd’après tes sorties les plus rapides',
  default: 'valeur par défaut, renseigne une course',
};

/** « moyenne de tes 10 dernières sorties » : le nombre réel de mesures retenues. */
export function vdotSourceLabel(p: EffectiveProfile): string {
  if (p.vdotSource !== 'activities') return VDOT_SOURCE_LABEL[p.vdotSource];
  const n = p.vdotSamples.length;
  return `moyenne de tes ${n} dernières mesures (sorties avec cardio, courses, tests)`;
}

export function today(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function resolveProfile(saved: SavedProfile | null, estimate: FitnessEstimate): EffectiveProfile {
  return resolveShared(saved, estimate, today());
}

export function computeFitness(activities: ActivitySummary[], profile: AthleteProfile, days = 90) {
  const end = today();
  const loads = new Map<string, number>();
  for (const a of activities) loads.set(a.startDate, (loads.get(a.startDate) ?? 0) + activityLoad(a, profile));
  const first = activities[0]?.startDate ?? addDays(end, -days);
  const series = fitnessSeries(loads, first < addDays(end, -days) ? first : addDays(end, -days), end);
  return series.slice(-days);
}

export function estimateFrom(activities: ActivitySummary[], saved: SavedProfile | null) {
  return estimateFitness(activities, today(), saved ?? undefined, declaredSamples(saved));
}

/** Toutes les mesures de VO2 max de l'historique Strava (6 mois) et de ton profil, et la moyenne glissante. */
export function progressionFrom(activities: ActivitySummary[], saved: SavedProfile | null) {
  const samples = vo2Samples(activities, saved ?? undefined, declaredSamples(saved));
  const hr = hrBounds(activities.filter((a) => isRun(a.sportType)), saved ?? undefined);
  return { samples, points: vo2Progression(samples, hr) };
}
