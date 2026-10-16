import type { Block, Intensity, Phase, RaceCategory, SessionType, Sport, Step, Workout } from './types';
import { predictTimeLong, trainingPaces, type Paces } from './vdot';
import { INTENSITY_FACTOR, paceFor } from './zones';
import { strengthDurationSec } from './strength';
import { crossLoad } from './cross';

export interface BuildContext {
  vdot: number;
  sport: Sport;
  category: RaceCategory;
  phase: Phase;
  /** avancement dans la phase, 0 → 1 */
  progress: number;
  /** volume hebdo (km-effort) pour appliquer les plafonds de Daniels */
  weekKm: number;
  /** ratio D+ de la course (m/km), 0 sur route */
  elevationRatio: number;
  recovery?: boolean;
}

const min = (m: number) => Math.round(m * 60);
/** ralentissement moyen sur sentier vallonné vs plat */
export const TRAIL_SLOWDOWN = 1.15;
const pick = <T,>(arr: T[], progress: number): T => arr[Math.min(arr.length - 1, Math.floor(progress * arr.length))];

const warmup = (m = 15): Step => ({ kind: 'warmup', intensity: 'easy', durationSec: min(m) });
const cooldown = (m = 10): Step => ({ kind: 'cooldown', intensity: 'easy', durationSec: min(m) });
const strides = (n = 4): Block => ({
  repeat: n,
  steps: [
    { kind: 'work', intensity: 'repetition', durationSec: 20, note: 'Ligne droite, relâché' },
    { kind: 'recovery', intensity: 'walk', durationSec: 60 },
  ],
});
const single = (...steps: Step[]): Block => ({ repeat: 1, steps });

function isTrail(ctx: BuildContext) {
  return ctx.sport === 'trail';
}

export function easyRun(ctx: BuildContext, km: number, withStrides = false): Workout {
  const p = trainingPaces(ctx.vdot);
  const dur = Math.round(((km * (p.easySlow + p.easyFast)) / 2) * (isTrail(ctx) ? TRAIL_SLOWDOWN : 1));
  const blocks: Block[] = [
    single({ kind: 'steady', intensity: 'easy', durationSec: roundTo(dur, 300), terrain: isTrail(ctx) ? 'rolling' : 'flat' }),
  ];
  if (withStrides) blocks.push(strides(6));
  return {
    type: 'easy',
    title: withStrides ? 'Footing + lignes droites' : 'Footing',
    purpose: withStrides
      ? 'Développer le foncier, puis réveiller la foulée sans fatigue.'
      : 'Développer le foncier aérobie. Tu dois pouvoir parler en courant.',
    blocks,
    elevationGain: isTrail(ctx) ? Math.round(km * ctx.elevationRatio * 0.5) : undefined,
  };
}

export function recoveryRun(ctx: BuildContext, minutes = 35): Workout {
  return {
    type: 'recovery',
    title: 'Récupération active',
    purpose: 'Faire circuler sans charger. Plus lent que tu ne le crois.',
    blocks: [single({ kind: 'steady', intensity: 'recovery', durationSec: min(minutes) })],
  };
}

