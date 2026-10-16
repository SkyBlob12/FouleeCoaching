import type { AthleteProfile } from './types';
import { addDays, isRun } from './load';
import { clampVdot, vdotFromRace, velocityFromVo2, vo2FromVelocity } from './vdot';
import { resolveHr } from './zones';

export interface ActivitySummary {
  id: number;
  name: string;
  sportType: string;
  startDate: string; // YYYY-MM-DD (local)
  movingTimeSec: number;
  elapsedTimeSec: number;
  distanceM: number;
  elevationGain: number;
  avgHr?: number;
  maxHr?: number;
  isRace?: boolean;
}

/** activities = moyenne des dernières mesures (sorties avec FC, courses, tests) */
export type VdotSource = 'activities' | 'race' | 'best_effort' | 'default';

/** Une mesure de VO2 max : une sortie Strava, ou une course / un test déclarés par l'athlète. */
export interface Vo2Sample {
  date: string;
  vdot: number;
  method: 'hr' | 'race' | 'declared_race' | 'vma_test';
  name: string;
  activityId?: number;
  /** vitesse ajustée au D+ (m/min) et FC moyenne : servent à estimer la FC seuil */
  speed?: number;
  avgHr?: number;
}

export interface Vo2Window {
  vdot: number;
  /** mesures retenues, la plus récente d'abord */
  samples: Vo2Sample[];
  /** FC prévue à l'allure seuil, d'après la droite FC / vitesse des sorties retenues */
  lthr?: number;
}

export interface FitnessEstimate {
  vdot: number;
  source: VdotSource;
  /** mesures de la moyenne courante (source activities) */
  samples: Vo2Sample[];
  lthr?: number;
  weeklyKm: number;
  weeklyElevation: number;
  longRunKm: number;
  runsPerWeek: number;
  maxHrSeen?: number;
}

/** Nombre de mesures moyennées. */
export const VO2_WINDOW = 10;
/** Au-delà, une mesure ne compte plus. */
const WINDOW_DAYS = 120;
const MIN_SAMPLES = 3;
/** VO2 max « labo » (Swain) → VDOT de course : l'économie de course d'un coureur moyen. */
const HR_TO_VDOT = 0.95;
const VO2_REST = 3.5;

/** Distance ajustée au dénivelé : 100 m de D+ ≈ 600 m de plat. */
const gapDistance = (a: ActivitySummary) => a.distanceM + a.elevationGain * 6;

export interface HrBounds {
  hrMax?: number;
  hrRest: number;
}

export function hrBounds(runs: ActivitySummary[], profile?: Partial<AthleteProfile>) {
  const maxHrSeen = Math.max(0, ...runs.map((a) => a.maxHr ?? 0)) || undefined;
  const hr = resolveHr({ vdot: 40, level: 'intermediaire', weeklyKm: 0, longRunKm: 0, ...profile, hrMax: profile?.hrMax ?? maxHrSeen });
  return { ...hr, maxHrSeen };
}

/**
 * VO2 max tirée d'une seule sortie.
 * - Course : VDOT direct (Daniels).
 * - Sortie avec FC : %FC de réserve ≈ %VO2 de réserve (Swain 1997), le principe de l'estimation
 *   Firstbeat/Garmin. Le coût en O2 de l'allure (Daniels), rapporté à la fraction de FC utilisée,
 *   donne la VO2 max : un footing compte autant qu'une séance dure.
 */
export function activityVo2(a: ActivitySummary, hr: HrBounds): Vo2Sample | null {
  if (!isRun(a.sportType) || a.distanceM < 1500 || a.movingTimeSec <= 0) return null;
  const base = { date: a.startDate, name: a.name, activityId: a.id };
  const speed = gapDistance(a) / (a.movingTimeSec / 60);
  if (a.isRace && a.distanceM >= 3000) {
    // effort régulier et intense : un bon point d'appui pour la droite FC / vitesse
    const anchor = a.avgHr ? { speed, avgHr: a.avgHr } : {};
    return { ...base, ...anchor, method: 'race', vdot: round1(clampVdot(vdotFromRace(gapDistance(a), a.movingTimeSec))) };
  }
  // trop court, ou trop raide (marche en côte) : la relation FC / vitesse ne tient plus
  if (!a.avgHr || !hr.hrMax || a.movingTimeSec < 20 * 60 || a.elevationGain / (a.distanceM / 1000) > 60) return null;
  const frac = (a.avgHr - hr.hrRest) / (hr.hrMax - hr.hrRest);
  if (frac < 0.6 || frac > 0.97) return null;
  const vo2max = VO2_REST + (vo2FromVelocity(speed) - VO2_REST) / frac;
  return { ...base, method: 'hr', vdot: round1(clampVdot(vo2max * HR_TO_VDOT)), speed, avgHr: a.avgHr };
}

/** Mesures de tout l'historique, de la plus ancienne à la plus récente. */
export function vo2Samples(activities: ActivitySummary[], profile?: Partial<AthleteProfile>, declared: Vo2Sample[] = []): Vo2Sample[] {
  const runs = activities.filter((a) => isRun(a.sportType));
  const hr = hrBounds(runs, profile);
  const fromStrava = runs.map((a) => activityVo2(a, hr)).filter((s): s is Vo2Sample => !!s);
  // une course déclarée déjà présente sur Strava n'est comptée qu'une fois
  const raceDays = new Set(fromStrava.filter((s) => s.method === 'race').map((s) => s.date));
  const own = declared.filter((d) => !(d.method === 'declared_race' && raceDays.has(d.date)));
  return [...fromStrava, ...own].sort((x, y) => x.date.localeCompare(y.date));
}

