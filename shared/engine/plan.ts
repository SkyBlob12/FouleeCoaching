import type { AthleteProfile, Availability, Goal, Level, Phase, Plan, PlanExtras, PlanWeek, PlannedSession, RaceCategory, Workout } from './types';
import { crossLoad, crossWorkout } from './cross';
import { strengthSession } from './strength';
import { addDays, daysBetween, mondayOf, weekdayOf } from './load';
import { kmEffort } from './gap';
import { trainingPaces, vdotFromRace } from './vdot';
import {
  type BuildContext,
  downhillSkills,
  easyRun,
  estimateWorkout,
  fartlek,
  hills,
  intervals,
  longHills,
  longRun,
  racePace,
  raceDay,
  recoveryRun,
  repetition,
  shakeout,
  threshold,
  vmaTest,
} from './workouts';

export interface PlanInput {
  profile: AthleteProfile & { weeklyElevation?: number };
  goal: Goal;
  availability: Availability;
  /** date de début (aujourd'hui) */
  startDate: string;
  extras?: PlanExtras;
  /** réglages ajustés par l'IA (ou à la main) appliqués par-dessus les règles de l'algorithme */
  tuning?: PlanTuning;
  /** recalcul en cours de plan : conserve les phases et la numérotation d'origine */
  continuation?: { planStart: string; phases: Phase[]; fromWeek: number; peakKm?: number };
}

export function categorize(goal: Pick<Goal, 'sport' | 'distanceKm' | 'elevationGain'>): RaceCategory {
  if (goal.sport === 'road') {
    if (goal.distanceKm <= 7) return '5k';
    if (goal.distanceKm <= 15) return '10k';
    if (goal.distanceKm <= 30) return 'half';
    if (goal.distanceKm <= 45) return 'marathon';
    return 'ultra';
  }
  // seuils en km-effort calqués sur les catégories UTMB (20K / 50K / 100K / 100M)
  const effort = kmEffort(goal.distanceKm, goal.elevationGain);
  if (effort < 45) return 'trail_short';
  if (effort < 75) return 'trail_medium';
  if (effort < 115) return 'trail_long';
  return 'ultra';
}

export const CATEGORY_LABEL: Record<RaceCategory, string> = {
  '5k': '5 km',
  '10k': '10 km',
  half: 'Semi-marathon',
  marathon: 'Marathon',
  trail_short: 'Trail court',
  trail_medium: 'Trail moyen',
  trail_long: 'Trail long',
  ultra: 'Ultra',
};

export const PHASE_LABEL: Record<Phase, string> = {
  base: 'Foncier',
  build: 'Développement',
  specific: 'Spécifique',
  taper: 'Affûtage',
};

const TAPER_WEEKS: Record<RaceCategory, number> = {
  '5k': 1,
  '10k': 1,
  half: 2,
  marathon: 3,
  trail_short: 2,
  trail_medium: 2,
  trail_long: 3,
  ultra: 3,
};

/** Volume de pic (km-effort / semaine) selon le niveau. */
const PEAK: Record<RaceCategory, Record<Level, number>> = {
  '5k': { debutant: 28, intermediaire: 45, confirme: 65 },
  '10k': { debutant: 32, intermediaire: 50, confirme: 75 },
  half: { debutant: 38, intermediaire: 58, confirme: 85 },
  marathon: { debutant: 48, intermediaire: 72, confirme: 105 },
  trail_short: { debutant: 35, intermediaire: 55, confirme: 80 },
  trail_medium: { debutant: 45, intermediaire: 68, confirme: 95 },
  trail_long: { debutant: 55, intermediaire: 82, confirme: 115 },
  ultra: { debutant: 62, intermediaire: 92, confirme: 135 },
};

const LONG_CAP: Record<RaceCategory, number> = {
  '5k': 16,
  '10k': 20,
  half: 24,
  marathon: 34,
  trail_short: 28,
  trail_medium: 38,
  trail_long: 48,
  ultra: 55,
};

const MAX_PER_DAY: Record<Level, number> = { debutant: 12, intermediaire: 17, confirme: 24 };
const GROWTH: Record<Level, number> = { debutant: 0.06, intermediaire: 0.08, confirme: 0.1 };

export type Emphasis = 'equilibre' | 'endurance' | 'vitesse' | 'seuil' | 'montee';

