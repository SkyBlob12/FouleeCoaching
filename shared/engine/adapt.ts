import type { Phase, Plan, PlanWeek, SessionType } from './types';
import { addDays, mondayOf } from './load';
import { generatePlan, type PlanInput } from './plan';
import { easyRun, recoveryRun } from './workouts';

/** Ressenti après séance, de 1 (trop facile) à 5 (trop dur). */
export type Feel = 1 | 2 | 3 | 4 | 5;

export interface SessionFeedback {
  key: string;
  date: string;
  done: boolean;
  feel?: Feel;
  /** 0 aucune, 1 gêne légère, 2 douleur qui fait modifier la foulée */
  pain?: 0 | 1 | 2;
  painZone?: string;
  note?: string;
  type?: SessionType;
}

export const FEEL_LABEL: Record<Feel, string> = {
  1: 'Trop facile',
  2: 'Facile',
  3: 'Juste bien',
  4: 'Difficile',
  5: 'Trop dur',
};

const QUALITY = new Set<SessionType>(['intervals', 'threshold', 'race_pace', 'hills', 'long_hills', 'repetition', 'fartlek']);
const RUNNING_EXCLUDED = new Set<SessionType>(['strength', 'cross', 'race']);

export interface Adaptation {
  /** à ajouter au VDOT : toutes les allures suivent */
  vdotDelta: number;
  /** facteur sur le volume des semaines à venir */
  volumeFactor: number;
  reasons: string[];
  pain?: { level: 1 | 2; zone?: string; date: string };
  compliance?: number;
  replan: boolean;
}

export interface PlannedRef {
  key: string;
  date: string;
  type: SessionType;
}

/**
 * Lit les retours de séance comme le ferait un coach (logique « l'entraînement qui t'écoute ») :
 * - qualité jugée facile 2 fois sur 3 → allures relevées ; jugée trop dure → allures baissées ;
 * - séances manquées ou fatigue persistante → on reconduit le volume au lieu de l'augmenter ;
 * - douleur → on coupe l'intensité quelques jours.
 */
export function analyzeFeedback(feedback: SessionFeedback[], planned: PlannedRef[], runDates: Set<string>, today: string): Adaptation {
  const reasons: string[] = [];
  let vdotDelta = 0;
  let volumeFactor = 1;
  const recent = (days: number) => feedback.filter((f) => f.date >= addDays(today, -days) && f.date <= today);

  // 1. allures : les trois dernières séances de qualité notées
  const quality = recent(28)
    .filter((f) => f.done && f.feel && f.type && QUALITY.has(f.type))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
  if (quality.length >= 2) {
    const easy = quality.filter((f) => f.feel! <= 2).length;
    const hard = quality.filter((f) => f.feel! >= 4).length;
    if (easy >= 2 && hard === 0) {
      vdotDelta = 0.7;
      reasons.push('Tes dernières séances de qualité t’ont paru faciles : les allures sont relevées d’environ 1,5 %.');
    } else if (hard >= 2) {
      vdotDelta = -0.7;
      reasons.push('Tes dernières séances de qualité ont été dures : les allures sont adoucies d’environ 1,5 %.');
    }
  }

  // 2. fatigue globale
  const feels = recent(10).filter((f) => f.done && f.feel).map((f) => f.feel!);
  if (feels.length >= 3 && feels.reduce((a, b) => a + b, 0) / feels.length >= 4) {
    volumeFactor = Math.min(volumeFactor, 0.9);
    reasons.push('Tu notes beaucoup de séances difficiles : le volume des prochaines semaines baisse de 10 %.');
  }

  // 3. assiduité sur 14 jours (séances de course passées)
  const past = planned.filter((p) => p.date < today && p.date >= addDays(today, -14) && !RUNNING_EXCLUDED.has(p.type));
  let compliance: number | undefined;
  if (past.length >= 4) {
    const fb = new Map(feedback.map((f) => [f.key, f]));
    const done = past.filter((p) => fb.get(p.key)?.done ?? runDates.has(p.date)).length;
    compliance = done / past.length;
    if (compliance < 0.6) {
      volumeFactor = Math.min(volumeFactor, 0.9);
      reasons.push(`Tu as fait ${done} séances sur ${past.length} ces deux dernières semaines : on reprend sans augmenter la charge.`);
    }
  }

  // 4. douleur
  const painful = recent(7)
    .filter((f) => (f.pain ?? 0) > 0)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  let pain: Adaptation['pain'];
  if (painful) {
    pain = { level: painful.pain as 1 | 2, zone: painful.painZone, date: painful.date };
    if (painful.pain === 2) {
      volumeFactor = Math.min(volumeFactor, 0.7);
      reasons.push(
        `Douleur signalée${painful.painZone ? ` (${painful.painZone})` : ''} : pas d’intensité pendant 3 jours et volume réduit. Si elle persiste ou modifie ta foulée, consulte un professionnel de santé.`,
      );
    } else if (painful.date >= addDays(today, -4)) {
      reasons.push(`Gêne signalée${painful.painZone ? ` (${painful.painZone})` : ''} : la prochaine séance dure est remplacée par un footing.`);
    }
  }

  return { vdotDelta, volumeFactor, reasons, pain, compliance, replan: vdotDelta !== 0 || volumeFactor < 1 || Boolean(pain) };
}

