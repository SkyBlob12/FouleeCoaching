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
  formatClock,
  type ActivitySummary,
  type EffortDetail,
  type AthleteProfile,
  type FitnessEstimate,
  type Sport,
  type VdotSource,
} from '@engine';
import { formatDate } from './sessions';

export type { EffectiveProfile, SavedProfile } from '../../shared/profile';
export { aiAllowed, declaredSamples, declaredVdot } from '../../shared/profile';

export const VDOT_SOURCE_LABEL: Record<EffectiveProfile['vdotSource'], string> = {
  manual: 'saisie à la main',
  vma_test: 'd’après ton test VMA',
  declared_race: 'd’après ta course déclarée',
  activities: 'moyenne cardio de tes dernières sorties',
  race: 'd’après ta dernière course Strava',
  best_effort: 'd’après ton meilleur effort récent',
  default: 'valeur par défaut, renseigne une course',
};

/** « d’après ton 5 km en 22:41 du 12 oct. » : la mesure qui fixe le niveau, quand il y en a une. */
export function vdotSourceLabel(p: EffectiveProfile): string {
  const b = p.vdotBasis;
  if (p.vdotSource === 'activities') return `moyenne cardio de tes ${p.vdotSamples.filter((s) => s.method === 'hr').length} dernières sorties`;
  if (!b?.effort) return VDOT_SOURCE_LABEL[p.vdotSource];
  const when = formatDate(b.date, { day: 'numeric', month: 'short' });
  const what = b.method === 'best_effort' ? `ton ${b.effort.label} en ${formatClock(b.effort.timeSec)} (« ${b.name} »)` : `ta course ${b.effort.label} en ${formatClock(b.effort.timeSec)}`;
  return `d’après ${what} du ${when}`;
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

export function estimateFrom(activities: ActivitySummary[], saved: SavedProfile | null, details: EffortDetail[] = []) {
  return estimateFitness(activities, today(), saved ?? undefined, declaredSamples(saved), details);
}

/** Toutes les mesures de VO2 max de l'historique Strava (6 mois) et de ton profil, et la moyenne glissante. */
export function progressionFrom(activities: ActivitySummary[], saved: SavedProfile | null, details: EffortDetail[] = []) {
  const samples = vo2Samples(activities, saved ?? undefined, declaredSamples(saved), details, today());
  const hr = hrBounds(activities.filter((a) => isRun(a.sportType)), saved ?? undefined);
  return { samples, points: vo2Progression(samples, hr) };
}
