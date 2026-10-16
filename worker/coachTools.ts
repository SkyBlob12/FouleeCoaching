/**
 * Outils du coach, partagés par le connecteur MCP (Claude) et le coach IA intégré (Workers AI).
 *
 * Règle Strava : aucune donnée issue de l'API Strava (activités, estimations dérivées)
 * n'est exposée ici. Le modèle ne voit que ce que l'athlète a saisi dans Foulée.
 */
import { addDays, mondayOf, SESSION_TYPE_LABEL, trainingPaces, formatPace, validateWorkout, vmaFromVdot, type Plan, type Workout } from '../shared/engine';
import { declaredVdot, type SavedProfile } from '../shared/profile';

const now = () => Math.floor(Date.now() / 1000);
const today = () => new Date().toISOString().slice(0, 10);
const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
/** « jeudi 22 octobre » : les modèles se trompent souvent de jour, on le leur donne explicitement. */
export const jour = (iso: string) =>
  `${JOURS[(new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7]} ${new Date(iso + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' })}`;

const WORKOUT_SCHEMA_DOC = `Format d'une séance (Workout) :
{ "type": un de ${Object.keys(SESSION_TYPE_LABEL).join(', ')},
  "title": "Seuil : 3 × 10′", "purpose": "but de la séance en une phrase, tutoiement",
  "blocks": [ { "repeat": 1, "steps": [ { "kind": "warmup|work|recovery|cooldown|steady", "intensity": "recovery|easy|marathon|half|10k|5k|threshold|interval|repetition|hill|downhill|race|walk", "durationSec": 900 } ] } ],
  "elevationGain": 300 (facultatif, trail),
  "exercises": [ { "name": "Squat bulgare", "sets": 3, "reps": 8, "perSide": true, "restSec": 60, "cue": "consigne", "focus": "Quadriceps" } ] (uniquement pour type "strength", blocks = []) }
Chaque étape a durationSec OU distanceM. Les allures et FC sont calculées par Foulée depuis l'intensité : n'écris pas d'allure en dur.`;

export const TOOLS = [
  {
    name: 'foulee_get_context',
    description:
      "Profil déclaré de l'athlète (niveau, autres sports, zones fragiles, préférences de renfo, VDOT/VMA s'ils viennent d'une course ou d'un test), résumé du plan (objectif, phases, semaine en cours, volumes), séances des 14 prochains jours et notes du coach. À appeler en premier.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'foulee_get_sessions',
    description: "Séances (plan + sur mesure) entre deux dates, avec leur structure complète et leur identifiant (session_id).",
    inputSchema: {
      type: 'object',
      properties: { from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' } },
      required: ['from', 'to'],
      additionalProperties: false,
    },
  },
  {
    name: 'foulee_get_feedback',
    description: "Ressentis saisis par l'athlète après ses séances : fait ou non, difficulté 1 (trop facile) à 5 (trop dur), douleur 0/1/2 et zone, commentaire.",
    inputSchema: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 120, default: 28 } }, additionalProperties: false },
  },
  {
    name: 'foulee_save_session',
    description: `Crée une séance sur mesure à une date, ou remplace une séance existante (replace_session_id). ${WORKOUT_SCHEMA_DOC}`,
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD' },
        workout: { type: 'object', description: 'Séance au format Workout' },
        replace_session_id: { type: 'string', description: 'session_id à remplacer (facultatif)' },
      },
      required: ['date', 'workout'],
      additionalProperties: false,
    },
  },
  {
    name: 'foulee_move_session',
    description: 'Déplace une séance du plan ou sur mesure à une autre date.',
    inputSchema: {
      type: 'object',
      properties: { session_id: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD' } },
      required: ['session_id', 'date'],
      additionalProperties: false,
    },
  },
  {
    name: 'foulee_delete_session',
    description: 'Supprime une séance (du plan ou sur mesure).',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        confirmed_by_athlete: { type: 'boolean', description: "true uniquement si l'athlète a explicitement demandé ou confirmé cette suppression" },
      },
      required: ['session_id', 'confirmed_by_athlete'],
      additionalProperties: false,
    },
  },
  {
    name: 'foulee_add_note',
    description: "Laisse une note de coach affichée sur la page « Aujourd'hui » de l'athlète (analyse de la semaine, conseil, explication d'un changement). 800 caractères max.",
    inputSchema: { type: 'object', properties: { text: { type: 'string', maxLength: 800 } }, required: ['text'], additionalProperties: false },
  },
];

