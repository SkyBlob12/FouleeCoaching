import { addDays, type Plan, type PlannedSession, type Workout } from '@engine';

/** Retouches manuelles d'un plan : chaque fonction renvoie un nouveau plan, sans toucher à l'original. */

export function removeSessions<P extends Plan>(plan: P, ids: string[]): P {
  return { ...plan, weeks: plan.weeks.map((w) => ({ ...w, sessions: w.sessions.filter((x) => !ids.includes(x.id)) })) };
}

export function moveSession<P extends Plan>(plan: P, id: string, date: string): P {
  const moved = plan.weeks.flatMap((w) => w.sessions).find((x) => x.id === id);
  if (!moved) return plan;
  const weeks = removeSessions(plan, [id]).weeks;
  const target = weeks.find((w) => w.startDate <= date && date <= addDays(w.startDate, 6)) ?? weeks[weeks.length - 1];
  target.sessions = [...target.sessions, { ...moved, date }].sort((a, b) => a.date.localeCompare(b.date));
  return { ...plan, weeks };
}

export function replaceSession<P extends Plan>(plan: P, id: string, workout: Workout, key: PlannedSession['key']): P {
  return {
    ...plan,
    weeks: plan.weeks.map((w) => ({ ...w, sessions: w.sessions.map((x) => (x.id === id ? { ...x, workout, key } : x)) })),
  };
}

/** Une séance de qualité ou une sortie longue reste « clé » ; footing, récup, renfo et autres sports non. */
export function isKeyWorkout(w: Workout): boolean {
  return !['easy', 'recovery', 'shakeout', 'strength', 'cross'].includes(w.type);
}
