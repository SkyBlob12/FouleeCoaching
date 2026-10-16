import type { AthleteProfile } from './types';
import { resolveHr } from './zones';
import { trainingPaces } from './vdot';

/**
 * Charge d'entraînement façon TrainingPeaks / Strava « Forme & Fraîcheur ».
 * 100 points = 1 h au seuil.
 */

/** TRIMP de Banister (pondération exponentielle de la FC de réserve). */
export function trimp(durationSec: number, avgHr: number, hrRest: number, hrMax: number, sex: 'M' | 'F' = 'M'): number {
  const hrr = Math.min(1, Math.max(0, (avgHr - hrRest) / (hrMax - hrRest)));
  const [a, b] = sex === 'F' ? [0.86, 1.67] : [0.64, 1.92];
  return (durationSec / 60) * hrr * a * Math.exp(b * hrr);
}

export function hrLoad(durationSec: number, avgHr: number, profile: AthleteProfile): number | undefined {
  const { hrMax, hrRest, lthr } = resolveHr(profile);
  if (!hrMax || !lthr || hrMax <= hrRest) return undefined;
  const ref = trimp(3600, lthr, hrRest, hrMax, profile.sex);
  return (trimp(durationSec, avgHr, hrRest, hrMax, profile.sex) / ref) * 100;
}

/** Charge à l'allure : distance « équivalent plat » (100 m D+ = 1 km) vs allure seuil. */
export function paceLoad(durationSec: number, distanceM: number, elevationGain: number, profile: AthleteProfile): number {
  if (durationSec <= 0) return 0;
  const thresholdSpeed = 1000 / trainingPaces(profile.vdot).threshold; // m/s
  const eqSpeed = (distanceM + elevationGain * 10) / durationSec;
  const intensityFactor = Math.min(1.25, eqSpeed / thresholdSpeed);
  return (durationSec / 3600) * intensityFactor * intensityFactor * 100;
}

export interface ActivityLike {
  sportType: string;
  movingTimeSec: number;
  distanceM: number;
  elevationGain: number;
  avgHr?: number;
}

const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);

export function isRun(sportType: string): boolean {
  return RUN_TYPES.has(sportType);
}

export function activityLoad(a: ActivityLike, profile: AthleteProfile): number {
  const byHr = a.avgHr ? hrLoad(a.movingTimeSec, a.avgHr, profile) : undefined;
  if (isRun(a.sportType)) return byHr ?? paceLoad(a.movingTimeSec, a.distanceM, a.elevationGain, profile);
  if (a.sportType === 'Hike' || a.sportType === 'Walk') {
    return byHr ?? (a.movingTimeSec / 3600) * 0.45 * 0.45 * 100 + a.elevationGain * 0.02;
  }
  // autres sports : FC si dispo, sinon effort modéré par défaut
  return byHr ?? (a.movingTimeSec / 3600) * 0.6 * 0.6 * 100;
}

export interface FitnessPoint {
  date: string;
  load: number;
  ctl: number; // forme (42 j)
  atl: number; // fatigue (7 j)
  tsb: number; // fraîcheur = CTL − ATL de la veille
}

export function fitnessSeries(
  dailyLoad: Map<string, number>,
  startDate: string,
  endDate: string,
  seed: { ctl: number; atl: number } = { ctl: 0, atl: 0 },
): FitnessPoint[] {
  const kCtl = 1 - Math.exp(-1 / 42);
  const kAtl = 1 - Math.exp(-1 / 7);
  let { ctl, atl } = seed;
  const out: FitnessPoint[] = [];
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
    const load = dailyLoad.get(d) ?? 0;
    const tsb = ctl - atl;
    ctl += (load - ctl) * kCtl;
    atl += (load - atl) * kAtl;
    out.push({ date: d, load, ctl, atl, tsb });
  }
  return out;
}

/** Ratio charge aiguë / chronique (EWMA). Indicatif seulement : sa valeur prédictive est discutée. */
export function acwr(p: FitnessPoint): number | undefined {
  return p.ctl > 5 ? p.atl / p.ctl : undefined;
}

export type FormState = 'fresh' | 'optimal' | 'tired' | 'overreaching' | 'detraining';

export function formState(p: FitnessPoint): FormState {
  const rel = p.ctl > 0 ? p.tsb / p.ctl : 0;
  if (p.ctl < 5) return 'detraining';
  if (rel > 0.25) return 'fresh';
  if (rel >= -0.1) return 'optimal';
  if (rel >= -0.3) return 'tired';
  return 'overreaching';
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

/** Lundi de la semaine (ISO) contenant la date. */
export function mondayOf(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(iso, -dow);
}

export function weekdayOf(iso: string): number {
  return (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7;
}
