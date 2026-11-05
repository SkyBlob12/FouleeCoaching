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

/**
 * Ce qui fixe le niveau :
 * - race : une course Strava récente ; declared_race / vma_test : course ou test saisis dans le profil ;
 * - best_effort : ton meilleur effort Strava récent (le 5 km, 10 km… le plus rapide couru dans une sortie) ;
 * - activities : la moyenne cardio de tes dernières sorties (allure rapportée à la FC) ;
 * - default : rien d'exploitable.
 */
export type VdotSource = 'activities' | 'race' | 'best_effort' | 'declared_race' | 'vma_test' | 'default';

/** Une mesure de VO2 max : une sortie Strava, ou une course / un test déclarés par l'athlète. */
export interface Vo2Sample {
  date: string;
  vdot: number;
  method: 'hr' | 'race' | 'best_effort' | 'declared_race' | 'vma_test';
  name: string;
  activityId?: number;
  /** effort chronométré qui donne la mesure (course, meilleur effort) */
  effort?: { label: string; timeSec: number };
  /** vitesse ajustée au D+ (m/min) et FC moyenne : servent à estimer la FC seuil */
  speed?: number;
  avgHr?: number;
  /** mesure cardio avant calibrage personnel */
  rawVdot?: number;
}

/** Meilleurs efforts et VAP d'une sortie (détail Strava). */
export interface EffortDetail {
  id: number;
  bestEfforts: { name: string; distanceM: number; movingTimeSec: number }[];
  /** VAP de Strava sur toute la sortie (m/s) */
  gapSpeed?: number;
}

export interface Vo2Window {
  vdot: number;
  /** ce qui a fixé le niveau */
  source: Exclude<VdotSource, 'default'>;
  /** la mesure décisive (course, test ou meilleur effort), absente si c'est la moyenne cardio */
  basis?: Vo2Sample;
  /** moyenne cardio (au moins 3 sorties exploitables) */
  hrVdot?: number;
  /** mesures prises en compte, la plus récente d'abord */
  samples: Vo2Sample[];
  /** FC prévue à l'allure seuil, d'après la droite FC / vitesse des sorties retenues */
  lthr?: number;
}

export interface FitnessEstimate {
  vdot: number;
  source: VdotSource;
  basis?: Vo2Sample;
  hrVdot?: number;
  /** calibrage du cardio sur ta dernière course */
  hrCalibration?: HrCalibration;
  /** mesures prises en compte (la plus récente d'abord) */
  samples: Vo2Sample[];
  lthr?: number;
  weeklyKm: number;
  weeklyElevation: number;
  longRunKm: number;
  runsPerWeek: number;
  maxHrSeen?: number;
}

/** Nombre de sorties cardio moyennées. */
export const VO2_WINDOW = 10;
/** Au-delà, une mesure ne compte plus. */
const WINDOW_DAYS = 120;
const MIN_HR_SAMPLES = 3;
/** Une performance perd 1 point de VDOT par mois au-delà de 4 semaines (désentraînement, prudence). */
const PERF_FRESH_DAYS = 28;
const PERF_DECAY_PER_DAY = 1 / 30;
/** La moyenne cardio peut relever une course récente d'au plus 2 points (FC max mal connue, chaleur…). */
const HR_ABOVE_RACE = 2;
/** Meilleurs efforts retenus : à partir de 3 km (en dessous, ils surestiment l'endurance). */
const BEST_EFFORT_MIN_M = 3000;
/** VO2 max « labo » (Swain) → VDOT de course : l'économie de course d'un coureur moyen. */
const HR_TO_VDOT = 0.95;
const VO2_REST = 3.5;

/** Distance ajustée au dénivelé : 100 m de D+ ≈ 600 m de plat. */
const gapDistance = (a: ActivitySummary) => a.distanceM + a.elevationGain * 6;