export const INSTRUCTIONS = `Tu es le coach running/trail de l'athlète dans Foulée. Commence par foulee_get_context et foulee_get_feedback.
Respecte la périodisation existante (phases, semaines allégées), la règle 80/20, pas deux jours durs d'affilée. Les jours d'autres sports (profil.autres_sports) sont pris : aucune séance ces jours-là sauf demande explicite de l'athlète, et aucune séance dure la veille ou le lendemain d'un autre sport intense. Explique chaque changement avec foulee_add_note, en français et en tutoyant.
Tu n'as pas accès aux activités Strava par ce connecteur ; si l'athlète a activé le connecteur Strava officiel, tu peux t'en servir pour l'historique.`;

/* ---------- Accès aux données ---------- */

async function loadPlan(env: Env, uid: number) {
  const row = await env.DB.prepare('SELECT id, data FROM plans WHERE user_id = ?1 AND active = 1 ORDER BY id DESC LIMIT 1').bind(uid).first<{ id: number; data: string }>();
  return row ? { id: row.id, plan: JSON.parse(row.data) as Plan } : null;
}

async function savePlan(env: Env, id: number, plan: Plan) {
  await env.DB.prepare('UPDATE plans SET data = ?1 WHERE id = ?2').bind(JSON.stringify(plan), id).run();
}

async function customSessions(env: Env, uid: number, from: string, to: string) {
  const rows = await env.DB.prepare('SELECT id, date, data FROM custom_sessions WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3 ORDER BY date')
    .bind(uid, from, to)
    .all<{ id: number; date: string; data: string }>();
  return rows.results.map((r) => ({ session_id: `c-${r.id}`, date: r.date, jour: jour(r.date), source: 'sur mesure', workout: JSON.parse(r.data) as Workout }));
}

function planSessions(plan: Plan | undefined, from: string, to: string) {
  return (plan?.weeks ?? []).flatMap((w) =>
    w.sessions
      .filter((s) => s.date >= from && s.date <= to)
      .map((s) => ({ session_id: `p-${s.id}`, date: s.date, jour: jour(s.date), source: 'plan', key: s.key, week: w.index + 1, phase: w.phase, workout: s.workout })),
  );
}

function phaseSummary(plan: Plan) {
  const out: { phase: string; semaines: string }[] = [];
  for (const w of plan.weeks) {
    const last = out[out.length - 1];
    if (last && last.phase === w.phase) last.semaines = `${last.semaines.split('–')[0]}–S${w.index + 1}`;
    else out.push({ phase: w.phase, semaines: `S${w.index + 1}` });
  }
  return out;
}

function checkDate(d: unknown): string {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('date au format YYYY-MM-DD attendue');
  return d;
}