export function longRun(ctx: BuildContext, km: number): Workout {
  const p = trainingPaces(ctx.vdot);
  const easyPace = (p.easySlow + p.easyFast) / 2;
  const trail = isTrail(ctx);
  const pace = trail ? easyPace * TRAIL_SLOWDOWN : easyPace;
  const total = roundTo(km * pace, 300);
  const elevationGain = trail ? Math.round(km * ctx.elevationRatio * longElevFactor(ctx.phase)) : undefined;

  if (!trail && ctx.phase === 'specific' && !ctx.recovery && (ctx.category === 'marathon' || ctx.category === 'half')) {
    const racePace: Intensity = ctx.category === 'marathon' ? 'marathon' : 'half';
    const blockKm = ctx.category === 'marathon' ? pick([3, 4, 5, 6], ctx.progress) : pick([2, 3, 3, 4], ctx.progress);
    const reps = 2;
    const easyKm = Math.max(4, km - reps * (blockKm + 1));
    return {
      type: 'long',
      title: `Sortie longue avec ${reps} × ${blockKm} km allure ${racePace === 'marathon' ? 'marathon' : 'semi'}`,
      purpose: 'Apprendre à tenir l’allure cible sur fond de fatigue. Teste ton ravitaillement.',
      blocks: [
        single({ kind: 'warmup', intensity: 'easy', durationSec: roundTo(easyKm * 0.6 * easyPace, 60) }),
        { repeat: reps, steps: [
          { kind: 'work', intensity: racePace, distanceM: blockKm * 1000 },
          { kind: 'recovery', intensity: 'easy', distanceM: 1000 },
        ] },
        single({ kind: 'cooldown', intensity: 'easy', durationSec: roundTo(easyKm * 0.4 * easyPace, 60) }),
      ],
    };
  }

  if (!trail && ctx.phase === 'build' && !ctx.recovery) {
    const finishMin = pick([10, 15, 20], ctx.progress);
    return {
      type: 'long',
      title: 'Sortie longue, fin progressive',
      purpose: 'Endurance, puis finir sur une allure soutenue mais contrôlée.',
      blocks: [
        single({ kind: 'steady', intensity: 'easy', durationSec: total - min(finishMin) }),
        single({ kind: 'work', intensity: 'marathon', durationSec: min(finishMin) }),
      ],
    };
  }

  if (trail && ctx.phase === 'specific' && !ctx.recovery) {
    return {
      type: 'long',
      title: 'Sortie longue spécifique terrain',
      purpose: 'Sur un terrain proche de la course : montées en marche active rapide, descentes relâchées, ravitaillement testé.',
      blocks: [
        single({ kind: 'steady', intensity: 'easy', durationSec: total, terrain: 'rolling', note: 'Montées à l’effort course, marche active au-delà de 15 %' }),
      ],
      elevationGain,
    };
  }

  return {
    type: 'long',
    title: trail ? 'Sortie longue vallonnée' : 'Sortie longue',
    purpose: trail
      ? 'Temps sur les pieds et dénivelé, à allure facile. Marche dans les fortes pentes.'
      : 'Endurance de base : régularité, allure facile tout du long.',
    blocks: [single({ kind: 'steady', intensity: 'easy', durationSec: total, terrain: trail ? 'rolling' : 'flat' })],
    elevationGain,
  };
}

function longElevFactor(phase: Phase) {
  return { base: 0.6, build: 0.85, specific: 1.1, taper: 0.6 }[phase];
}

export function threshold(ctx: BuildContext): Workout {
  const p = trainingPaces(ctx.vdot);
  const options: [number, number, number][] = ctx.recovery
    ? [[3, 6, 1]]
    : ctx.phase === 'base'
      ? [[3, 6, 1], [3, 8, 1], [4, 8, 1]]
      : ctx.phase === 'taper'
        ? [[2, 8, 2]]
        : [[3, 10, 2], [4, 10, 2], [3, 12, 2], [2, 15, 2], [2, 20, 3]];
  let [reps, repMin, recMin] = pick(options, ctx.progress);
  // Daniels : volume au seuil ≤ 10 % du volume hebdo
  const capMin = Math.max(20, (ctx.weekKm * 0.1 * p.threshold) / 60);
  while (reps > 1 && reps * repMin > capMin) reps--;
  return {
    type: 'threshold',
    title: `Seuil : ${reps} × ${repMin}′`,
    purpose: 'Repousser le seuil lactique. Effort « confortablement dur », régulier du premier au dernier.',
    blocks: [
      single(warmup(15)),
      { repeat: reps, steps: [
        { kind: 'work', intensity: 'threshold', durationSec: min(repMin) },
        { kind: 'recovery', intensity: 'easy', durationSec: min(recMin) },
      ] },
      single(cooldown(10)),
    ],
  };
}

