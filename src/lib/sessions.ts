import { isRun, type ActivitySummary, type CustomKind, type Intensity, type SessionFeedback, type Workout } from '@engine';
import type { CustomSession, StoredPlan } from './data';

export interface AnySession {
  key: string;
  date: string;
  workout: Workout;
  important: boolean;
  source: 'plan' | 'custom';
  planSessionId?: string;
  customId?: number;
}

export function allSessions(plan: StoredPlan | null, custom: CustomSession[]): AnySession[] {
  const fromPlan: AnySession[] =
    plan?.weeks.flatMap((w) =>
      w.sessions.map((s) => ({ key: `p-${s.id}`, date: s.date, workout: s.workout, important: s.key, source: 'plan' as const, planSessionId: s.id })),
    ) ?? [];
  const fromCustom: AnySession[] = custom.map((c) => ({
    key: `c-${c.id}`,
    date: c.date,
    workout: c.workout,
    important: c.workout.type !== 'easy' && c.workout.type !== 'recovery',
    source: 'custom',
    customId: c.id,
  }));
  return [...fromPlan, ...fromCustom].sort((a, b) => a.date.localeCompare(b.date));
}

export function runsOn(activities: ActivitySummary[], date: string) {
  return activities.filter((a) => a.startDate === date && isRun(a.sportType));
}

export type SessionStatus = 'done' | 'missed' | 'today' | 'upcoming' | 'past';

export function statusOf(s: AnySession, activities: ActivitySummary[], todayIso: string, feedback: SessionFeedback[] = []): SessionStatus {
  const fb = feedback.find((f) => f.key === s.key);
  if (fb) return fb.done ? 'done' : 'missed';
  const offRun = s.workout.type === 'strength' || s.workout.type === 'cross';
  if (offRun) return s.date < todayIso ? 'past' : s.date === todayIso ? 'today' : 'upcoming';
  if (runsOn(activities, s.date).length) return 'done';
  if (s.date < todayIso) return 'missed';
  if (s.date === todayIso) return 'today';
  return 'upcoming';
}

export const INTENSITY_COLOR: Record<Intensity, string> = {
  walk: 'var(--i-rest)',
  recovery: 'var(--i-rest)',
  easy: 'var(--i-easy)',
  downhill: 'var(--i-mod)',
  marathon: 'var(--i-mod)',
  race: 'var(--i-mod)',
  half: 'var(--i-mod)',
  threshold: 'var(--i-thr)',
  hill: 'var(--i-thr)',
  '10k': 'var(--i-thr)',
  '5k': 'var(--i-hard)',
  interval: 'var(--i-hard)',
  repetition: 'var(--i-max)',
};

/** Couleur d'une séance entière, d'après son intensité dominante (semaine, liste du plan). */
export const TYPE_COLOR: Record<Workout['type'], string> = {
  easy: 'var(--i-easy)',
  recovery: 'var(--i-rest)',
  shakeout: 'var(--i-easy)',
  long: 'var(--i-easy)',
  race_pace: 'var(--i-mod)',
  downhill: 'var(--i-mod)',
  threshold: 'var(--i-thr)',
  hills: 'var(--i-thr)',
  long_hills: 'var(--i-thr)',
  fartlek: 'var(--i-thr)',
  intervals: 'var(--i-hard)',
  test: 'var(--i-hard)',
  race: 'var(--i-hard)',
  repetition: 'var(--i-max)',
  strength: 'var(--i-rest)',
  cross: 'var(--i-rest)',
};

/* sur un profil de 5 lignes de grille : Endurance = 2 lignes, Seuil = 4, VMA = 5 */
export const INTENSITY_HEIGHT: Record<Intensity, number> = {
  walk: 0.15,
  recovery: 0.25,
  easy: 0.4,
  downhill: 0.5,
  marathon: 0.6,
  race: 0.6,
  half: 0.7,
  threshold: 0.8,
  hill: 0.8,
  '10k': 0.85,
  '5k': 0.92,
  interval: 1,
  repetition: 1,
};

/** Types de séance proposés à l'ajout (sur mesure) ou au remplacement d'une séance. */
export const CUSTOM_KINDS: { kind: CustomKind; label: string; hint: string; distance?: boolean; trail?: boolean }[] = [
  { kind: 'easy', label: 'Footing', hint: 'Endurance fondamentale', distance: true },
  { kind: 'long', label: 'Sortie longue', hint: 'Foncier, allure facile', distance: true },
  { kind: 'recovery', label: 'Récupération', hint: '30 à 40 min très facile' },
  { kind: 'fartlek', label: 'Fartlek', hint: 'Variations d’allure en douceur' },
  { kind: 'threshold', label: 'Seuil', hint: 'Effort soutenu et régulier' },
  { kind: 'intervals', label: 'VMA', hint: 'Répétitions à VO2max' },
  { kind: 'repetition', label: 'Vitesse', hint: '200 à 400 m rapides' },
  { kind: 'race_pace', label: 'Allure spécifique', hint: 'Blocs à ton allure course' },
  { kind: 'hills', label: 'Côtes courtes', hint: 'Force et puissance' },
  { kind: 'long_hills', label: 'Côtes longues', hint: 'Montées au seuil', trail: true },
  { kind: 'downhill', label: 'Descente', hint: 'Technique et quadriceps', trail: true },
  { kind: 'strength', label: 'Renforcement', hint: '25 à 35 min à la maison' },
  { kind: 'test', label: 'Test VMA', hint: 'Demi-Cooper, 6 min' },
];

export const CUSTOM_LEVELS = [
  { v: 0.1, l: 'Accessible' },
  { v: 0.5, l: 'Standard' },
  { v: 0.95, l: 'Costaud' },
];

export const WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', opts);
}