export async function callTool(name: string, a: Record<string, unknown>, env: Env, uid: number): Promise<unknown> {
  const t = today();
  switch (name) {
    case 'foulee_get_context': {
      const prof = await env.DB.prepare('SELECT data FROM profiles WHERE user_id = ?1').bind(uid).first<{ data: string }>();
      const saved: SavedProfile | null = prof ? JSON.parse(prof.data) : null;
      const p = await loadPlan(env, uid);
      const declared = declaredVdot(saved, t);
      const vdot = declared ? declared.vdot + (saved?.vdotOffset ?? 0) : null;
      const paces = vdot ? trainingPaces(vdot) : null;
      const notes = await env.DB.prepare('SELECT text, created_at FROM coach_notes WHERE user_id = ?1 ORDER BY id DESC LIMIT 5').bind(uid).all();
      const upcoming = [...planSessions(p?.plan, t, addDays(t, 14)), ...(await customSessions(env, uid, t, addDays(t, 14)))].sort((x, y) =>
        x.date.localeCompare(y.date),
      );
      const lundi = mondayOf(t);
      return {
        aujourdhui: jour(t),
        cette_semaine: `du ${jour(lundi)} au ${jour(addDays(lundi, 6))}`,
        semaine_prochaine: `du ${jour(addDays(lundi, 7))} au ${jour(addDays(lundi, 13))}`,
        profil: saved
          ? {
              niveau: saved.level,
              terrain: saved.sport,
              sexe: saved.sex,
              annee_naissance: saved.birthYear,
              fc: { max: saved.hrMax, repos: saved.hrRest, seuil: saved.lthr },
              // jour en toutes lettres : un index brut (0 = lundi) est souvent lu comme 0 = dimanche
              autres_sports: (saved.otherSports ?? []).map((o) => ({
                sport: o.sport,
                jour: JOURS[o.day],
                intensite: o.intensity,
                duree_min: o.durationMin,
                libelle: o.label,
              })),
              renforcement: saved.strength ?? 'auto',
              zones_fragiles: saved.fragile ?? [],
              course_de_reference: saved.race,
              test_vma: saved.vmaTest,
            }
          : 'profil non renseigné',
        niveau_declare: vdot
          ? {
              vdot: Math.round(vdot * 10) / 10,
              source: declared!.source,
              vma_kmh: Math.round(vmaFromVdot(vdot) * 10) / 10,
              allures_min_km: { E: `${formatPace(paces!.easyFast)}-${formatPace(paces!.easySlow)}`, M: formatPace(paces!.marathon), T: formatPace(paces!.threshold), I: formatPace(paces!.interval), R: formatPace(paces!.repetition) },
            }
          : "non partagé : l'athlète n'a pas déclaré de course ou de test récent (l'estimation issue de Strava n'est pas transmise)",
        plan: p
          ? {
              objectif: p.plan.goal,
              categorie: p.plan.category,
              disponibilites: p.plan.availability,
              semaine_en_cours: (p.plan.weeks.find((w) => w.startDate === mondayOf(t))?.index ?? -1) + 1,
              nombre_de_semaines: p.plan.weeks.length,
              phases: phaseSummary(p.plan),
              // fenêtre courte autour d'aujourd'hui pour garder un contexte léger
              semaines_proches: p.plan.weeks
                .filter((w) => w.startDate >= addDays(mondayOf(t), -14) && w.startDate <= addDays(mondayOf(t), 42))
                .map((w) => ({ n: w.index + 1, debut: w.startDate, phase: w.phase, allegee: w.recovery, volume_km_effort: w.volumeKm, d_plus: w.elevationGain })),
              remarques: p.plan.notes,
            }
          : 'aucun plan actif',
        seances_14_jours: upcoming.map((s) => ({ session_id: s.session_id, date: s.date, jour: s.jour, type: s.workout.type, titre: s.workout.title, source: s.source })),
        notes_coach: notes.results,
      };
    }
    case 'foulee_get_sessions': {
      const from = checkDate(a.from);
      const to = checkDate(a.to);
      if (to < from) throw new Error('to doit être après from');
      const p = await loadPlan(env, uid);
      return [...planSessions(p?.plan, from, to), ...(await customSessions(env, uid, from, to))].sort((x, y) => x.date.localeCompare(y.date));
    }
    case 'foulee_get_feedback': {
      const days = Math.min(120, Math.max(1, Number(a.days ?? 28)));
      const rows = await env.DB.prepare('SELECT session_key, date, data FROM session_feedback WHERE user_id = ?1 AND date >= ?2 ORDER BY date')
        .bind(uid, addDays(t, -days))
        .all<{ session_key: string; date: string; data: string }>();
      return rows.results.map((r) => ({ session_id: r.session_key, date: r.date, ...JSON.parse(r.data) }));
    }
    case 'foulee_save_session': {
      const date = checkDate(a.date);
      const errors = validateWorkout(a.workout);
      if (errors.length) throw new Error(`séance invalide : ${errors.join(' ; ')}`);
      const workout = a.workout as Workout;
      const replace = typeof a.replace_session_id === 'string' ? a.replace_session_id : undefined;
      if (replace?.startsWith('p-')) {
        const p = await loadPlan(env, uid);
        if (!p) throw new Error('aucun plan actif');
        const id = replace.slice(2);
        let found = false;
        const weeks = p.plan.weeks.map((w) => ({ ...w, sessions: w.sessions.filter((s) => !(s.id === id && (found = true))) }));
        if (!found) throw new Error(`séance ${replace} introuvable`);
        const target = weeks.find((w) => w.startDate <= date && date <= addDays(w.startDate, 6));
        if (!target) throw new Error('date hors du plan');
        target.sessions = [...target.sessions, { id, date, workout, key: workout.type !== 'easy' && workout.type !== 'recovery' && workout.type !== 'strength' }].sort((x, y) =>
          x.date.localeCompare(y.date),
        );
        await savePlan(env, p.id, { ...p.plan, weeks });
        return `Séance du ${jour(date)} remplacée par : ${workout.title}.`;
      }
      if (replace?.startsWith('c-')) {
        const res = await env.DB.prepare('UPDATE custom_sessions SET date = ?1, data = ?2 WHERE id = ?3 AND user_id = ?4')
          .bind(date, JSON.stringify(workout), Number(replace.slice(2)), uid)
          .run();
        if (!res.meta.changes) throw new Error(`séance ${replace} introuvable`);
        return `Séance du ${jour(date)} remplacée par : ${workout.title}.`;
      }
      const row = await env.DB.prepare('INSERT INTO custom_sessions (user_id, date, data, created_at) VALUES (?1, ?2, ?3, ?4) RETURNING id')
        .bind(uid, date, JSON.stringify(workout), now())
        .first<{ id: number }>();
      return `${workout.title} : ajoutée le ${jour(date)} (c-${row!.id}).`;
    }
    case 'foulee_move_session': {
      const date = checkDate(a.date);
      const sid = String(a.session_id ?? '');
      if (sid.startsWith('c-')) {
        const res = await env.DB.prepare('UPDATE custom_sessions SET date = ?1 WHERE id = ?2 AND user_id = ?3').bind(date, Number(sid.slice(2)), uid).run();
        if (!res.meta.changes) throw new Error('séance introuvable');
        return `Séance déplacée au ${jour(date)}.`;
      }
      const p = await loadPlan(env, uid);
      if (!p) throw new Error('aucun plan actif');
      const id = sid.replace(/^p-/, '');
      const moved = p.plan.weeks.flatMap((w) => w.sessions).find((s) => s.id === id);
      if (!moved) throw new Error('séance introuvable');
      const weeks = p.plan.weeks.map((w) => ({ ...w, sessions: w.sessions.filter((s) => s.id !== id) }));
      const target = weeks.find((w) => w.startDate <= date && date <= addDays(w.startDate, 6));
      if (!target) throw new Error('date hors du plan');
      target.sessions = [...target.sessions, { ...moved, date }].sort((x, y) => x.date.localeCompare(y.date));
      await savePlan(env, p.id, { ...p.plan, weeks });
      return `${moved.workout.title} : déplacée du ${jour(moved.date)} au ${jour(date)}.`;
    }
    case 'foulee_delete_session': {
      if (a.confirmed_by_athlete !== true) throw new Error("suppression refusée : demande d'abord confirmation à l'athlète, puis rappelle l'outil avec confirmed_by_athlete=true");
      const sid = String(a.session_id ?? '');
      if (sid.startsWith('c-')) {
        await env.DB.prepare('DELETE FROM custom_sessions WHERE id = ?1 AND user_id = ?2').bind(Number(sid.slice(2)), uid).run();
        return 'Séance supprimée.';
      }
      const p = await loadPlan(env, uid);
      if (!p) throw new Error('aucun plan actif');
      const id = sid.replace(/^p-/, '');
      const gone = p.plan.weeks.flatMap((w) => w.sessions).find((s) => s.id === id);
      if (!gone) throw new Error('séance introuvable');
      await savePlan(env, p.id, { ...p.plan, weeks: p.plan.weeks.map((w) => ({ ...w, sessions: w.sessions.filter((s) => s.id !== id) })) });
      return `${gone.workout.title} du ${jour(gone.date)} : retirée.`;
    }
    case 'foulee_add_note': {
      const text = String(a.text ?? '').trim().slice(0, 800);
      if (!text) throw new Error('note vide');
      await env.DB.prepare('INSERT INTO coach_notes (user_id, text, created_at) VALUES (?1, ?2, ?3)').bind(uid, text, now()).run();
      return 'Note ajoutée.';
    }
    default:
      throw new Error(`outil inconnu : ${name}`);
  }
}


/** Outils qui modifient le plan ou les séances. */
export const WRITE_TOOLS = new Set(['foulee_save_session', 'foulee_move_session', 'foulee_delete_session', 'foulee_add_note']);