export function intervals(ctx: BuildContext): Workout {
  const p = trainingPaces(ctx.vdot);
  const options: [number, number][] = ctx.recovery
    ? [[5, 600]]
    : ctx.phase === 'taper'
      ? [[4, 800]]
      : [[6, 600], [5, 800], [6, 800], [5, 1000], [6, 1000], [4, 1200]];
  let [reps, distM] = pick(options, ctx.progress);
  // Daniels : I ≤ 8 % du volume hebdo, 10 km max
  const capM = Math.max(4000, Math.min(10000, ctx.weekKm * 0.08 * 1000));
  while (reps > 3 && reps * distM > capM) reps--;
  const repSec = (distM / 1000) * p.interval;
  return {
    type: 'intervals',
    title: `VMA : ${reps} × ${distM >= 1000 ? `${distM / 1000} km` : `${distM} m`}`,
    purpose: 'Stimuler la VO2max. Rapide mais tenable sur toutes les répétitions.',
    blocks: [
      single(warmup(15)),
      strides(4),
      { repeat: reps, steps: [
        { kind: 'work', intensity: 'interval', distanceM: distM },
        { kind: 'recovery', intensity: 'recovery', durationSec: roundTo(repSec * 0.8, 15) },
      ] },
      single(cooldown(10)),
    ],
  };
}

export function repetition(ctx: BuildContext): Workout {
  const [reps, distM] = pick<[number, number]>([[8, 200], [10, 200], [8, 300], [6, 400]], ctx.progress);
  return {
    type: 'repetition',
    title: `Vitesse : ${reps} × ${distM} m`,
    purpose: 'Économie de course et vitesse pure. Récupération complète, foulée propre.',
    blocks: [
      single(warmup(15)),
      { repeat: reps, steps: [
        { kind: 'work', intensity: 'repetition', distanceM: distM },
        { kind: 'recovery', intensity: 'walk', distanceM: distM },
      ] },
      single(cooldown(10)),
    ],
  };
}

export function hills(ctx: BuildContext): Workout {
  const [reps, sec] = pick<[number, number]>(ctx.recovery ? [[6, 30]] : [[8, 30], [10, 30], [8, 45], [10, 45], [12, 45]], ctx.progress);
  return {
    type: 'hills',
    title: `Côtes courtes : ${reps} × ${sec}″`,
    purpose: 'Force et puissance de foulée. Pente de 6 à 10 %, retour en trottinant.',
    blocks: [
      single(warmup(20)),
      { repeat: reps, steps: [
        { kind: 'work', intensity: 'interval', durationSec: sec, terrain: 'uphill', note: 'Montée dynamique, buste droit' },
        { kind: 'recovery', intensity: 'recovery', durationSec: sec * 2, terrain: 'downhill', note: 'Retour trot' },
      ] },
      single(cooldown(10)),
    ],
  };
}

export function longHills(ctx: BuildContext): Workout {
  const options: [number, number][] = ctx.recovery
    ? [[4, 3]]
    : ctx.phase === 'specific'
      ? [[3, 10], [3, 12], [2, 18], [3, 15]]
      : ctx.phase === 'taper'
        ? [[3, 5]]
        : [[5, 3], [6, 3], [5, 4], [6, 4], [5, 5]];
  const [reps, repMin] = pick(options, ctx.progress);
  const vert = Math.round(reps * repMin * 12); // ~700 m/h en montée soutenue
  return {
    type: 'long_hills',
    title: `Côtes longues : ${reps} × ${repMin}′`,
    purpose:
      ctx.phase === 'specific'
        ? 'Monter longtemps à l’effort course. Alterne course et marche active selon la pente, comme le jour J.'
        : 'Puissance aérobie en montée. Effort au seuil, à la FC plutôt qu’à l’allure.',
    blocks: [
      single(warmup(20)),
      { repeat: reps, steps: [
        { kind: 'work', intensity: 'hill', durationSec: min(repMin), terrain: 'uphill' },
        { kind: 'recovery', intensity: 'downhill', durationSec: min(repMin * 0.7), terrain: 'downhill', note: 'Descente souple, travaille les appuis' },
      ] },
      single(cooldown(10)),
    ],
    elevationGain: vert,
  };
}

