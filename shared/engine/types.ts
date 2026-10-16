export type Sport = 'road' | 'trail';
export type Level = 'debutant' | 'intermediaire' | 'confirme';
export type Sex = 'M' | 'F';

/** Intensités cibles. Les allures/FC sont calculées à l'affichage depuis le VDOT courant. */
export type Intensity =
  | 'recovery'
  | 'easy'
  | 'marathon'
  | 'half'
  | '10k'
  | '5k'
  | 'threshold'
  | 'interval'
  | 'repetition'
  | 'hill'
  | 'downhill'
  | 'race'
  | 'walk';

export type StepKind = 'warmup' | 'work' | 'recovery' | 'cooldown' | 'steady';
export type Terrain = 'flat' | 'rolling' | 'uphill' | 'downhill';

export interface Step {
  kind: StepKind;
  intensity: Intensity;
  durationSec?: number;
  distanceM?: number;
  terrain?: Terrain;
  note?: string;
}

export interface Block {
  repeat: number;
  steps: Step[];
}

export type SessionType =
  | 'easy'
  | 'recovery'
  | 'long'
  | 'threshold'
  | 'intervals'
  | 'repetition'
  | 'hills'
  | 'long_hills'
  | 'race_pace'
  | 'fartlek'
  | 'downhill'
  | 'race'
  | 'shakeout'
  | 'strength'
  | 'cross'
  | 'test';

export interface Workout {
  type: SessionType;
  title: string;
  purpose: string;
  blocks: Block[];
  /** D+ visé (trail) en mètres */
  elevationGain?: number;
  /** renforcement musculaire */
  exercises?: Exercise[];
  /** autre sport (handball, vélo…) */
  cross?: { sport: string; intensity: CrossIntensity; durationMin: number };
}

export interface Exercise {
  name: string;
  sets: number;
  reps?: number;
  durationSec?: number;
  /** par jambe / par côté */
  perSide?: boolean;
  restSec: number;
  cue: string;
  focus: string;
}

export type CrossIntensity = 'low' | 'moderate' | 'high';

/** Pratique hebdomadaire récurrente d'un autre sport. */
export interface OtherSport {
  sport: string;
  day: number; // 0 = lundi
  intensity: CrossIntensity;
  durationMin: number;
  label?: string; // « Match », « Entraînement »
}

export type StrengthPref = 'auto' | 0 | 1 | 2;
export type FragileZone = 'genou' | 'cheville' | 'achille' | 'ischios' | 'hanche' | 'dos';

export interface PlanExtras {
  otherSports?: OtherSport[];
  strength?: StrengthPref;
  fragile?: FragileZone[];
  /** insérer un test VMA en semaine 1 (niveau mal connu) */
  needsTest?: boolean;
}

export type Phase = 'base' | 'build' | 'specific' | 'taper';

export interface PlannedSession {
  id: string;
  date: string; // YYYY-MM-DD
  workout: Workout;
  key: boolean; // séance clé (qualité / sortie longue / course)
}

export interface PlanWeek {
  index: number;
  phase: Phase;
  startDate: string; // lundi
  recovery: boolean;
  volumeKm: number; // km-effort (km + D+/100)
  elevationGain: number;
  sessions: PlannedSession[];
}

export interface Goal {
  sport: Sport;
  name: string;
  distanceKm: number;
  elevationGain: number;
  date: string;
  targetTimeSec?: number;
}

export interface Availability {
  /** 0 = lundi … 6 = dimanche */
  days: number[];
  longRunDay: number;
  /** durée max en semaine (minutes), optionnelle */
  maxWeekdayMin?: number;
}

export interface AthleteProfile {
  vdot: number;
  level: Level;
  sex?: Sex;
  birthYear?: number;
  hrMax?: number;
  hrRest?: number;
  lthr?: number;
  /** volume actuel moyen (km/sem) */
  weeklyKm: number;
  /** plus longue sortie récente (km) */
  longRunKm: number;
}

export interface Plan {
  goal: Goal;
  availability: Availability;
  extras?: PlanExtras;
  level?: Level;
  category: RaceCategory;
  weeks: PlanWeek[];
  generatedAt: string;
  notes: string[];
  /** dernier ajustement appliqué depuis les ressentis (les retours antérieurs sont déjà pris en compte) */
  lastAdaptation?: string;
  adaptations?: { date: string; reasons: string[] }[];
  /** réglages appliqués par-dessus l'algorithme (cf. PlanTuning) */
  tuning?: import('./plan').PlanTuning;
  /** analyse de l'IA à la création du plan */
  ai?: PlanAiReview;
  /** bilans hebdomadaires de l'IA, par semaine */
  reviews?: WeekReview[];
}

export interface PlanAiReview {
  at: string;
  model: string;
  usedActivities: boolean;
  assessment: string;
  decisions: { topic: string; choice: string; why: string }[];
  warnings: string[];
}

export interface WeekReview {
  at: string;
  week: number;
  summary: string;
  changes: string[];
  runId?: number | null;
}

export type RaceCategory =
  | '5k'
  | '10k'
  | 'half'
  | 'marathon'
  | 'trail_short'
  | 'trail_medium'
  | 'trail_long'
  | 'ultra';
