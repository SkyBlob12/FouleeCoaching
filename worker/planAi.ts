/**
 * IA intégrée au plan (Claude, clé de l'administrateur).
 * 1. Création : l'algorithme génère un plan, Claude ajuste ses réglages d'après l'analyse des activités,
 *    l'algorithme régénère le plan avec ces réglages (les règles de sécurité restent celles du moteur).
 * 2. Bilan hebdomadaire : Claude compare prévu / réalisé / ressentis et retouche la semaine suivante ;
 *    chaque retouche est validée (format, dates, pas deux jours durs d'affilée) avant d'être appliquée.
 * L'IA est active par défaut ; elle n'est pas utilisée pour les athlètes qui l'ont désactivée dans leur profil.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import {
  addDays,
  analyzeActivities,
  clampTuning,
  estimateFitness,
  estimateWorkout,
  formatPace,
  generatePlan,
  hrZones,
  mondayOf,
  resolveHr,
  SESSION_TYPE_LABEL,
  trainingPaces,
  validateWorkout,
  vmaFromVdot,
  type Availability,
  type Level,
  type Goal,
  type Plan,
  type PlannedSession,
  type Workout,
} from '../shared/engine';
import { aiAllowed, declaredSamples, resolveProfile, type SavedProfile } from '../shared/profile';
import { getUserById, loadActivities, loadDetails } from './activities';
import { DAILY_LIMIT, HttpError, snapshot, usage } from './coach';

const now = () => Math.floor(Date.now() / 1000);
const today = () => new Date().toISOString().slice(0, 10);
const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const jour = (iso: string) => JOURS[(new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7];
const FEEL: Record<number, string> = { 1: 'trop facile', 2: 'facile', 3: 'juste bien', 4: 'difficile', 5: 'trop dur' };

/* ---------- Schémas de sortie (JSON garanti par l'API) ---------- */

const TuneSchema = z.object({
  assessment: z.string(),
  vdot: z.number().nullable(),
  startVolumeKm: z.number().nullable(),
  peakFactor: z.number().nullable(),
  longRunStartKm: z.number().nullable(),
  qualityPerWeek: z.number().int().nullable(),
  cycleWeeks: z.number().int().nullable(),
  emphasis: z.enum(['equilibre', 'endurance', 'vitesse', 'seuil', 'montee']).nullable(),
  decisions: z.array(z.object({ topic: z.string(), choice: z.string(), why: z.string() })),
  warnings: z.array(z.string()),
});

const StepSchema = z.object({
  kind: z.enum(['warmup', 'work', 'recovery', 'cooldown', 'steady']),
  intensity: z.enum(['recovery', 'easy', 'marathon', 'half', '10k', '5k', 'threshold', 'interval', 'repetition', 'hill', 'downhill', 'race', 'walk']),
  durationSec: z.number().nullable(),
  distanceM: z.number().nullable(),
  terrain: z.enum(['flat', 'rolling', 'uphill', 'downhill']).nullable(),
  note: z.string().nullable(),
});

const WorkoutSchema = z.object({
  type: z.enum(['easy', 'recovery', 'long', 'threshold', 'intervals', 'repetition', 'hills', 'long_hills', 'race_pace', 'fartlek', 'downhill', 'strength']),
  title: z.string(),
  purpose: z.string(),
  blocks: z.array(z.object({ repeat: z.number().int(), steps: z.array(StepSchema) })),
  elevationGain: z.number().nullable(),
  exercises: z
    .array(
      z.object({
        name: z.string(),
        sets: z.number().int(),
        reps: z.number().int().nullable(),
        durationSec: z.number().nullable(),
        perSide: z.boolean(),
        restSec: z.number(),
        cue: z.string(),
        focus: z.string(),
      }),
    )
    .nullable(),
});

const ReviewSchema = z.object({
  summary: z.string(),
  vdotDelta: z.number(),
  changes: z.array(
    z.object({
      action: z.enum(['replace', 'move', 'remove', 'add']),
      sessionId: z.string().nullable(),
      date: z.string(),
      reason: z.string(),
      workout: WorkoutSchema.nullable(),
    }),
  ),
});