export function downhillSkills(ctx: BuildContext): Workout {
  const reps = pick([6, 8, 8, 10], ctx.progress);
  return {
    type: 'downhill',
    title: `Technique de descente : ${reps} × 1′30″`,
    purpose: 'Habituer les quadriceps à l’excentrique et gagner en fluidité. Regard loin, petits appuis rapides.',
    blocks: [
      single(warmup(20)),
      { repeat: reps, steps: [
        { kind: 'work', intensity: 'downhill', durationSec: 90, terrain: 'downhill' },
        { kind: 'recovery', intensity: 'walk', durationSec: 150, terrain: 'uphill', note: 'Remontée en marchant' },
      ] },
      single(cooldown(10)),
    ],
    elevationGain: Math.round(reps * 40),
  };
}

export function fartlek(ctx: BuildContext): Workout {
  const reps = pick([6, 8, 10], ctx.progress);
  return {
    type: 'fartlek',
    title: `Fartlek : ${reps} × 1′ vite / 1′ facile`,
    purpose: 'Varier les allures en douceur. Le « vite » est rapide mais jamais à fond.',
    blocks: [
      single(warmup(15)),
      { repeat: reps, steps: [
        { kind: 'work', intensity: '10k', durationSec: 60 },
        { kind: 'recovery', intensity: 'easy', durationSec: 60 },
      ] },
      single(cooldown(10)),
    ],
  };
}

export function racePace(ctx: BuildContext): Workout {
  if (isTrail(ctx)) return longHills({ ...ctx, phase: 'specific' });
  const c = ctx.category;
  const def: Record<string, { i: Intensity; opts: [number, number, number][]; name: string }> = {
    '5k': { i: '5k', name: '5 km', opts: [[5, 800, 90], [5, 1000, 120], [6, 1000, 120], [3, 1600, 150]] },
    '10k': { i: '10k', name: '10 km', opts: [[5, 1000, 75], [4, 1600, 90], [5, 1600, 90], [3, 2000, 90], [3, 3000, 120]] },
    half: { i: 'half', name: 'semi', opts: [[3, 2000, 90], [4, 2000, 90], [3, 3000, 120], [2, 5000, 180]] },
    marathon: { i: 'marathon', name: 'marathon', opts: [[3, 3000, 90], [3, 4000, 120], [2, 6000, 180], [2, 8000, 180]] },
  };
  const d = def[c] ?? def['10k'];
  const opts = ctx.phase === 'taper' ? [d.opts[0].map((x, k) => (k === 0 ? Math.max(2, x - 2) : x)) as [number, number, number]] : d.opts;
  const [reps, distM, recSec] = pick(opts, ctx.progress);
  return {
    type: 'race_pace',
    title: `Allure ${d.name} : ${reps} × ${distM >= 1000 ? `${distM / 1000} km` : `${distM} m`}`,
    purpose: 'Graver l’allure cible dans les jambes. Précision plutôt que vitesse.',
    blocks: [
      single(warmup(15)),
      strides(4),
      { repeat: reps, steps: [
        { kind: 'work', intensity: d.i, distanceM: distM },
        { kind: 'recovery', intensity: 'easy', durationSec: recSec },
      ] },
      single(cooldown(10)),
    ],
  };
}

export function shakeout(ctx: BuildContext): Workout {
  return {
    type: 'shakeout',
    title: 'Déblocage veille de course',
    purpose: 'Juste réveiller les jambes. Prépare tes affaires, dors bien.',
    blocks: [single({ kind: 'steady', intensity: 'easy', durationSec: min(20) }), strides(3)],
  };
}

export function raceDay(ctx: BuildContext, name: string, distanceKm: number, elevationGain: number): Workout {
  return {
    type: 'race',
    title: name || 'Course',
    purpose: 'Jour J. Pars prudemment, la course commence à mi-parcours.',
    blocks: [single({ kind: 'work', intensity: 'race', distanceM: Math.round(distanceKm * 1000) })],
    elevationGain: elevationGain || undefined,
  };
}

