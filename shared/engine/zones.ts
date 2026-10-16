import type { AthleteProfile, Intensity } from './types';
import { trainingPaces, type Paces } from './vdot';

/** FC max estimée (Tanaka 2001) si non renseignée. */
export function estimateHrMax(birthYear?: number, today = new Date()): number | undefined {
  if (!birthYear) return undefined;
  const age = today.getFullYear() - birthYear;
  return Math.round(208 - 0.7 * age);
}

export function resolveHr(profile: AthleteProfile) {
  const hrMax = profile.hrMax ?? estimateHrMax(profile.birthYear);
  const hrRest = profile.hrRest ?? 55;
  const lthr = profile.lthr ?? (hrMax ? Math.round(hrRest + 0.87 * (hrMax - hrRest)) : undefined);
  return { hrMax, hrRest, lthr };
}

/** Zones FC de Joe Friel (course à pied), en % du seuil lactique. */
export const HR_ZONES = [
  { zone: 1, label: 'Récupération', min: 0, max: 0.85 },
  { zone: 2, label: 'Endurance', min: 0.85, max: 0.9 },
  { zone: 3, label: 'Tempo', min: 0.9, max: 0.95 },
  { zone: 4, label: 'Seuil', min: 0.95, max: 1.0 },
  { zone: 5, label: 'VO2max', min: 1.0, max: 1.08 },
] as const;

export function hrZones(lthr: number) {
  return HR_ZONES.map((z) => ({
    ...z,
    lo: Math.round(z.min * lthr),
    hi: Math.round(z.max * lthr),
  }));
}

export interface IntensityTarget {
  label: string;
  /** s/km : [lent, rapide] */
  pace?: [number, number];
  hr?: [number, number];
  rpe: string;
  zone: number;
}

const META: Record<Intensity, { label: string; rpe: string; zone: number; hr: [number, number] }> = {
  walk: { label: 'Marche active', rpe: '3/10', zone: 1, hr: [0.7, 0.85] },
  recovery: { label: 'Récupération', rpe: '2/10', zone: 1, hr: [0.7, 0.82] },
  easy: { label: 'Endurance fondamentale', rpe: '3–4/10', zone: 2, hr: [0.8, 0.89] },
  marathon: { label: 'Allure marathon', rpe: '5–6/10', zone: 3, hr: [0.9, 0.94] },
  half: { label: 'Allure semi', rpe: '6–7/10', zone: 3, hr: [0.93, 0.97] },
  threshold: { label: 'Seuil', rpe: '7/10', zone: 4, hr: [0.95, 1.0] },
  '10k': { label: 'Allure 10 km', rpe: '7–8/10', zone: 4, hr: [0.98, 1.02] },
  '5k': { label: 'Allure 5 km', rpe: '8–9/10', zone: 5, hr: [1.0, 1.04] },
  interval: { label: 'VMA / VO2max', rpe: '8–9/10', zone: 5, hr: [1.0, 1.06] },
  repetition: { label: 'Vitesse', rpe: '9/10', zone: 5, hr: [1.0, 1.08] },
  hill: { label: 'Côte, effort soutenu', rpe: '7–8/10', zone: 4, hr: [0.95, 1.03] },
  downhill: { label: 'Descente technique', rpe: '5/10', zone: 3, hr: [0.85, 0.95] },
  race: { label: 'Allure course', rpe: 'course', zone: 4, hr: [0.9, 1.0] },
};

export function paceFor(intensity: Intensity, p: Paces): [number, number] | undefined {
  switch (intensity) {
    case 'recovery':
      return [p.recovery + 20, p.recovery];
    case 'easy':
      return [p.easySlow, p.easyFast];
    case 'marathon':
      return [p.marathon + 4, p.marathon - 4];
    case 'half':
      return [p.half + 3, p.half - 3];
    case 'threshold':
      return [p.threshold + 4, p.threshold - 4];
    case '10k':
      return [p.tenK + 3, p.tenK - 3];
    case '5k':
      return [p.fiveK + 3, p.fiveK - 3];
    case 'interval':
      return [p.interval + 3, p.interval - 3];
    case 'repetition':
      return [p.repetition + 3, p.repetition - 3];
    default:
      return undefined; // côtes, descente, marche, course trail : à la sensation / FC
  }
}

export function targetFor(intensity: Intensity, profile: AthleteProfile, terrain?: string): IntensityTarget {
  const meta = META[intensity];
  const { lthr } = resolveHr(profile);
  const paces = trainingPaces(profile.vdot);
  const onSlope = terrain === 'uphill' || terrain === 'downhill';
  return {
    label: meta.label,
    rpe: meta.rpe,
    zone: meta.zone,
    pace: onSlope ? undefined : paceFor(intensity, paces),
    hr: lthr ? [Math.round(meta.hr[0] * lthr), Math.round(meta.hr[1] * lthr)] : undefined,
  };
}

export function zoneOf(intensity: Intensity): number {
  return META[intensity].zone;
}

export function intensityLabel(intensity: Intensity): string {
  return META[intensity].label;
}

/** Facteur d'intensité (IF) utilisé pour estimer la charge d'une séance planifiée. */
export const INTENSITY_FACTOR: Record<Intensity, number> = {
  walk: 0.55,
  recovery: 0.65,
  easy: 0.72,
  downhill: 0.75,
  marathon: 0.86,
  half: 0.92,
  threshold: 1.0,
  hill: 1.02,
  '10k': 1.03,
  race: 0.9,
  '5k': 1.07,
  interval: 1.1,
  repetition: 1.15,
};