/** Coupe l'intensité dans les jours qui suivent une douleur. */
export function protectAfterPain(plan: Plan, pain: NonNullable<Adaptation['pain']>, vdot: number, today: string): Plan {
  const until = addDays(today, pain.level === 2 ? 3 : 2);
  let replacedLight = false;
  const weeks = plan.weeks.map((w) => ({
    ...w,
    sessions: w.sessions.map((s) => {
      if (s.date < today || s.date > until || !QUALITY.has(s.workout.type)) return s;
      if (pain.level === 1 && replacedLight) return s;
      replacedLight = true;
      const ctx = { vdot, sport: plan.goal.sport, category: plan.category, phase: 'base' as Phase, progress: 0, weekKm: 50, elevationRatio: 0 };
      return { ...s, key: false, workout: pain.level === 2 ? recoveryRun(ctx, 30) : easyRun(ctx, 7) };
    }),
  }));
  return { ...plan, weeks };
}

/**
 * Recalcule les semaines à venir (à partir de la semaine prochaine) en gardant les phases d'origine,
 * comme quand une appli de coaching « recalcule ton plan ».
 */
export function replanFuture(
  plan: Plan,
  input: Omit<PlanInput, 'goal' | 'availability' | 'startDate' | 'continuation' | 'extras'>,
  adaptation: Pick<Adaptation, 'volumeFactor'>,
  today: string,
): Plan {
  const first = plan.weeks[0];
  const planStart = addDays(first.startDate, -7 * first.index);
  const n = first.index + plan.weeks.length;
  const phases: Phase[] = Array.from({ length: n }, (_, i) => plan.weeks.find((w) => w.index === i)?.phase ?? first.phase);
  const current = plan.weeks.find((w) => w.startDate === mondayOf(today));
  const fromWeek = (current?.index ?? first.index - 1) + 1;
  if (fromWeek >= n) return plan;

  // on repart du volume que le plan prévoyait pour cette semaine (la précédente peut être partielle ou allégée)
  const target = plan.weeks.find((w) => w.index === fromWeek);
  const resumeKm = target ? (target.recovery ? target.volumeKm / 0.75 : target.volumeKm) : input.profile.weeklyKm;
  const peakKm = Math.max(...plan.weeks.filter((w) => w.phase !== 'taper').map((w) => w.volumeKm), 1) * adaptation.volumeFactor;
  const regenerated = generatePlan({
    ...input,
    profile: { ...input.profile, weeklyKm: resumeKm * adaptation.volumeFactor, weeklyElevation: 0 },
    goal: plan.goal,
    availability: plan.availability,
    extras: plan.extras,
    tuning: plan.tuning ? { ...plan.tuning, startVolumeKm: undefined, vdot: undefined } : undefined,
    startDate: addDays(planStart, fromWeek * 7),
    continuation: { planStart, phases, fromWeek, peakKm },
  });
  const kept: PlanWeek[] = plan.weeks.filter((w) => w.index < fromWeek);
  return { ...plan, weeks: [...kept, ...regenerated.weeks], generatedAt: new Date().toISOString() };
}