export const SESSION_TYPE_LABEL: Record<SessionType, string> = {
  easy: 'Footing',
  recovery: 'Récupération',
  long: 'Sortie longue',
  threshold: 'Seuil',
  intervals: 'VMA',
  repetition: 'Vitesse',
  hills: 'Côtes courtes',
  long_hills: 'Côtes longues',
  race_pace: 'Allure spécifique',
  fartlek: 'Fartlek',
  downhill: 'Descente',
  race: 'Course',
  shakeout: 'Déblocage',
  strength: 'Renforcement',
  cross: 'Autre sport',
  test: 'Test VMA',
};

/** Test demi-Cooper : 6 min à fond pour mesurer la VMA. */
export function vmaTest(): Workout {
  return {
    type: 'test',
    title: 'Test VMA : demi-Cooper',
    purpose: 'Cours le plus loin possible en 6 minutes, sur piste ou terrain plat. Note la distance : elle recalibre toutes tes allures.',
    blocks: [
      single(warmup(20)),
      strides(3),
      single({ kind: 'work', intensity: 'repetition', durationSec: 360, note: 'À fond, mais régulier : pars un peu en dedans' }),
      single(cooldown(10)),
    ],
  };
}

const INTENSITIES = new Set(['recovery', 'easy', 'marathon', 'half', '10k', '5k', 'threshold', 'interval', 'repetition', 'hill', 'downhill', 'race', 'walk']);
const KINDS = new Set(['warmup', 'work', 'recovery', 'cooldown', 'steady']);
const TYPES = new Set(Object.keys(SESSION_TYPE_LABEL));

/** Valide une séance reçue de l'extérieur (connecteur Claude). Renvoie la liste des erreurs. */
export function validateWorkout(w: unknown): string[] {
  const errors: string[] = [];
  const x = w as Workout;
  if (!x || typeof x !== 'object') return ['la séance doit être un objet'];
  if (!TYPES.has(x.type)) errors.push(`type inconnu : ${x.type}`);
  if (typeof x.title !== 'string' || !x.title.trim() || x.title.length > 120) errors.push('title requis (120 caractères max)');
  if (typeof x.purpose !== 'string' || x.purpose.length > 600) errors.push('purpose requis (600 caractères max)');
  if (!Array.isArray(x.blocks)) errors.push('blocks doit être un tableau');
  let total = 0;
  for (const [bi, b] of (x.blocks ?? []).entries()) {
    if (!Number.isInteger(b.repeat) || b.repeat < 1 || b.repeat > 50) errors.push(`blocks[${bi}].repeat entre 1 et 50`);
    if (!Array.isArray(b.steps) || !b.steps.length) errors.push(`blocks[${bi}].steps vide`);
    for (const [si, st] of (b.steps ?? []).entries()) {
      const at = `blocks[${bi}].steps[${si}]`;
      if (!KINDS.has(st.kind)) errors.push(`${at}.kind invalide`);
      if (!INTENSITIES.has(st.intensity)) errors.push(`${at}.intensity invalide`);
      const hasD = typeof st.durationSec === 'number' && st.durationSec > 0 && st.durationSec <= 6 * 3600;
      const hasM = typeof st.distanceM === 'number' && st.distanceM > 0 && st.distanceM <= 100000;
      if (!hasD && !hasM) errors.push(`${at} : durationSec ou distanceM requis`);
      total += (st.durationSec ?? (st.distanceM ?? 0) * 0.4) * (b.repeat ?? 1);
    }
  }
  if (total > 8 * 3600) errors.push('séance de plus de 8 h refusée');
  if (x.exercises !== undefined && !Array.isArray(x.exercises)) errors.push('exercises doit être un tableau');
  if (x.type === 'strength' && !x.exercises?.length) errors.push('une séance de renforcement doit lister des exercises');
  for (const [i, e] of (x.exercises ?? []).entries()) {
    if (typeof e.name !== 'string' || !Number.isInteger(e.sets) || e.sets < 1 || e.sets > 10) errors.push(`exercises[${i}] : name et sets (1–10) requis`);
  }
  return errors;
}

