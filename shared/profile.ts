import type { AthleteProfile, FragileZone, Level, OtherSport, Sex, Sport, StrengthPref } from './engine/types';
import type { FitnessEstimate, VdotSource, Vo2Sample } from './engine/estimate';
import { addDays } from './engine/load';
import { clampVdot, vdotFromRace, vmaFromVdot } from './engine/vdot';

/** Ce que l'athlète renseigne lui-même (stocké sans limite : ce n'est pas une donnée Strava). */
export interface SavedProfile {
  level: Level;
  sport: Sport;
  sex?: Sex;
  birthYear?: number;
  hrMax?: number;
  hrRest?: number;
  lthr?: number;
  race?: { distanceKm: number; timeSec: number; date: string };
  /** test demi-Cooper : distance en 6 minutes */
  vmaTest?: { distanceM: number; date: string };
  vdotManual?: number;
  /** ajustement cumulé issu des ressentis (± points de VDOT) */
  vdotOffset?: number;
  otherSports?: OtherSport[];
  strength?: StrengthPref;
  fragile?: FragileZone[];
  /** le coach IA (Claude) peut analyser les activités Strava pour affiner le plan : actif par défaut, false = refusé */
  aiActivities?: boolean;
}

/** Le coach IA est actif sauf si l'athlète l'a explicitement désactivé. */
export const aiAllowed = (s: SavedProfile | null | undefined) => s?.aiActivities !== false;

export type DeclaredSource = 'manual' | 'vma_test' | 'declared_race';

/**
 * Niveau issu uniquement de ce que l'athlète a déclaré (course, test, saisie).
 * C'est le seul qui peut être partagé avec une IA : jamais l'estimation tirée de Strava.
 */
export function declaredVdot(s: SavedProfile | null | undefined, today: string): { vdot: number; source: DeclaredSource } | null {
  if (!s) return null;
  if (s.vdotManual) return { vdot: s.vdotManual, source: 'manual' };
  if (s.vmaTest && s.vmaTest.date >= addDays(today, -180)) return { vdot: vdotFromRace(s.vmaTest.distanceM, 360), source: 'vma_test' };
  if (s.race && s.race.date >= addDays(today, -365)) return { vdot: vdotFromRace(s.race.distanceKm * 1000, s.race.timeSec), source: 'declared_race' };
  return null;
}

/** Course et test déclarés, comptés comme des mesures dans la moyenne des dernières sorties. */
export function declaredSamples(s: SavedProfile | null | undefined): Vo2Sample[] {
  const out: Vo2Sample[] = [];
  if (s?.race) {
    const km = s.race.distanceKm;
    out.push({ date: s.race.date, vdot: Math.round(vdotFromRace(km * 1000, s.race.timeSec) * 10) / 10, method: 'declared_race', name: `Course déclarée (${km.toLocaleString('fr-FR')} km)` });
  }
  if (s?.vmaTest) {
    out.push({ date: s.vmaTest.date, vdot: Math.round(vdotFromRace(s.vmaTest.distanceM, 360) * 10) / 10, method: 'vma_test', name: 'Test VMA (6 min)' });
  }
  return out;
}

export type EffectiveProfile = AthleteProfile & {
  weeklyElevation: number;
  vdotSource: VdotSource | 'manual' | 'declared_race' | 'vma_test';
  /** mesures moyennées quand vdotSource = activities (la plus récente d'abord) */
  vdotSamples: Vo2Sample[];
  /** d'où vient la FC seuil */
  lthrSource?: 'declared' | 'activities' | 'hr_max';
  /** ajustement issu des ressentis, déjà inclus dans vdot */
  vdotOffset: number;
  vma: number;
  sport: Sport;
};

export function resolveProfile(saved: SavedProfile | null, estimate: FitnessEstimate, todayIso: string): EffectiveProfile {
  const s: SavedProfile = saved ?? { level: 'intermediaire', sport: 'road' };
  let vdot = estimate.vdot;
  let vdotSource: EffectiveProfile['vdotSource'] = estimate.source;
  const declared = declaredVdot(s, todayIso);
  // VO2 max forcée d'abord, puis la moyenne des dernières mesures (qui inclut course et test déclarés),
  // puis une course ou un test déclarés seuls quand les mesures manquent
  if (declared && (declared.source === 'manual' || estimate.source !== 'activities')) {
    vdot = declared.vdot;
    vdotSource = declared.source;
  }
  const vdotOffset = s.vdotOffset ?? 0;
  vdot = clampVdot(vdot + vdotOffset);
  const hrMax = s.hrMax ?? estimate.maxHrSeen;
  const lthr = s.lthr ?? estimate.lthr;
  return {
    vdot: Math.round(vdot * 10) / 10,
    vdotSource,
    vdotSamples: vdotSource === 'activities' ? estimate.samples : [],
    lthrSource: s.lthr ? 'declared' : estimate.lthr ? 'activities' : hrMax || s.birthYear ? 'hr_max' : undefined,
    vdotOffset,
    vma: Math.round(vmaFromVdot(vdot) * 10) / 10,
    level: s.level,
    sport: s.sport,
    sex: s.sex,
    birthYear: s.birthYear,
    hrMax,
    hrRest: s.hrRest,
    lthr,
    weeklyKm: estimate.weeklyKm,
    weeklyElevation: estimate.weeklyElevation,
    longRunKm: estimate.longRunKm,
  };
}