/** Paramètres que l'analyse IA peut ajuster ; l'algorithme reste garant des règles (progression, récup, jours durs). */
export interface PlanTuning {
  vdot?: number;
  startVolumeKm?: number;
  /** multiplicateur du volume de pic, borné à 0,75–1,2 */
  peakFactor?: number;
  longRunStartKm?: number;
  qualityPerWeek?: 1 | 2;
  /** 3 = 2 semaines de charge + 1 allégée ; 4 = 3 + 1 */
  cycleWeeks?: 3 | 4;
  emphasis?: Emphasis;
}

export function clampTuning(t: PlanTuning, base: { vdot: number }): PlanTuning {
  const c = (x: number | undefined, lo: number, hi: number) => (x === undefined || !Number.isFinite(x) ? undefined : Math.min(hi, Math.max(lo, x)));
  return {
    vdot: c(t.vdot, base.vdot - 4, base.vdot + 4),
    startVolumeKm: c(t.startVolumeKm, 8, 160),
    peakFactor: c(t.peakFactor, 0.75, 1.2),
    longRunStartKm: c(t.longRunStartKm, 5, 45),
    qualityPerWeek: t.qualityPerWeek === 1 || t.qualityPerWeek === 2 ? t.qualityPerWeek : undefined,
    cycleWeeks: t.cycleWeeks === 3 || t.cycleWeeks === 4 ? t.cycleWeeks : undefined,
    emphasis: t.emphasis && ['equilibre', 'endurance', 'vitesse', 'seuil', 'montee'].includes(t.emphasis) ? t.emphasis : undefined,
  };
}