/**
 * Niveau à une date : moyenne des 10 dernières mesures de moins de 4 mois.
 * Dès 6 mesures, la plus haute et la plus basse sont écartées (canicule, cardio qui décroche, GPS…).
 */
export function vo2At(samples: Vo2Sample[], date: string, hr: HrBounds = { hrRest: 55 }): Vo2Window | null {
  const from = addDays(date, -WINDOW_DAYS);
  const win = samples
    .filter((s) => s.date <= date && s.date > from)
    .slice(-VO2_WINDOW)
    .reverse();
  if (win.length < MIN_SAMPLES) return null;
  const values = win.map((s) => s.vdot).sort((a, b) => a - b);
  const kept = values.length >= 6 ? values.slice(1, -1) : values;
  const vdot = round1(kept.reduce((s, v) => s + v, 0) / kept.length);
  return { vdot, samples: win, lthr: thresholdHr(win, vdot, hr) };
}

/**
 * FC seuil = FC prévue à l'allure seuil (88 % du VDOT), sur la droite FC / vitesse des sorties retenues.
 * Seulement si la droite est fiable : assez de sorties, des allures variées, une pente plausible.
 */
export function thresholdHr(samples: Vo2Sample[], vdot: number, hr: HrBounds = { hrRest: 55 }): number | undefined {
  const pts = samples.filter((s) => s.speed && s.avgHr).map((s) => ({ x: s.speed!, y: s.avgHr! }));
  if (pts.length < 5) return undefined;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  const sxy = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const syy = pts.reduce((s, p) => s + (p.y - my) ** 2, 0);
  const spread = (Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x))) / mx;
  if (spread < 0.08 || sxx === 0 || syy === 0) return undefined;
  const slope = sxy / sxx;
  const r2 = (sxy * sxy) / (sxx * syy);
  if (slope <= 0 || r2 < 0.4) return undefined;
  const lthr = Math.round(my + slope * (velocityFromVo2(vdot * 0.88) - mx));
  // hors de 85–95 % de la FC max, l'extrapolation n'est plus crédible
  const [lo, hi] = hr.hrMax ? [0.85 * hr.hrMax, 0.95 * hr.hrMax] : [hr.hrRest + 60, 200];
  return lthr >= lo && lthr <= hi ? lthr : undefined;
}

/**
 * Estime le niveau depuis l'historique :
 * 1. moyenne des 10 dernières mesures (sorties avec FC, courses, tests déclarés) ;
 * 2. sinon les courses Strava récentes ;
 * 3. sinon la meilleure sortie rapide, majorée.
 */
export function estimateFitness(activities: ActivitySummary[], today: string, profile?: Partial<AthleteProfile>, declared: Vo2Sample[] = []): FitnessEstimate {
  const runs = activities.filter((a) => isRun(a.sportType) && a.distanceM > 1500 && a.movingTimeSec > 0);
  const since = (days: number) => runs.filter((a) => a.startDate > addDays(today, -days));

  const last28 = since(28);
  const weeklyKm = last28.reduce((s, a) => s + a.distanceM, 0) / 1000 / 4;
  const weeklyElevation = last28.reduce((s, a) => s + a.elevationGain, 0) / 4;
  const longRunKm = Math.max(0, ...since(42).map((a) => a.distanceM / 1000));
  const runsPerWeek = last28.length / 4;
  const hr = hrBounds(runs, profile);

  const base = { weeklyKm, weeklyElevation, longRunKm, runsPerWeek, maxHrSeen: hr.maxHrSeen };

  const win = vo2At(vo2Samples(activities, profile, declared), today, hr);
  if (win) return { ...base, vdot: win.vdot, source: 'activities', samples: win.samples, lthr: win.lthr };

  const races = since(180).filter((a) => a.isRace);
  if (races.length) {
    const vdot = races.reduce((s, a) => s + vdotFromRace(gapDistance(a), a.movingTimeSec), 0) / races.length;
    return { ...base, vdot: round1(clampVdot(vdot)), source: 'race', samples: [] };
  }

  const recent = since(90).filter((a) => a.distanceM >= 3000);
  if (recent.length) {
    const best = Math.max(...recent.map((a) => vdotFromRace(gapDistance(a), a.movingTimeSec)));
    return { ...base, vdot: round1(clampVdot(best * 1.08)), source: 'best_effort', samples: [] };
  }
  return { ...base, vdot: 35, source: 'default', samples: [] };
}

export interface ProgressPoint {
  date: string;
  vdot: number;
  lthr?: number;
}

/** Niveau recalculé après chaque mesure : la courbe de progression. */
export function vo2Progression(samples: Vo2Sample[], hr: HrBounds = { hrRest: 55 }): ProgressPoint[] {
  const out: ProgressPoint[] = [];
  for (const s of samples) {
    const w = vo2At(samples, s.date, hr);
    if (!w) continue;
    const point = { date: s.date, vdot: w.vdot, lthr: w.lthr };
    if (out.at(-1)?.date === s.date) out[out.length - 1] = point;
    else out.push(point);
  }
  return out;
}

function round1(x: number) {
  return Math.round(x * 10) / 10;
}