function roundTo(x: number, step: number) {
  return Math.max(step, Math.round(x / step) * step);
}

/* ---------- Estimations ---------- */

function stepPace(s: Step, p: Paces): number {
  const r = paceFor(s.intensity, p);
  if (r) return (r[0] + r[1]) / 2;
  const easy = (p.easySlow + p.easyFast) / 2;
  switch (s.intensity) {
    case 'hill':
      return easy * 1.6; // allure horizontale en côte
    case 'downhill':
      return easy * 0.95;
    case 'walk':
      return 600;
    case 'race':
      return p.marathon;
    default:
      return easy;
  }
}

export interface WorkoutEstimate {
  durationSec: number;
  distanceM: number;
  load: number;
  /** minutes par zone 1..5 */
  zoneMinutes: number[];
}

export function estimateWorkout(w: Workout, vdot: number, terrainFactor = TRAIL_SLOWDOWN): WorkoutEstimate {
  const p = trainingPaces(vdot);
  if (w.type === 'strength') {
    const durationSec = strengthDurationSec(w);
    return { durationSec, distanceM: 0, load: (durationSec / 3600) * 0.5 * 0.5 * 100, zoneMinutes: [] };
  }
  if (w.type === 'cross' && w.cross) {
    return { durationSec: w.cross.durationMin * 60, distanceM: 0, load: crossLoad(w.cross), zoneMinutes: [] };
  }
  if (w.type === 'race') {
    const distanceM = w.blocks[0]?.steps[0]?.distanceM ?? 0;
    const elev = w.elevationGain ?? 0;
    const trail = elev / Math.max(1, distanceM / 1000) > 15;
    const durationSec = predictTimeLong(vdot, distanceM + elev * 10) * (trail ? 1.08 : 1);
    const f = INTENSITY_FACTOR.race;
    return { durationSec, distanceM, load: (durationSec / 3600) * f * f * 100, zoneMinutes: [] };
  }
  let dur = 0;
  let dist = 0;
  let load = 0;
  for (const b of w.blocks) {
    for (const s of b.steps) {
      const pace = stepPace(s, p) * (s.terrain === 'rolling' ? terrainFactor : 1);
      const sd = s.durationSec ?? ((s.distanceM ?? 0) / 1000) * pace;
      const sm = s.distanceM ?? (sd / pace) * 1000;
      const f = INTENSITY_FACTOR[s.intensity];
      dur += sd * b.repeat;
      dist += sm * b.repeat;
      load += (sd / 3600) * f * f * 100 * b.repeat;
    }
  }
  return { durationSec: dur, distanceM: dist, load, zoneMinutes: [] };
}

export interface Segment {
  step: Step;
  block: number;
  /** index de l'étape dans son bloc */
  index: number;
  rep: number;
  durationSec: number;
  distanceM: number;
}

/** Déroule les répétitions : une entrée par étape effectivement courue. */
export function expandWorkout(w: Workout, vdot: number, terrainFactor = TRAIL_SLOWDOWN): Segment[] {
  const p = trainingPaces(vdot);
  const out: Segment[] = [];
  if (w.type === 'race') {
    const est = estimateWorkout(w, vdot);
    return [{ step: w.blocks[0].steps[0], block: 0, index: 0, rep: 0, durationSec: est.durationSec, distanceM: est.distanceM }];
  }
  w.blocks.forEach((b, bi) => {
    for (let r = 0; r < b.repeat; r++) {
      for (const [si, s] of b.steps.entries()) {
        const pace = stepPace(s, p) * (s.terrain === 'rolling' ? terrainFactor : 1);
        const durationSec = s.durationSec ?? ((s.distanceM ?? 0) / 1000) * pace;
        out.push({ step: s, block: bi, index: si, rep: r, durationSec, distanceM: s.distanceM ?? (durationSec / pace) * 1000 });
      }
    }
  });
  return out;
}