export function generatePlan(rawInput: PlanInput): Plan {
  const tuning = rawInput.tuning ?? {};
  const input: PlanInput = tuning.vdot ? { ...rawInput, profile: { ...rawInput.profile, vdot: tuning.vdot } } : rawInput;
  const { profile, goal, availability } = input;
  const extras = input.extras ?? {};
  const notes: string[] = [];
  const category = categorize(goal);
  const trail = goal.sport === 'trail';
  const elevationRatio = trail && goal.distanceKm > 0 ? goal.elevationGain / goal.distanceKm : 0;
  const level = profile.level;

  /* --- Calendrier et phases --- */
  let startMonday: string;
  let phases: Phase[];
  let fromWeek = 0;
  if (input.continuation) {
    startMonday = input.continuation.planStart;
    phases = input.continuation.phases;
    fromWeek = input.continuation.fromWeek;
  } else {
    startMonday = mondayOf(input.startDate);
    const raceMonday = mondayOf(goal.date);
    let n = Math.floor(daysBetween(startMonday, raceMonday) / 7) + 1;
    if (daysBetween(input.startDate, goal.date) < 7) throw new Error('La course est dans moins d’une semaine : pas de plan possible.');
    if (n > 30) {
      startMonday = addDays(raceMonday, -29 * 7);
      n = 30;
      notes.push('Course lointaine : le plan démarre 30 semaines avant. D’ici là, entretiens ton foncier.');
    }
    phases = buildPhases(n, category);
    if (n < 6) notes.push('Plan court : on consolide plutôt qu’on ne construit. Vise un objectif réaliste.');
  }
  const n = phases.length;
  const taper = phases.filter((p) => p === 'taper').length;
  const m = n - taper;
  const specificStart = phases.includes('specific') ? phases.indexOf('specific') : m;
  const buildStart = phases.indexOf('build');
  const phaseLen = (p: Phase) => phases.filter((x) => x === p).length;
  const phaseIndex = (w: number) => phases.slice(0, w).filter((x) => x === phases[w]).length;

  /* --- Autres sports --- */
  const sports = extras.otherSports ?? [];
  const hardDays = uniqueSorted(sports.filter((s) => s.intensity === 'high').map((s) => s.day));
  const highSessions = sports.filter((s) => s.intensity === 'high').length;
  const crossWeekLoad = sports.reduce((t, s) => t + crossLoad(s), 0);
  const crossReduction = Math.min(0.25, crossWeekLoad * 0.0012);
  if (sports.length) {
    notes.push(
      `Tes autres sports pèsent environ ${Math.round(crossWeekLoad)} points de charge par semaine : le volume de course visé est réduit de ${Math.round(
        crossReduction * 100,
      )} %, et aucune séance dure n’est placée la veille ou le lendemain d’une séance intense.`,
    );
  }

  /* --- Jours de course --- */
  const days = uniqueSorted([...availability.days, availability.longRunDay]).filter((d) => d === availability.longRunDay || !hardDays.includes(d));
  const afterHard = new Set(hardDays.map((d) => (d + 1) % 7));
  const longAfterHard = afterHard.has(availability.longRunDay);
  if (longAfterHard)
    notes.push('Ta sortie longue tombe le lendemain d’une séance intense : elle reste en endurance pure. Si tu peux, place-la plutôt en milieu de semaine.');

  /* --- Volume (cycles de 4 semaines : 3 de charge, 1 d'assimilation) --- */
  const startVol = tuning.startVolumeKm ?? Math.max(days.length * 4, 12, profile.weeklyKm + (profile.weeklyElevation ?? 0) / 100);
  const basePeak = Math.max(Math.min(PEAK[category][level], days.length * MAX_PER_DAY[level]), Math.min(startVol, PEAK[category].confirme * 1.2));
  const peak = input.continuation?.peakKm ?? basePeak * (1 - crossReduction) * (tuning.peakFactor ?? 1);
  if (!input.continuation && startVol < peak * 0.5)
    notes.push('Ton volume actuel est loin du pic visé : la progression est volontairement prudente (+6 à 10 %/semaine).');

  const cycle = tuning.cycleWeeks ?? 4;
  const isRecoveryWeek = (i: number) => (i + 1) % cycle === 0 && i < m - 1;
  const volumes = new Map<number, { vol: number; recovery: boolean }>();
  let loadVol = Math.min(startVol, peak);
  const loadWeeksToPeak = Math.max(1, range(fromWeek + 1, specificStart).filter((i) => !isRecoveryWeek(i)).length);
  const growth = Math.min(GROWTH[level], Math.max(0.02, Math.pow(peak / loadVol, 1 / loadWeeksToPeak) - 1));
  for (let i = fromWeek; i < m; i++) {
    if (i === fromWeek) volumes.set(i, { vol: loadVol, recovery: isRecoveryWeek(i) && !!input.continuation });
    else if (isRecoveryWeek(i)) volumes.set(i, { vol: loadVol * 0.75, recovery: true });
    else {
      loadVol = Math.min(peak, loadVol * (1 + growth));
      volumes.set(i, { vol: loadVol, recovery: false });
    }
  }
  const taperFactors = { 1: [0.6], 2: [0.7, 0.5], 3: [0.8, 0.65, 0.45] }[taper] ?? [0.6];
  taperFactors.forEach((f, k) => {
    if (m + k >= fromWeek) volumes.set(m + k, { vol: loadVol * f, recovery: false });
  });

  /* --- Rôles des jours --- */
  const { qualityDays, easyDays } = assignDays(days, availability.longRunDay, level, hardDays, highSessions, tuning.qualityPerWeek);

  if (goal.targetTimeSec) {
    const needed = vdotFromRace(kmEffort(goal.distanceKm, goal.elevationGain) * 1000, goal.targetTimeSec * (trail ? 0.92 : 1));
    if (needed > profile.vdot + 3)
      notes.push('Ton objectif chrono est au-dessus de ta forme actuelle : les allures partent de ton niveau du jour et suivront ta progression.');
  }

  /* --- Semaines --- */
  const weeks: PlanWeek[] = [];
  for (let w = fromWeek; w < n; w++) {
    const phase = phases[w];
    const len = phaseLen(phase);
    const progress = len > 1 ? phaseIndex(w) / (len - 1) : 0.5;
    const { vol, recovery } = volumes.get(w)!;
    const weekStart = addDays(startMonday, w * 7);
    const isRaceWeek = w === n - 1;
    const elevFactor = { base: 0.5, build: 0.8, specific: 1.1, taper: 0.5 }[phase];
    const realKm = vol / (1 + (elevationRatio * elevFactor) / 100);
    const weekElev = trail ? Math.round(realKm * elevationRatio * elevFactor) : 0;
    const ctx: BuildContext = { vdot: profile.vdot, sport: goal.sport, category, phase, progress, weekKm: vol, elevationRatio, recovery };

    const sessions: PlannedSession[] = [];
    let weekVol = vol;
    const isActive = (d: number) => addDays(weekStart, d) >= input.startDate;
    const add = (day: number, workout: Workout, key = false, suffix = '') => {
      const date = addDays(weekStart, day);
      if (date < input.startDate || date > goal.date) return;
      sessions.push({ id: `w${w}d${day}${suffix}`, date, workout, key });
    };

    // autres sports : toujours au calendrier (sauf veille et jour de course)
    sports.forEach((s, i) => {
      const date = addDays(weekStart, s.day);
      if (isRaceWeek && date >= addDays(goal.date, -1)) return;
      add(s.day, crossWorkout(s), false, `x${i}`);
    });
    if (isRaceWeek && sports.some((s) => addDays(weekStart, s.day) === addDays(goal.date, -1) && s.intensity === 'high'))
      notes.push('Ta séance intense de la veille de course a été retirée du plan : évite-la si tu peux.');

    if (isRaceWeek) {
      const raceDow = weekdayOf(goal.date);
      add(raceDow, raceDay(ctx, goal.name, goal.distanceKm, goal.elevationGain), true);
      const before = days.filter((d) => d < raceDow);
      const sharpen = [...before].reverse().find((d) => raceDow - d >= 3 && !afterHard.has(d));
      for (const d of before) {
        if (d === sharpen) add(d, trail ? longHills({ ...ctx, phase: 'taper' }) : racePace({ ...ctx, phase: 'taper' }), true);
        else if (raceDow - d === 1) add(d, shakeout(ctx));
        else add(d, easyRun(ctx, Math.max(5, vol * 0.15)));
      }
    } else {
      // première semaine entamée : on ne répartit que le volume des jours restants
      const fraction = days.filter(isActive).length / days.length;
      const wVol = vol * fraction;
      weekVol = wVol;

      const q = qualityFor(ctx, trail, w, tuning.emphasis);
      const firstWeek = w === 0 && !input.continuation;
      if ((firstWeek && extras.needsTest) || (w === buildStart && buildStart > 0 && !recovery)) q[0] = vmaTest();
      const qWorkouts = qualityDays.map((day, i) => ({ day, workout: q[i] ?? easyRun(ctx, 6, true) })).filter((x) => isActive(x.day));
      const qKm = qWorkouts.reduce((s, x) => s + effortKm(x.workout, profile.vdot), 0);
      const hasLong = isActive(availability.longRunDay);

      const longShare = { base: 0.28, build: 0.3, specific: 0.32, taper: 0.28 }[phase] + (trail ? 0.04 : 0) + (days.length <= 3 ? 0.05 : 0);
      const habitualBase = tuning.longRunStartKm ?? profile.longRunKm * 0.9;
      const habitual = phase === 'taper' ? 0 : Math.min(habitualBase * (recovery ? 0.78 : 1), LONG_CAP[category]);
      let longKm = hasLong ? clamp(Math.max(vol * longShare, habitual), 6, LONG_CAP[category]) : 0;

      const b2bDay = (availability.longRunDay + 6) % 7;
      const backToBack =
        hasLong && !longAfterHard && (category === 'trail_long' || category === 'ultra') && phase === 'specific' && !recovery && easyDays.includes(b2bDay);

      const plainEasy = easyDays.filter((d) => isActive(d) && !(backToBack && d === b2bDay));
      const b2bKm = backToBack ? longKm * 0.55 : 0;
      const easyCap = Math.min(maxEasyKm(availability, profile.vdot), Math.max(6, (longKm || vol * 0.3) * 0.65));
      let remaining = Math.max(0, wVol - longKm - qKm - b2bKm);
      if (plainEasy.length && remaining / plainEasy.length > easyCap && hasLong) {
        const overflow = remaining - easyCap * plainEasy.length;
        const newLong = Math.min(LONG_CAP[category], Math.max(longKm, wVol * 0.4), longKm + overflow);
        remaining -= newLong - longKm;
        longKm = newLong;
      }
      const easyKm = plainEasy.length ? clamp(remaining / plainEasy.length, 5.5, easyCap) : 0;

      for (const { day, workout } of qWorkouts) add(day, workout, true);
      if (hasLong) add(availability.longRunDay, longRun(longAfterHard ? { ...ctx, phase: 'base' } : ctx, longKm), true);
      if (backToBack) {
        const j1 = longRun({ ...ctx, phase: 'build' }, b2bKm);
        add(b2bDay, { ...j1, title: 'Sortie longue J1 (enchaînement)', purpose: 'Arriver à la sortie longue de demain avec de la fatigue, comme en course longue.' }, true);
      }
      // la descente (excentrique) jamais la veille d'une séance clé, ni à côté d'un sport intense
      const near = (d: number, x: number) => (d + 1) % 7 === x || (d + 6) % 7 === x;
      const downhillDay =
        trail && (phase === 'build' || phase === 'specific') && !recovery && w % 2 === 0 && plainEasy.length >= 2 && qualityDays.length >= 2
          ? plainEasy.find((d) => !hardDays.some((h) => near(d, h)) && !qualityDays.includes((d + 1) % 7) && (d + 1) % 7 !== availability.longRunDay)
          : undefined;
      plainEasy.forEach((day, i) => {
        const downhillSlot = day === downhillDay;
        if (afterHard.has(day)) add(day, recoveryRun(ctx, 30));
        else if (downhillSlot) add(day, downhillSkills(ctx));
        else if (days.length === 7 && i === plainEasy.length - 1) add(day, recoveryRun(ctx));
        else add(day, easyRun(ctx, easyKm, i === plainEasy.length - 1 && phase !== 'taper' && plainEasy.length >= 2));
      });
    }

    // renforcement musculaire
    const taperIdx = phase === 'taper' ? phaseIndex(w) : -1;
    const nStrength = strengthCount(extras, phase, recovery, isRaceWeek, taperIdx, level, highSessions);
    const strengthDays = pickStrengthDays(nStrength, {
      // ni le jour de la sortie longue, ni le lendemain d'un sport intense
      isFree: (d) => isActive(d) && addDays(weekStart, d) <= addDays(goal.date, -2) && d !== availability.longRunDay && !afterHard.has(d),
      hardDays,
      qualityDays: sessions.filter((s) => s.key && s.workout.type !== 'race').map((s) => weekdayOf(s.date)),
      runDays: sessions.filter((s) => s.workout.type !== 'cross').map((s) => weekdayOf(s.date)),
    });
    strengthDays.forEach((d, i) =>
      add(
        d,
        strengthSession({ phase, level, sport: goal.sport, fragile: extras.fragile, variant: i % 2, light: recovery || phase === 'taper' }),
        false,
        's',
      ),
    );

    sessions.sort((a, b) => a.date.localeCompare(b.date) || order(a) - order(b));
    // semaine entamée : on affiche ce qui est réellement programmé
    if (weekVol < vol) {
      weekVol = sessions.filter((s) => s.workout.type !== 'strength' && s.workout.type !== 'cross').reduce((t, s) => t + effortKm(s.workout, profile.vdot), 0);
    }
    weeks.push({
      index: w,
      phase,
      startDate: weekStart,
      recovery,
      volumeKm: Math.round(weekVol),
      elevationGain: Math.round(weekElev * (weekVol / vol)),
      sessions,
    });
  }

  return {
    goal,
    availability,
    extras,
    level,
    category,
    weeks,
    generatedAt: new Date().toISOString(),
    notes,
    ...(rawInput.tuning ? { tuning: rawInput.tuning } : {}),
  };
}