const EFFORT_LABEL: Record<string, string> = {
  '2 mile': '2 miles',
  '5K': '5 km',
  '10K': '10 km',
  '15K': '15 km',
  '10 mile': '10 miles',
  '20K': '20 km',
  'Half-Marathon': 'semi',
  '30K': '30 km',
  Marathon: 'marathon',
  '50K': '50 km',
};

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
export function activityVo2(a: ActivitySummary, hr: HrBounds, gapSpeed?: number): Vo2Sample | null {
  if (!isRun(a.sportType) || a.distanceM < 1500 || a.movingTimeSec <= 0) return null;
  const base = { date: a.startDate, name: a.name, activityId: a.id };
  // VAP de Strava (relief réel) quand on l'a, sinon le D+ converti en distance
  const speed = gapSpeed && gapSpeed > 0 ? gapSpeed * 60 : gapDistance(a) / (a.movingTimeSec / 60);
  if (a.isRace && a.distanceM >= 3000) {
    // effort régulier et intense : un bon point d'appui pour la droite FC / vitesse
    const anchor = a.avgHr ? { speed, avgHr: a.avgHr } : {};
    return {
      ...base,
      ...anchor,
      method: 'race',
      effort: { label: `${fmtKm(a.distanceM)} km`, timeSec: a.movingTimeSec },
      vdot: round1(clampVdot(vdotFromRace(speed * (a.movingTimeSec / 60), a.movingTimeSec))),
    };
  }
  // trop court, ou trop raide (marche en côte) : la relation FC / vitesse ne tient plus
  if (!a.avgHr || !hr.hrMax || a.movingTimeSec < 20 * 60 || a.elevationGain / (a.distanceM / 1000) > 60) return null;
  const frac = (a.avgHr - hr.hrRest) / (hr.hrMax - hr.hrRest);
  if (frac < 0.6 || frac > 0.97) return null;
  const vo2max = VO2_REST + (vo2FromVelocity(speed) - VO2_REST) / frac;
  return { ...base, method: 'hr', vdot: round1(clampVdot(vo2max * HR_TO_VDOT)), speed, avgHr: a.avgHr };
}

/** Le meilleur effort Strava (≥ 3 km) d'une sortie : ce que tu as réellement couru, chrono en main. */
export function bestEffortVo2(a: ActivitySummary, d: EffortDetail): Vo2Sample | null {
  if (!isRun(a.sportType)) return null;
  let best: Vo2Sample | null = null;
  for (const e of d.bestEfforts) {
    if (e.distanceM < BEST_EFFORT_MIN_M || e.movingTimeSec <= 0) continue;
    const vdot = vdotFromRace(e.distanceM, e.movingTimeSec);
    if (!Number.isFinite(vdot) || vdot > 85) continue; // GPS fou
    if (!best || vdot > best.vdot) {
      best = {
        date: a.startDate,
        name: a.name,
        activityId: a.id,
        method: 'best_effort',
        effort: { label: EFFORT_LABEL[e.name] ?? e.name, timeSec: e.movingTimeSec },
        vdot: round1(clampVdot(vdot)),
      };
    }
  }
  return best;
}

/**
 * Calibrage personnel du cardio. La relation FC / VO2 de Swain est une moyenne de population : à allure
 * égale, certains coureurs ont 20 à 30 bpm de plus que prévu en endurance, et le cardio les sous-estime
 * de plusieurs points. On compare donc la course (ou le test) la plus récente au niveau cardio de la même
 * période (± 4 semaines, 3 sorties au moins) : le rapport des deux corrige toutes les mesures cardio.
 * La course fixe le niveau absolu, le cardio en suit l'évolution.
 */
export interface HrCalibration {
  factor: number;
  anchor: Vo2Sample;
  /** niveau cardio brut autour de la course */
  hrAtAnchor: number;
}

const CALIB_DAYS = 28;
const CALIB_MIN = 0.85;
const CALIB_MAX = 1.4;

export function hrCalibration(samples: Vo2Sample[], today: string): HrCalibration | undefined {
  const anchors = samples
    .filter((s) => (s.method === 'race' || s.method === 'declared_race' || s.method === 'vma_test') && s.date <= today && s.date > addDays(today, -365))
    .sort((a, b) => b.date.localeCompare(a.date));
  for (const anchor of anchors) {
    const near = samples.filter(
      (s) => s.method === 'hr' && s.date >= addDays(anchor.date, -CALIB_DAYS) && s.date <= addDays(anchor.date, CALIB_DAYS),
    );
    if (near.length < MIN_HR_SAMPLES) continue;
    const hrAtAnchor = trimmedMean(near.map((s) => s.vdot));
    const factor = Math.min(CALIB_MAX, Math.max(CALIB_MIN, anchor.vdot / hrAtAnchor));
    return { factor: Math.round(factor * 1000) / 1000, anchor, hrAtAnchor: round1(hrAtAnchor) };
  }
  return undefined;
}

function trimmedMean(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const kept = v.length >= 6 ? v.slice(1, -1) : v;
  return kept.reduce((s, x) => s + x, 0) / kept.length;
}

/**
 * Mesures de tout l'historique, de la plus ancienne à la plus récente, avec le cardio calibré
 * sur ta dernière course (voir hrCalibration).
 */