/* ---------- Appel au modèle ---------- */

async function askClaude<T extends z.ZodType>(env: Env, system: string, payload: unknown, schema: T): Promise<{ data: z.infer<T>; model: string }> {
  if (!env.ANTHROPIC_API_KEY) throw new HttpError(503, 'Le coach IA n’est pas configuré sur ce serveur.');
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const model = env.CLAUDE_MODEL || 'claude-sonnet-5-5';
  try {
    const res = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      system,
      messages: [{ role: 'user', content: JSON.stringify(payload) }],
      output_config: { effort: 'medium', format: betaZodOutputFormat(schema) },
      cache_control: { type: 'ephemeral' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    if (res.stop_reason === 'refusal' || !res.parsed_output) throw new HttpError(502, 'Le coach IA n’a pas pu analyser ton plan cette fois. Réessaie plus tard.');
    return { data: res.parsed_output as z.infer<T>, model: res.model ?? model };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    console.error('claude', e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : String(e));
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(503, 'Le coach IA est très sollicité. Réessaie dans une minute.');
    if (e instanceof Anthropic.APIError && /credit|billing|balance/i.test(e.message)) throw new HttpError(503, 'Le crédit du coach IA est épuisé. Préviens l’administrateur de Foulée.');
    throw new HttpError(502, 'Le coach IA ne répond pas pour le moment. Réessaie dans quelques minutes.');
  }
}

async function countUse(env: Env, uid: number) {
  const { used } = await usage(env, uid);
  if (used >= DAILY_LIMIT) throw new HttpError(429, `Tu as utilisé tes ${DAILY_LIMIT} analyses IA du jour. Réessaie demain.`);
  await env.DB.prepare('INSERT INTO ai_usage (user_id, day, count) VALUES (?1, ?2, 1) ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1')
    .bind(uid, today())
    .run();
}

/* ---------- Contexte athlète ---------- */

async function athleteContext(env: Env, uid: number) {
  const u = await getUserById(env, uid);
  if (!u) throw new HttpError(404, 'Compte introuvable.');
  const row = await env.DB.prepare('SELECT data FROM profiles WHERE user_id = ?1').bind(uid).first<{ data: string }>();
  const saved: SavedProfile = row ? JSON.parse(row.data) : { level: 'intermediaire', sport: 'road' };
  if (!aiAllowed(saved)) throw new HttpError(403, 'Active le coach IA dans ton profil pour qu’il analyse tes activités.');
  const t = today();
  const { activities } = await loadActivities(env, u);
  const details = await loadDetails(env, u, activities).catch(() => []);
  const estimate = estimateFitness(activities, t, saved ?? undefined, declaredSamples(saved));
  const profile = resolveProfile(saved, estimate, t);
  const analysis = analyzeActivities(activities, details, profile, t);
  const paces = trainingPaces(profile.vdot);
  const { lthr } = resolveHr(profile);
  const fb = await env.DB.prepare('SELECT session_key, date, data FROM session_feedback WHERE user_id = ?1 AND date >= ?2 ORDER BY date')
    .bind(uid, addDays(t, -28))
    .all<{ session_key: string; date: string; data: string }>();
  return {
    u,
    saved,
    profile,
    activities,
    details,
    analysis,
    athlete: {
      niveau: saved.level,
      sexe: saved.sex,
      annee_naissance: saved.birthYear,
      vdot_estime: profile.vdot,
      source_vdot: profile.vdotSource,
      vma_kmh: Math.round(vmaFromVdot(profile.vdot) * 10) / 10,
      allures_min_km: {
        E: `${formatPace(paces.easyFast)}–${formatPace(paces.easySlow)}`,
        M: formatPace(paces.marathon),
        T: formatPace(paces.threshold),
        I: formatPace(paces.interval),
        R: formatPace(paces.repetition),
      },
      zones_fc: lthr ? hrZones(lthr).map((z) => ({ zone: z.zone, de: z.lo, a: z.hi })) : null,
      autres_sports: saved.otherSports ?? [],
      zones_fragiles: saved.fragile ?? [],
      renforcement: saved.strength ?? 'auto',
    },
    ressentis: fb.results.map((r) => {
      const f = JSON.parse(r.data) as { done?: boolean; feel?: number; pain?: number; painZone?: string; note?: string; type?: string };
      return {
        date: r.date,
        seance: f.type ? SESSION_TYPE_LABEL[f.type as keyof typeof SESSION_TYPE_LABEL] ?? f.type : undefined,
        faite: f.done !== false,
        // échelle : 1 trop facile, 2 facile, 3 juste bien, 4 difficile, 5 trop dur
        ressenti: f.feel ? `${FEEL[f.feel]} (${f.feel}/5, où 1 = trop facile et 5 = trop dur)` : undefined,
        douleur: f.pain ? `${f.pain === 2 ? 'douleur' : 'gêne légère'}${f.painZone ? ` (${f.painZone})` : ''}` : 'aucune',
        commentaire: f.note,
      };
    }),
  };
}

function planSummary(plan: Plan) {
  return {
    categorie: plan.category,
    semaines: plan.weeks.map((w) => ({ n: w.index + 1, phase: w.phase, allegee: w.recovery, km_effort: w.volumeKm, d_plus: w.elevationGain })),
    deux_premieres_semaines: plan.weeks.slice(0, 2).map((w) => ({
      n: w.index + 1,
      seances: w.sessions.map((s) => `${jour(s.date)} ${s.date} : ${s.workout.title}`),
    })),
    remarques_algorithme: plan.notes,
  };
}

/* ---------- 1. Affinage du plan à sa création ---------- */

const TUNE_SYSTEM = `Tu es un entraîneur de course à pied et de trail expérimenté (méthodes Daniels, Pfitzinger, Seiler, préparation trail et ultra).
Un algorithme a généré un plan selon des règles fiables (périodisation, progression, récupération). Ton rôle : à partir de l'analyse chiffrée des activités réelles de l'athlète et de son contexte, ajuster les réglages de l'algorithme pour que le plan colle à sa réalité, puis expliquer tes choix.

Réglages (null = garder la valeur de l'algorithme) :
- vdot : niveau (au plus ±4 autour de l'estimation). Appuie-toi sur les meilleurs efforts récents, les séances de qualité (allures et FC des tours) et l'efficacité cardio.
- startVolumeKm : volume de départ en km-effort par semaine (km + D+/100). Jamais plus de 110 % de la moyenne réelle des 4 dernières semaines.
- peakFactor : multiplicateur du volume de pic (0,75 à 1,2).
- longRunStartKm : sortie longue de départ, proche de la plus longue sortie récente.
- qualityPerWeek : 1 ou 2 séances dures par semaine.
- cycleWeeks : 3 (2 semaines de charge + 1 allégée, plus de récupération : débutants, plus de 45 ans, autre sport intense régulier, fatigue) ou 4 (3 + 1).
- emphasis : equilibre, endurance, vitesse, seuil ou montee, selon le point faible le plus utile pour l'objectif.

Règles : la sécurité d'abord ; cohérence avec l'objectif, la date et les autres sports ; tiens compte des zones fragiles et des ressentis. Si les données sont pauvres ou contradictoires, reste proche de l'algorithme et dis-le.
assessment : 3 à 5 phrases en français, tutoiement, concrètes et chiffrées (par exemple « Tu cours 32 km par semaine en moyenne… »). Unités : distances en km et dénivelé en m D+, vitesse de montée en m D+/h ; jamais de km-effort ni de m/h dans ce que lit l'athlète.
decisions : 2 à 6 éléments, chacun avec le sujet, le choix fait et la raison.
warnings : les risques éventuels, liste vide s'il n'y en a pas.`;

export async function tunePlan(env: Env, uid: number, body: { goal: Goal; availability: Availability; startDate: string; level?: Level }) {
  const ctx = await athleteContext(env, uid);
  if (body.level) ctx.profile.level = body.level;
  const extras = {
    otherSports: ctx.saved.otherSports ?? [],
    strength: ctx.saved.strength ?? 'auto',
    fragile: ctx.saved.fragile ?? [],
    needsTest: ctx.profile.vdotSource === 'default' || ctx.profile.vdotSource === 'best_effort',
  };
  const input = { profile: ctx.profile, goal: body.goal, availability: body.availability, startDate: body.startDate, extras };
  const base = generatePlan(input);
  await countUse(env, uid);
  const { data, model } = await askClaude(
    env,
    TUNE_SYSTEM,
    { aujourdhui: today(), objectif: body.goal, disponibilites: { jours: body.availability.days.map((d) => JOURS[d]), sortie_longue: JOURS[body.availability.longRunDay] }, athlete: ctx.athlete, analyse_activites: ctx.analysis, ressentis_recents: ctx.ressentis, plan_algorithme: planSummary(base) },
    TuneSchema,
  );
  const tuning = clampTuning(
    {
      vdot: data.vdot ?? undefined,
      startVolumeKm: data.startVolumeKm ?? undefined,
      peakFactor: data.peakFactor ?? undefined,
      longRunStartKm: data.longRunStartKm ?? undefined,
      qualityPerWeek: (data.qualityPerWeek ?? undefined) as 1 | 2 | undefined,
      cycleWeeks: (data.cycleWeeks ?? undefined) as 3 | 4 | undefined,
      emphasis: data.emphasis ?? undefined,
    },
    { vdot: ctx.profile.vdot },
  );
  const plan = generatePlan({ ...input, tuning });
  plan.ai = { at: new Date().toISOString(), model, usedActivities: true, assessment: data.assessment, decisions: data.decisions, warnings: data.warnings };
  return {
    plan,
    base: { peakKm: Math.max(...base.weeks.map((w) => w.volumeKm)), sessions: base.weeks.reduce((s, w) => s + w.sessions.length, 0) },
  };
}

/* ---------- 2. Bilan de la semaine ---------- */

const REVIEW_SYSTEM = `Tu es l'entraîneur de course à pied et de trail de l'athlète. Chaque semaine, tu fais le bilan des 14 derniers jours (prévu contre réalisé, ressentis, charge) et tu ajustes la semaine à venir du plan.

Changements possibles sur la semaine à venir uniquement : replace (remplacer une séance), move (la déplacer à une autre date de cette semaine), remove (la retirer), add (ajouter une séance).
Contraintes : garde la périodisation (phase, semaine allégée) ; environ 80 % du temps en endurance facile ; jamais deux jours durs d'affilée ; aucune séance dure la veille ou le lendemain d'un autre sport intense (séances de type cross d'intensité high) ; volume de la semaine à ±15 % du prévu, sauf fatigue ou douleur ; pas de diagnostic médical (en cas de douleur qui dure, conseille de consulter).
Fais peu de changements, mais pertinents : de 0 à 4. Ne touche pas aux séances de type cross ni à la course.
Pour une séance (replace ou add) : utilise uniquement les intensités du format, Foulée calcule les allures ; title court ; purpose en une phrase, avec tutoiement. Chaque étape a soit durationSec soit distanceM.
vdotDelta : entre -1 et +1. Mets 0 sans raison claire (par exemple, séances de qualité nettement plus rapides ou plus lentes que les cibles à FC cohérente).
summary : 3 à 5 phrases en français, tutoiement : ce que tu observes, avec des chiffres, et ce que tu changes. Unités : distances en km et dénivelé en m D+, vitesse de montée en m D+/h ; jamais de km-effort ni de m/h dans ce que lit l'athlète.`;

const HARD = new Set(['intervals', 'threshold', 'race_pace', 'hills', 'long_hills', 'repetition', 'fartlek', 'long', 'test', 'race']);
const isHard = (w: Workout) => HARD.has(w.type) || (w.type === 'cross' && w.cross?.intensity === 'high');

function hardConflicts(sessions: PlannedSession[]) {
  const days = [...new Set(sessions.filter((s) => isHard(s.workout)).map((s) => s.date))].sort();
  let n = 0;
  for (let i = 1; i < days.length; i++) if (addDays(days[i - 1], 1) === days[i]) n++;
  return n;
}

function toWorkout(w: z.infer<typeof WorkoutSchema>): Workout {
  return {
    type: w.type,
    title: w.title,
    purpose: w.purpose,
    blocks: w.blocks.map((b) => ({
      repeat: b.repeat,
      steps: b.steps.map((s) => ({
        kind: s.kind,
        intensity: s.intensity,
        ...(s.durationSec ? { durationSec: Math.round(s.durationSec) } : {}),
        ...(s.distanceM ? { distanceM: Math.round(s.distanceM) } : {}),
        ...(s.terrain ? { terrain: s.terrain } : {}),
        ...(s.note ? { note: s.note } : {}),
      })),
    })),
    ...(w.elevationGain ? { elevationGain: Math.round(w.elevationGain) } : {}),
    ...(w.exercises?.length
      ? { exercises: w.exercises.map((e) => ({ ...e, reps: e.reps ?? undefined, durationSec: e.durationSec ?? undefined })) }
      : {}),
  };
}

export async function reviewWeek(env: Env, uid: number) {
  const planRow = await env.DB.prepare('SELECT id, data FROM plans WHERE user_id = ?1 AND active = 1 ORDER BY id DESC LIMIT 1').bind(uid).first<{ id: number; data: string }>();
  if (!planRow) throw new HttpError(404, 'Aucun plan actif.');
  const plan = JSON.parse(planRow.data) as Plan;
  const t = today();
  const nextStart = addDays(mondayOf(t), 7);
  const next = plan.weeks.find((w) => w.startDate === nextStart);
  if (!next) throw new HttpError(409, 'Pas de semaine suivante à ajuster dans ce plan.');
  const ctx = await athleteContext(env, uid);

  const from = addDays(t, -14);
  const planned = plan.weeks.flatMap((w) => w.sessions).filter((s) => s.date >= from && s.date < t);
  const realized = ctx.activities.filter((a) => a.startDate >= from && a.startDate <= t);
  const lapsById = new Map(ctx.details.map((d) => [d.id, d.laps]));
  const prevSunday = addDays(nextStart, -1);
  const neighbours = plan.weeks.flatMap((w) => w.sessions).filter((s) => s.date === prevSunday);

  await countUse(env, uid);
  const { data } = await askClaude(
    env,
    REVIEW_SYSTEM,
    {
      aujourdhui: `${jour(t)} ${t}`,
      objectif: plan.goal,
      athlete: ctx.athlete,
      semaine_a_venir: {
        numero: next.index + 1,
        phase: next.phase,
        allegee: next.recovery,
        volume_prevu_km_effort: next.volumeKm,
        seances: next.sessions.map((s) => ({ session_id: `p-${s.id}`, date: s.date, jour: jour(s.date), type: s.workout.type, seance: s.workout })),
      },
      prevu_14_jours: planned.map((s) => {
        const e = estimateWorkout(s.workout, ctx.profile.vdot);
        return { date: s.date, jour: jour(s.date), type: SESSION_TYPE_LABEL[s.workout.type], titre: s.workout.title, duree_min: Math.round(e.durationSec / 60), km: Math.round(e.distanceM / 100) / 10 };
      }),
      realise_14_jours: realized.map((a) => ({
        date: a.startDate,
        jour: jour(a.startDate),
        sport: a.sportType,
        nom: a.name,
        km: Math.round(a.distanceM / 100) / 10,
        duree_min: Math.round(a.movingTimeSec / 60),
        d_plus: Math.round(a.elevationGain),
        fc_moy: a.avgHr ? Math.round(a.avgHr) : null,
        tours: (lapsById.get(a.id) ?? []).length > 2 ? lapsById.get(a.id)!.map((l) => `${Math.round(l.distanceM)} m ${formatPace(l.movingTimeSec / (l.distanceM / 1000))}${l.avgHr ? ` ${Math.round(l.avgHr)} bpm` : ''}`) : undefined,
      })),
      ressentis: ctx.ressentis,
      charge_et_tendances: { charge: ctx.analysis.charge, intensite: ctx.analysis.intensite, efficacite: ctx.analysis.efficacite },
      veille_de_la_semaine: neighbours.map((s) => ({ date: s.date, type: s.workout.type, titre: s.workout.title })),
    },
    ReviewSchema,
  );

  // application contrôlée
  const snap = await snapshot(env, uid);
  const week = { ...next, sessions: [...next.sessions] };
  const applied: string[] = [];
  const skipped: string[] = [];
  const inWeek = (d: string) => d >= nextStart && d <= addDays(nextStart, 6);
  let counter = 0;
  for (const ch of data.changes) {
    const before = week.sessions.slice();
    const id = ch.sessionId?.replace(/^p-/, '');
    const target = id ? week.sessions.find((s) => s.id === id) : undefined;
    if (target && (target.workout.type === 'cross' || target.workout.type === 'race')) {
      skipped.push(`${ch.reason} (séance protégée)`);
      continue;
    }
    if (!inWeek(ch.date) && ch.action !== 'remove') {
      skipped.push(`${ch.reason} (date hors de la semaine)`);
      continue;
    }
    let workout: Workout | undefined;
    if (ch.action === 'replace' || ch.action === 'add') {
      if (!ch.workout) {
        skipped.push(`${ch.reason} (séance manquante)`);
        continue;
      }
      workout = toWorkout(ch.workout);
      const errors = validateWorkout(workout);
      if (errors.length) {
        skipped.push(`${ch.reason} (séance invalide : ${errors[0]})`);
        continue;
      }
    }
    if ((ch.action === 'replace' || ch.action === 'move' || ch.action === 'remove') && !target) {
      skipped.push(`${ch.reason} (séance introuvable)`);
      continue;
    }
    if (ch.action === 'remove') week.sessions = week.sessions.filter((s) => s !== target);
    if (ch.action === 'move') week.sessions = week.sessions.map((s) => (s === target ? { ...s, date: ch.date } : s));
    if (ch.action === 'replace') week.sessions = week.sessions.map((s) => (s === target ? { ...s, date: ch.date, workout: workout!, key: isHard(workout!) } : s));
    if (ch.action === 'add') week.sessions = [...week.sessions, { id: `w${week.index}ai${now()}${counter++}`, date: ch.date, workout: workout!, key: isHard(workout!) }];
    // garde-fou : on refuse toute retouche qui crée deux jours durs d'affilée
    if (hardConflicts([...neighbours, ...week.sessions]) > hardConflicts([...neighbours, ...before])) {
      week.sessions = before;
      skipped.push(`${ch.reason} (refusé : deux jours durs d'affilée)`);
      continue;
    }
    applied.push(ch.reason);
  }
  week.sessions.sort((a, b) => a.date.localeCompare(b.date));

  // ajustement du niveau (allures) d'après l'exécution des séances
  const delta = Math.max(-1, Math.min(1, Math.round(data.vdotDelta * 10) / 10));
  if (delta) {
    const prof = { ...ctx.saved, vdotOffset: Math.round(((ctx.saved.vdotOffset ?? 0) + delta) * 10) / 10 };
    await env.DB.prepare('UPDATE profiles SET data = ?1, updated_at = ?2 WHERE user_id = ?3').bind(JSON.stringify(prof), now(), uid).run();
    applied.push(`Allures ${delta > 0 ? 'relevées' : 'adoucies'} (${delta > 0 ? '+' : ''}${String(delta).replace('.', ',')} de VO2 max) d'après l'exécution de tes séances.`);
  }

  let runId: number | null = null;
  if (applied.length) {
    const row = await env.DB.prepare('INSERT INTO ai_runs (user_id, created_at, snapshot) VALUES (?1, ?2, ?3) RETURNING id').bind(uid, now(), snap).first<{ id: number }>();
    runId = row!.id;
  }
  const review = { at: new Date().toISOString(), week: next.index, summary: data.summary, changes: applied, runId };
  const updated: Plan = {
    ...plan,
    weeks: plan.weeks.map((w) => (w.index === next.index ? week : w)),
    reviews: [...(plan.reviews ?? []).filter((r) => r.week !== next.index), review],
  };
  await env.DB.prepare('UPDATE plans SET data = ?1 WHERE id = ?2').bind(JSON.stringify(updated), planRow.id).run();
  return { review, skipped, usage: await usage(env, uid) };
}