function order(s: PlannedSession) {
  return s.workout.type === 'strength' ? 2 : s.workout.type === 'cross' ? 1 : 0;
}

export function buildPhases(n: number, category: RaceCategory): Phase[] {
  const taper = Math.min(TAPER_WEEKS[category], Math.max(1, Math.floor(n / 4)));
  const m = n - taper;
  const specific = m > 0 ? Math.max(1, Math.round(m * 0.3)) : 0;
  let build = m > 1 ? Math.round(m * 0.35) : 0;
  let base = m - specific - build;
  if (base < 0) {
    build += base;
    base = 0;
  }
  return [...Array(base).fill('base'), ...Array(build).fill('build'), ...Array(specific).fill('specific'), ...Array(taper).fill('taper')];
}

/** Nombre de séances de renfo dans la semaine (logique « auto » façon Campus Coach). */
export function strengthCount(
  extras: PlanExtras,
  phase: Phase,
  recovery: boolean,
  raceWeek: boolean,
  taperIdx: number,
  level: Level,
  highSessions: number,
): number {
  if (raceWeek || (phase === 'taper' && taperIdx > 0)) return 0;
  const pref = extras.strength ?? 'auto';
  if (pref === 0) return 0;
  if (phase === 'taper' || recovery) return 1;
  if (pref !== 'auto') return pref;
  const needy = level === 'debutant' || (extras.fragile?.length ?? 0) > 0;
  let n = phase === 'base' ? 2 : phase === 'build' ? (needy ? 2 : 1) : 1;
  if (highSessions >= 2 && !needy) n = Math.min(n, 1);
  return n;
}