export function vo2Samples(
  activities: ActivitySummary[],
  profile?: Partial<AthleteProfile>,
  declared: Vo2Sample[] = [],
  details: EffortDetail[] = [],
  today = new Date().toISOString().slice(0, 10),
): Vo2Sample[] {
  return calibratedSamples(rawVo2Samples(activities, profile, declared, details), today).samples;
}

export function calibratedSamples(raw: Vo2Sample[], today: string): { samples: Vo2Sample[]; calibration?: HrCalibration } {
  const calibration = hrCalibration(raw, today);
  if (!calibration) return { samples: raw };
  return {
    calibration,
    samples: raw.map((s) => (s.method === 'hr' ? { ...s, rawVdot: s.vdot, vdot: round1(clampVdot(s.vdot * calibration.factor)) } : s)),
  };
}

/** Mesures brutes (cardio non calibré). */
export function rawVo2Samples(
  activities: ActivitySummary[],
  profile?: Partial<AthleteProfile>,
  declared: Vo2Sample[] = [],
  details: EffortDetail[] = [],
): Vo2Sample[] {
  const runs = activities.filter((a) => isRun(a.sportType));
  const hr = hrBounds(runs, profile);
  const byId = new Map(details.map((d) => [d.id, d]));
  const fromStrava: Vo2Sample[] = [];
  for (const a of runs) {
    const d = byId.get(a.id);
    const s = activityVo2(a, hr, d?.gapSpeed);
    const be = d ? bestEffortVo2(a, d) : null;
    if (s?.method === 'race') {
      // course : une seule mesure, le chrono officiel ou un segment plus rapide couru dedans
      fromStrava.push(be && be.vdot > s.vdot ? { ...s, vdot: be.vdot, effort: be.effort } : s);
      continue;
    }
    if (s) fromStrava.push(s);
    if (be) fromStrava.push(be);
  }
  // une course déclarée déjà présente sur Strava n'est comptée qu'une fois
  const raceDays = new Set(fromStrava.filter((s) => s.method === 'race').map((s) => s.date));
  const own = declared.filter((d) => !(d.method === 'declared_race' && raceDays.has(d.date)));
  return [...fromStrava, ...own].sort((x, y) => x.date.localeCompare(y.date));
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/** Valeur d'une performance à une date : elle s'érode doucement avec l'âge. */
export function perfValue(s: Vo2Sample, date: string): number {
  const age = daysBetween(s.date, date);
  return s.vdot - Math.max(0, age - PERF_FRESH_DAYS) * PERF_DECAY_PER_DAY;
}

/** La meilleure performance, sauf si elle est isolée loin devant la suivante (GPS, parcours trop court). */
function topPerf(perfs: Vo2Sample[], date: string): Vo2Sample | undefined {
  const sorted = [...perfs].sort((x, y) => perfValue(y, date) - perfValue(x, date));
  if (sorted.length >= 2 && perfValue(sorted[0], date) - perfValue(sorted[1], date) > 3) return sorted[1];
  return sorted[0];
}

/**
 * Niveau à une date, sur les 4 derniers mois.
 * 1. Ce que tu as couru en compétition : une course (Strava ou déclarée) ou un test fixent le niveau.
 *    La moyenne cardio peut le relever d'au plus 2 points, jamais le baisser.
 * 2. Sans course, la moyenne cardio de tes 10 dernières sorties (plus haute et plus basse écartées dès 6).
 * 3. Dans tous les cas, ton meilleur effort Strava récent est un plancher : tu l'as réellement couru.
 * Les performances perdent 1 point par mois au-delà de 4 semaines.
 */
export function vo2At(samples: Vo2Sample[], date: string, hr: HrBounds = { hrRest: 55 }): Vo2Window | null {
  const from = addDays(date, -WINDOW_DAYS);
  const inWin = samples.filter((s) => s.date <= date && s.date > from);
  const hrWin = inWin.filter((s) => s.method === 'hr').slice(-VO2_WINDOW);
  const races = inWin.filter((s) => s.method === 'race' || s.method === 'declared_race' || s.method === 'vma_test');
  const bests = inWin.filter((s) => s.method === 'best_effort');

  let hrVdot: number | undefined;
  if (hrWin.length >= MIN_HR_SAMPLES) hrVdot = round1(trimmedMean(hrWin.map((s) => s.vdot)));
  const race = topPerf(races, date);
  const best = topPerf(bests, date);

  let vdot: number;
  let source: Vo2Window['source'];
  let basis: Vo2Sample | undefined;
  if (race) {
    const r = perfValue(race, date);
    vdot = hrVdot !== undefined ? Math.max(r, Math.min(hrVdot, r + HR_ABOVE_RACE)) : r;
    source = race.method as 'race' | 'declared_race' | 'vma_test';
    basis = race;
  } else if (hrVdot !== undefined) {
    vdot = hrVdot;
    source = 'activities';
  } else if (best) {
    vdot = perfValue(best, date);
    source = 'best_effort';
    basis = best;
  } else return null;
  if (best && basis !== best && perfValue(best, date) > vdot) {
    vdot = perfValue(best, date);
    source = 'best_effort';
    basis = best;
  }
  vdot = round1(clampVdot(vdot));
  const used = [...hrWin, ...races, ...bests].sort((x, y) => y.date.localeCompare(x.date));
  return { vdot, source, basis, hrVdot, samples: used, lthr: thresholdHr([...hrWin, ...races], vdot, hr) };
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
 * Estime le niveau depuis l'historique (voir vo2At). Faute de mesure sur 4 mois : la course la plus
 * récente (Strava sur 6 mois, déclarée sur 1 an), érodée par l'âge, sinon la sortie la plus rapide, majorée.
 */
export function estimateFitness(
  activities: ActivitySummary[],
  today: string,
  profile?: Partial<AthleteProfile>,
  declared: Vo2Sample[] = [],
  details: EffortDetail[] = [],
): FitnessEstimate {
  const runs = activities.filter((a) => isRun(a.sportType) && a.distanceM > 1500 && a.movingTimeSec > 0);
  const since = (days: number) => runs.filter((a) => a.startDate > addDays(today, -days));

  const last28 = since(28);
  const weeklyKm = last28.reduce((s, a) => s + a.distanceM, 0) / 1000 / 4;
  const weeklyElevation = last28.reduce((s, a) => s + a.elevationGain, 0) / 4;
  const longRunKm = Math.max(0, ...since(42).map((a) => a.distanceM / 1000));
  const runsPerWeek = last28.length / 4;
  const hr = hrBounds(runs, profile);

  const base = { weeklyKm, weeklyElevation, longRunKm, runsPerWeek, maxHrSeen: hr.maxHrSeen };

  const { samples: all, calibration } = calibratedSamples(rawVo2Samples(activities, profile, declared, details), today);
  const win = vo2At(all, today, hr);
  if (win)
    return {
      ...base,
      vdot: win.vdot,
      source: win.source,
      basis: win.basis,
      hrVdot: win.hrVdot,
      hrCalibration: calibration,
      samples: win.samples,
      lthr: win.lthr,
    };

  const oldRace = all
    .filter(
      (s) =>
        (s.method === 'race' && s.date > addDays(today, -180)) ||
        ((s.method === 'declared_race' || s.method === 'vma_test') && s.date > addDays(today, -365)),
    )
    .at(-1);
  if (oldRace) {
    return { ...base, vdot: round1(clampVdot(perfValue(oldRace, today))), source: oldRace.method as VdotSource, basis: oldRace, samples: [oldRace] };
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

/**
 * Temps prédit sur une distance, corrigé de l'endurance. Les tables de Daniels supposent un entraînement
 * complet pour la distance : avec peu de kilomètres par semaine ou une sortie longue courte, le semi et
 * surtout le marathon se courent plus lentement qu'annoncé (Vickers & Vertosick 2016).
 */
export const ENDURANCE_NEEDS: { minM: number; weeklyKm: number; longRunKm: number; maxPenalty: number }[] = [
  { minM: 30000, weeklyKm: 65, longRunKm: 30, maxPenalty: 0.15 },
  { minM: 15000, weeklyKm: 40, longRunKm: 16, maxPenalty: 0.07 },
  { minM: 8000, weeklyKm: 25, longRunKm: 10, maxPenalty: 0.02 },
];

export function endurancePenalty(distanceM: number, weeklyKm: number, longRunKm: number): number {
  const need = ENDURANCE_NEEDS.find((n) => distanceM >= n.minM);
  if (!need) return 0;
  const deficit = (have: number, want: number) => Math.min(1, Math.max(0, (want - have) / want));
  return need.maxPenalty * (0.6 * deficit(weeklyKm, need.weeklyKm) + 0.4 * deficit(longRunKm, need.longRunKm));
}

function fmtKm(m: number) {
  return (Math.round(m / 100) / 10).toLocaleString('fr-FR');
}

function round1(x: number) {
  return Math.round(x * 10) / 10;
}
