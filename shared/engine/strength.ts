import type { Exercise, FragileZone, Level, Phase, Sport, Workout } from './types';

/**
 * Renforcement du coureur, au poids du corps (une marche d'escalier et un élastique suffisent).
 * Logique : force générale en foncier, force + pliométrie en développement,
 * entretien en spécifique, rappel léger en affûtage.
 */

type Ex = Omit<Exercise, 'sets'> & { sets: [number, number, number]; zones: FragileZone[]; tags: Tag[] };
type Tag = 'core' | 'hip' | 'calf' | 'quad' | 'ham' | 'ecc' | 'plyo' | 'balance' | 'trail';

const LIB: Record<string, Ex> = {
  plank: { name: 'Gainage ventral', sets: [2, 3, 3], durationSec: 40, restSec: 30, cue: 'Corps aligné, fessiers serrés, respire.', focus: 'Tronc', zones: ['dos'], tags: ['core'] },
  sidePlank: { name: 'Gainage latéral', sets: [2, 2, 3], durationSec: 30, perSide: true, restSec: 20, cue: 'Hanche haute, épaule au-dessus du coude.', focus: 'Tronc, moyen fessier', zones: ['hanche', 'dos'], tags: ['core', 'hip'] },
  birdDog: { name: 'Bird dog', sets: [2, 3, 3], reps: 10, perSide: true, restSec: 30, cue: 'Bras et jambe opposés, sans creuser le dos.', focus: 'Dos, stabilité', zones: ['dos'], tags: ['core'] },
  glute: { name: 'Pont fessier unipodal', sets: [2, 3, 3], reps: 10, perSide: true, restSec: 30, cue: 'Pousse dans le talon, bassin bien horizontal.', focus: 'Fessiers', zones: ['hanche', 'genou', 'dos'], tags: ['hip'] },
  clam: { name: 'Clamshell avec élastique', sets: [2, 2, 3], reps: 15, perSide: true, restSec: 20, cue: 'Pieds joints, ouvre le genou sans basculer le bassin.', focus: 'Moyen fessier', zones: ['genou', 'hanche'], tags: ['hip'] },
  squat: { name: 'Squat', sets: [2, 3, 3], reps: 15, restSec: 45, cue: 'Genoux dans l’axe des pieds, descends en 3 secondes.', focus: 'Quadriceps, fessiers', zones: [], tags: ['quad'] },
  lunge: { name: 'Fentes avant alternées', sets: [2, 3, 3], reps: 10, perSide: true, restSec: 45, cue: 'Buste droit, genou avant au-dessus de la cheville.', focus: 'Quadriceps, fessiers', zones: [], tags: ['quad', 'hip'] },
  bulgarian: { name: 'Squat bulgare', sets: [2, 3, 4], reps: 8, perSide: true, restSec: 60, cue: 'Pied arrière sur un banc, descente lente.', focus: 'Quadriceps, fessiers', zones: ['genou'], tags: ['quad', 'ecc'] },
  stepDown: { name: 'Step-down lent', sets: [2, 3, 3], reps: 10, perSide: true, restSec: 45, cue: 'Sur une marche, descends le talon libre en 3 secondes.', focus: 'Quadriceps excentrique', zones: ['genou'], tags: ['quad', 'ecc', 'trail'] },
  wallSit: { name: 'Chaise contre le mur', sets: [2, 3, 3], durationSec: 45, restSec: 45, cue: 'Cuisses parallèles au sol, dos collé au mur.', focus: 'Quadriceps', zones: ['genou'], tags: ['quad', 'trail'] },
  calfRaise: { name: 'Mollets unipodal', sets: [2, 3, 3], reps: 15, perSide: true, restSec: 30, cue: 'Monte vite, redescends en 3 secondes, amplitude complète.', focus: 'Mollets', zones: ['achille', 'cheville'], tags: ['calf'] },
  alfredson: { name: 'Mollets excentriques sur marche', sets: [2, 3, 3], reps: 15, perSide: true, restSec: 30, cue: 'Monte sur deux pieds, redescends lentement sur un seul, talon sous la marche.', focus: 'Tendon d’Achille', zones: ['achille'], tags: ['calf', 'ecc'] },
  hamBridge: { name: 'Pont ischios, talons au sol', sets: [2, 3, 3], reps: 12, restSec: 30, cue: 'Talons loin des fesses, monte le bassin sans cambrer.', focus: 'Ischio-jambiers', zones: ['ischios'], tags: ['ham'] },
  nordic: { name: 'Nordic hamstring', sets: [2, 3, 3], reps: 5, restSec: 90, cue: 'Pieds bloqués, descends le buste le plus lentement possible.', focus: 'Ischios excentrique', zones: ['ischios'], tags: ['ham', 'ecc'] },
  balance: { name: 'Équilibre unipodal yeux fermés', sets: [2, 3, 3], durationSec: 30, perSide: true, restSec: 15, cue: 'Genou légèrement fléchi, sur un coussin pour corser.', focus: 'Cheville, proprioception', zones: ['cheville'], tags: ['balance', 'trail'] },
  pogo: { name: 'Sautillements pieds joints', sets: [2, 3, 4], durationSec: 20, restSec: 40, cue: 'Contacts courts et toniques, chevilles raides.', focus: 'Raideur tendineuse', zones: [], tags: ['plyo', 'calf'] },
  skipping: { name: 'Montées de genoux', sets: [2, 3, 3], durationSec: 20, restSec: 40, cue: 'Pied sous le bassin, bras actifs.', focus: 'Coordination, cadence', zones: [], tags: ['plyo'] },
  bounds: { name: 'Foulées bondissantes', sets: [2, 3, 4], reps: 8, restSec: 60, cue: 'Cherche la hauteur et la longueur, réception souple.', focus: 'Puissance', zones: [], tags: ['plyo', 'quad'] },
  stepUp: { name: 'Montées sur banc', sets: [2, 3, 3], reps: 12, perSide: true, restSec: 45, cue: 'Pousse uniquement avec la jambe du haut.', focus: 'Montée, fessiers', zones: ['genou'], tags: ['quad', 'hip', 'trail'] },
};