/** Jours de renfo : jamais un jour de sport intense, ni la veille d'une séance clé ; de préférence avec un footing ou un jour off. */
export function pickStrengthDays(
  n: number,
  c: { isFree: (d: number) => boolean; hardDays: number[]; qualityDays: number[]; runDays: number[] },
): number[] {
  if (n <= 0) return [];
  const scored = range(0, 7)
    .filter((d) => c.isFree(d) && !c.hardDays.includes(d) && !c.qualityDays.includes((d + 1) % 7) && !c.hardDays.includes((d + 1) % 7))
    .map((d) => ({ d, score: c.qualityDays.includes(d) ? 1 : c.runDays.includes(d) ? 3 : 2 }))
    .sort((a, b) => b.score - a.score || a.d - b.d);
  const chosen: number[] = [];
  for (const { d } of scored) {
    if (chosen.length >= n) break;
    if (chosen.every((x) => Math.abs(x - d) >= 2)) chosen.push(d);
  }
  return chosen.sort((a, b) => a - b);
}

function qualityFor(ctx: BuildContext, trail: boolean, weekIndex: number, emphasis: Emphasis = 'equilibre'): Workout[] {
  const base = baseQuality(ctx, trail, weekIndex);
  const { phase, recovery } = ctx;
  if (recovery || phase === 'taper' || emphasis === 'equilibre') return base;
  // l'accent choisi oriente la deuxième séance dure (la première reste dictée par la phase)
  const second: Record<Exclude<Emphasis, 'equilibre'>, () => Workout> = {
    endurance: () => (phase === 'base' ? fartlek(ctx) : threshold({ ...ctx, progress: Math.max(0, ctx.progress - 0.3) })),
    vitesse: () => (phase === 'base' ? fartlek(ctx) : intervals(ctx)),
    seuil: () => threshold(ctx),
    montee: () => (phase === 'base' ? hills(ctx) : longHills(ctx)),
  };
  const first = emphasis === 'montee' && !trail && phase !== 'specific' ? hills(ctx) : base[0];
  return [first, second[emphasis]()];
}

function baseQuality(ctx: BuildContext, trail: boolean, weekIndex: number): Workout[] {
  const { phase, recovery, category } = ctx;
  if (phase === 'taper') return [trail ? longHills(ctx) : racePace(ctx), easyRun(ctx, 7, true)];
  if (recovery) {
    const first = phase === 'base' ? hills(ctx) : trail ? longHills(ctx) : phase === 'build' ? intervals(ctx) : threshold(ctx);
    return [first, easyRun(ctx, 7, true)];
  }
  if (trail) {
    if (phase === 'base') return [hills(ctx), ctx.progress > 0.5 ? threshold(ctx) : fartlek(ctx)];
    if (phase === 'build') return [longHills(ctx), weekIndex % 3 === 2 ? downhillSkills(ctx) : weekIndex % 2 ? intervals(ctx) : threshold(ctx)];
    return [longHills(ctx), threshold(ctx)];
  }
  if (phase === 'base') return [hills(ctx), ctx.progress > 0.5 ? threshold(ctx) : fartlek(ctx)];
  if (phase === 'build') {
    if (category === 'marathon') return [threshold(ctx), intervals(ctx)];
    return [intervals(ctx), threshold(ctx)];
  }
  if (category === '5k') return [racePace(ctx), weekIndex % 2 ? repetition(ctx) : threshold(ctx)];
  return [racePace(ctx), threshold(ctx)];
}

/**
 * Place les séances de qualité pour maximiser l'écart avec la sortie longue, entre elles
 * et avec les séances intenses des autres sports (jamais deux jours durs d'affilée si évitable).
 */