export interface StrengthContext {
  phase: Phase;
  level: Level;
  sport: Sport;
  fragile?: FragileZone[];
  /** 0 ou 1 : alterne deux séances différentes dans la semaine */
  variant: number;
  light?: boolean;
}

const LEVEL_IDX: Record<Level, number> = { debutant: 0, intermediaire: 1, confirme: 2 };

export function strengthSession(ctx: StrengthContext): Workout {
  const li = LEVEL_IDX[ctx.level];
  const trail = ctx.sport === 'trail';
  const fragile = new Set(ctx.fragile ?? []);
  const picks: string[] = [];

  // zones fragiles d'abord : l'exercice de prévention ciblé n'est jamais coupé
  const prevention: string[] = [];
  if (fragile.has('achille')) prevention.push('alfredson');
  if (fragile.has('cheville')) prevention.push('balance');
  if (fragile.has('genou')) prevention.push('stepDown', 'clam');
  if (fragile.has('ischios')) prevention.push(li === 0 ? 'hamBridge' : 'nordic');
  if (fragile.has('hanche')) prevention.push('sidePlank');
  if (fragile.has('dos')) prevention.push('birdDog');

  // socle commun : tronc + hanches
  picks.push(ctx.variant ? 'sidePlank' : 'plank', ...prevention, ctx.variant ? 'clam' : 'glute');

  if (ctx.phase === 'base' || ctx.light) {
    picks.push(ctx.variant ? 'lunge' : 'squat', 'calfRaise', li === 0 ? 'hamBridge' : ctx.variant ? 'hamBridge' : 'nordic');
    if (trail) picks.push(ctx.variant ? 'stepUp' : 'wallSit');
  } else if (ctx.phase === 'build') {
    picks.push(trail ? 'bulgarian' : ctx.variant ? 'bulgarian' : 'lunge', li === 0 ? 'calfRaise' : 'pogo');
    if (li > 0) picks.push(ctx.variant ? 'bounds' : 'skipping');
    picks.push(li === 0 ? 'hamBridge' : 'nordic');
    if (trail) picks.push('stepDown');
  } else {
    // spécifique / affûtage : entretien court
    picks.push(trail ? 'stepDown' : 'squat', li === 0 ? 'calfRaise' : 'pogo');
    if (trail) picks.push('balance');
  }

  const unique = [...new Set(picks)].slice(0, ctx.light ? 5 : 8);
  const exercises: Exercise[] = unique.map((k) => {
    const e = LIB[k];
    const sets = ctx.light ? Math.max(1, e.sets[li] - 1) : e.sets[li];
    return { name: e.name, sets, reps: e.reps, durationSec: e.durationSec, perSide: e.perSide, restSec: e.restSec, cue: e.cue, focus: e.focus };
  });

  const titles: Record<Phase, string> = {
    base: 'Renforcement : force générale',
    build: 'Renforcement : force et pliométrie',
    specific: 'Renforcement : entretien',
    taper: 'Renforcement : rappel léger',
  };
  return {
    type: 'strength',
    title: ctx.light ? 'Renforcement : rappel léger' : titles[ctx.phase],
    purpose: trail
      ? 'Prévenir les blessures et encaisser les descentes : quadriceps en excentrique, chevilles, tronc. 25 à 35 min, à la maison.'
      : 'Prévenir les blessures et gagner en économie de course : tronc, hanches, mollets. 25 à 35 min, à la maison.',
    blocks: [],
    exercises,
  };
}

export function strengthDurationSec(w: Workout): number {
  const raw = (w.exercises ?? []).reduce((t, e) => {
    const work = e.durationSec ?? (e.reps ?? 10) * 2.5;
    const sides = e.perSide ? 2 : 1;
    return t + e.sets * (work * sides + e.restSec);
  }, 300); // + 5 min d'échauffement articulaire
  return Math.round(raw / 300) * 300;
}