export function assignDays(days: number[], longRunDay: number, level: Level, hardDays: number[] = [], highSessions = 0, qualityOverride?: 1 | 2) {
  const candidates = days.filter((d) => d !== longRunDay);
  let nQ: number = qualityOverride ?? (days.length <= 3 || (level === 'debutant' && days.length <= 4) ? 1 : 2);
  // un sport intense deux fois par semaine apporte déjà de l'intensité (sauf choix explicite)
  if (highSessions >= 2 && !qualityOverride) nQ = Math.max(1, nQ - 1);
  nQ = Math.min(nQ, candidates.length);
  const circ = (a: number, b: number) => {
    const d = Math.abs(a - b);
    return Math.min(d, 7 - d);
  };
  let best: number[] = [];
  let bestScore = -Infinity;
  const combos = nQ === 0 ? [[]] : nQ === 1 ? candidates.map((c) => [c]) : candidates.flatMap((a, i) => candidates.slice(i + 1).map((b) => [a, b]));
  for (const combo of combos) {
    const hard = [longRunDay, ...combo];
    let minGap = Infinity;
    let sumGap = 0;
    for (let i = 0; i < hard.length; i++)
      for (let j = i + 1; j < hard.length; j++) {
        const g = circ(hard[i], hard[j]);
        minGap = Math.min(minGap, g);
        sumGap += g;
      }
    for (const q of combo)
      for (const h of hardDays) {
        const g = circ(q, h);
        minGap = Math.min(minGap, g);
        sumGap += g;
      }
    const dayBeforeLong = combo.includes((longRunDay + 6) % 7) ? -2 : 0;
    const score = (minGap === Infinity ? 7 : minGap) * 10 + sumGap + dayBeforeLong;
    if (score > bestScore) {
      bestScore = score;
      best = combo;
    }
  }
  const qualityDays = [...best].sort((a, b) => a - b);
  const easyDays = candidates.filter((d) => !qualityDays.includes(d));
  return { qualityDays, easyDays };
}

function range(a: number, b: number) {
  return Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);
}

function effortKm(w: Workout, vdot: number) {
  return estimateWorkout(w, vdot).distanceM / 1000 + (w.elevationGain ?? 0) / 100;
}

function maxEasyKm(a: Availability, vdot: number) {
  if (!a.maxWeekdayMin) return 25;
  const p = trainingPaces(vdot);
  return Math.max(4, (a.maxWeekdayMin * 60) / ((p.easySlow + p.easyFast) / 2));
}

function uniqueSorted(xs: number[]) {
  return [...new Set(xs)].sort((a, b) => a - b);
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}

/* ---------- Séance sur mesure ---------- */

export type CustomKind =
  | 'easy'
  | 'long'
  | 'threshold'
  | 'intervals'
  | 'repetition'
  | 'hills'
  | 'long_hills'
  | 'race_pace'
  | 'fartlek'
  | 'downhill'
  | 'recovery'
  | 'strength'
  | 'test';

export function customSession(
  kind: CustomKind,
  opts: {
    vdot: number;
    sport: 'road' | 'trail';
    category?: RaceCategory;
    level: number;
    km?: number;
    minutes?: number;
    athleteLevel?: Level;
    fragile?: PlanExtras['fragile'];
  },
): Workout {
  const progress = clamp(opts.level, 0, 1);
  const ctx: BuildContext = {
    vdot: opts.vdot,
    sport: opts.sport,
    category: opts.category ?? (opts.sport === 'trail' ? 'trail_medium' : '10k'),
    phase: progress > 0.6 ? 'specific' : 'build',
    progress,
    weekKm: 200, // pas de plafond hebdo pour une séance isolée
    elevationRatio: opts.sport === 'trail' ? 40 : 0,
  };
  const km = opts.km ?? (opts.minutes ? opts.minutes / 6 : 10);
  switch (kind) {
    case 'easy':
      return easyRun(ctx, km);
    case 'recovery':
      return recoveryRun(ctx, opts.minutes ?? 35);
    case 'long':
      return longRun({ ...ctx, phase: 'base' }, km);
    case 'threshold':
      return threshold(ctx);
    case 'intervals':
      return intervals(ctx);
    case 'repetition':
      return repetition(ctx);
    case 'hills':
      return hills(ctx);
    case 'long_hills':
      return longHills(ctx);
    case 'race_pace':
      return racePace(ctx);
    case 'fartlek':
      return fartlek(ctx);
    case 'downhill':
      return downhillSkills(ctx);
    case 'strength':
      return strengthSession({
        phase: progress < 0.3 ? 'base' : progress < 0.7 ? 'build' : 'specific',
        level: opts.athleteLevel ?? 'intermediaire',
        sport: opts.sport,
        fragile: opts.fragile,
        variant: 0,
      });
    case 'test':
      return vmaTest();
  }
}

/** Kilomètres courus d'une semaine : son volume en km-effort, moins le D+ (100 m de D+ = 1 km-effort). */
export function runKm(w: Pick<PlanWeek, 'volumeKm' | 'elevationGain'>): number {
  return Math.max(0, Math.round(w.volumeKm - w.elevationGain / 100));
}
