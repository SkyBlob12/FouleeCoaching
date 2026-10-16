/**
 * Discussion avec le coach IA pour modifier le plan (« décale ma sortie longue », « je suis malade »…).
 * Claude agit avec les mêmes outils que le connecteur MCP : chaque séance écrite est validée par le moteur,
 * et un instantané pris avant la première modification permet d'annuler en un clic.
 *
 * Données envoyées à Claude : plan, profil déclaré et ressentis. Les activités Strava ne sont
 * accessibles (outil foulee_get_activities) que si l'athlète a donné son accord dans son profil.
 */
import Anthropic from '@anthropic-ai/sdk';
import { isRun } from '../shared/engine';
import type { SavedProfile } from '../shared/profile';
import { getUserById, loadActivities } from './activities';
import { HttpError, snapshot } from './coach';
import { callTool, jour, TOOLS, WRITE_TOOLS } from './coachTools';

export const CHAT_DAILY_LIMIT = 30;
const MAX_TURNS = 12;
const HISTORY = 20;
const now = () => Math.floor(Date.now() / 1000);
const dayStart = () => Math.floor(Date.parse(new Date().toISOString().slice(0, 10)) / 1000);

const SYSTEM = `Tu es le coach running et trail de l'athlète dans Foulée. Il te parle depuis la page de son plan pour le modifier : déplacer, remplacer, alléger, ajouter ou retirer des séances. S'il n'a pas de plan actif, tu travailles sur ses séances sur mesure.

Méthode :
- Commence par foulee_get_context. Avant de modifier une séance, lis-la avec foulee_get_sessions pour avoir son session_id et sa structure.
- Fais ce qui est demandé, plus les ajustements de cohérence indispensables : jamais deux séances de course le même jour (déplace ou retire celle de trop), aucune séance les jours d'un autre sport (autres_sports du profil) sauf demande explicite, pas deux jours durs d'affilée, pas de séance dure la veille ou le lendemain d'un autre sport intense, phases et semaines allégées respectées, environ 80 % du temps en endurance.
- Si la demande met l'athlète en danger (volume qui bondit, courir sur une douleur), dis-le et propose une alternative au lieu de l'appliquer.
- Si deux lectures de la demande donnent des plans différents, pose une question courte avant de modifier.
- Ne touche pas aux séances d'autres sports (type cross) ni à la course objectif, sauf demande explicite.
- Supprime une séance seulement si l'athlète l'a demandé ; mets alors confirmed_by_athlete à true.
- Les allures et la FC sont calculées par Foulée à partir des intensités : n'écris jamais d'allure dans une séance.

Réponse : en français, tutoiement, courte (2 à 6 phrases, ou une liste brève). Dis ce que tu as changé, avec le jour et la date, et pourquoi. Pas de titres ni de tableaux. Si tu n'as rien changé, dis-le clairement. Unités : distances en km et dénivelé en m D+, vitesse de montée en m D+/h ; jamais de km-effort ni de m/h dans ce que lit l'athlète.`;

const ACTIVITIES_TOOL = {
  name: 'foulee_get_activities',
  description: "Sorties de course réellement faites (Strava) sur les derniers jours : date, distance, durée, D+, FC moyenne. À utiliser quand la demande dépend de ce que l'athlète a couru.",
  inputSchema: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 28, default: 14 } }, additionalProperties: false },
};

/** Ce que l'athlète voit pendant que le coach travaille. */
function toolLabel(name: string, a: Record<string, unknown>) {
  const d = (k: string) => (typeof a[k] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a[k] as string) ? jour(a[k] as string) : '');
  switch (name) {
    case 'foulee_get_context':
      return 'Je relis ton plan';
    case 'foulee_get_sessions':
      return `Je regarde les séances du ${d('from')} au ${d('to')}`;
    case 'foulee_get_feedback':
      return 'Je relis tes ressentis';
    case 'foulee_get_activities':
      return 'Je regarde tes dernières sorties';
    case 'foulee_save_session':
      return a.replace_session_id ? `Je remplace la séance du ${d('date')}` : `J’ajoute une séance le ${d('date')}`;
    case 'foulee_move_session':
      return `Je déplace une séance au ${d('date')}`;
    case 'foulee_delete_session':
      return 'Je retire une séance';
    default:
      return 'Je travaille sur ton plan';
  }
}

async function activePlanId(env: Env, uid: number) {
  const row = await env.DB.prepare('SELECT id FROM plans WHERE user_id = ?1 AND active = 1 ORDER BY id DESC LIMIT 1').bind(uid).first<{ id: number }>();
  return row?.id ?? null;
}

async function chatUsage(env: Env, uid: number) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM plan_chat WHERE user_id = ?1 AND role = 'user' AND created_at >= ?2").bind(uid, dayStart()).first<{ n: number }>();
  return { used: row?.n ?? 0, limit: CHAT_DAILY_LIMIT };
}

interface Row {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  data: string | null;
  created_at: number;
  undone: number | null;
}

async function history(env: Env, uid: number, planId: number | null) {
  const rows = await env.DB.prepare(
    `SELECT c.id, c.role, c.content, c.data, c.created_at, r.undone
     FROM plan_chat c LEFT JOIN ai_runs r ON r.id = json_extract(c.data, '$.runId')
     WHERE c.user_id = ?1 AND c.plan_id IS ?2 ORDER BY c.id DESC LIMIT 60`,
  )
    .bind(uid, planId)
    .all<Row>();
  return rows.results.reverse().map((r) => {
    const data = r.data ? (JSON.parse(r.data) as { changes?: string[]; runId?: number | null }) : {};
    return { id: r.id, role: r.role, content: r.content, changes: data.changes ?? [], runId: data.runId ?? null, undone: Boolean(r.undone), created_at: r.created_at };
  });
}

export type ChatMessage = Awaited<ReturnType<typeof history>>[number];

export async function getChat(env: Env, uid: number) {
  const planId = await activePlanId(env, uid);
  return { messages: await history(env, uid, planId), ...(await chatUsage(env, uid)) };
}

export async function clearChat(env: Env, uid: number) {
  const planId = await activePlanId(env, uid);
  await env.DB.prepare('DELETE FROM plan_chat WHERE user_id = ?1 AND plan_id IS ?2').bind(uid, planId).run();
}

/** Contrôles faits avant d'ouvrir le flux, pour renvoyer une vraie erreur HTTP. */
export async function prepareChat(env: Env, uid: number, text: unknown) {
  if (!env.ANTHROPIC_API_KEY) throw new HttpError(503, 'Le coach IA n’est pas configuré sur ce serveur.');
  const message = typeof text === 'string' ? text.trim() : '';
  if (!message) throw new HttpError(400, 'Message vide.');
  if (message.length > 2000) throw new HttpError(400, 'Message trop long (2 000 caractères au plus).');
  // sans plan actif, le fil porte sur les séances sur mesure (plan_id nul)
  const planId = await activePlanId(env, uid);
  const { used, limit } = await chatUsage(env, uid);
  if (used >= limit) throw new HttpError(429, `Tu as envoyé tes ${limit} messages du jour au coach. Réessaie demain.`);
  return { message, planId };
}

/** Flux NDJSON : {t:'tool'}, {t:'text'}, puis {t:'done'} ou {t:'error'}. */
export function chatStream(env: Env, uid: number, planId: number | null, message: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + '\n'));
      try {
        send({ t: 'done', message: await runChat(env, uid, planId, message, send) });
      } catch (e) {
        if (!(e instanceof HttpError)) console.error('chat', e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : String(e));
        send({ t: 'error', error: errorText(e) });
      } finally {
        controller.close();
      }
    },
  });
}

function errorText(e: unknown) {
  if (e instanceof HttpError) return e.message;
  if (e instanceof Anthropic.RateLimitError) return 'Le coach IA est très sollicité. Réessaie dans une minute.';
  if (e instanceof Anthropic.APIError && /credit|billing|balance/i.test(e.message)) return 'Le crédit du coach IA est épuisé. Préviens l’administrateur de Foulée.';
  return 'Le coach ne répond pas pour le moment. Réessaie dans quelques minutes.';
}

async function runChat(env: Env, uid: number, planId: number | null, message: string, send: (o: unknown) => void): Promise<ChatMessage> {
  const past = await history(env, uid, planId);
  await env.DB.prepare("INSERT INTO plan_chat (user_id, plan_id, role, content, created_at) VALUES (?1, ?2, 'user', ?3, ?4)").bind(uid, planId, message, now()).run();

  const prof = await env.DB.prepare('SELECT data FROM profiles WHERE user_id = ?1').bind(uid).first<{ data: string }>();
  const saved: SavedProfile | null = prof ? JSON.parse(prof.data) : null;
  const defs = [...TOOLS.filter((t) => t.name !== 'foulee_add_note'), ...(saved?.aiActivities ? [ACTIVITIES_TOOL] : [])];
  const tools: Anthropic.Beta.BetaTool[] = defs.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema }));

  // les anciens échanges repassent en texte, avec ce que le coach avait modifié
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of past.slice(-HISTORY)) {
    const content =
      m.role === 'assistant' && m.changes.length
        ? `${m.content}\n\n[Modifications appliquées${m.undone ? ', puis annulées par l’athlète' : ''} : ${m.changes.join(' ; ')}]`
        : m.content;
    const last = messages.at(-1);
    if (last && last.role === m.role) last.content = `${last.content as string}\n\n${content}`;
    else messages.push({ role: m.role, content });
  }
  if (messages[0]?.role === 'assistant') messages.shift();
  if (messages.at(-1)?.role === 'user') messages.pop(); // message précédent resté sans réponse
  messages.push({ role: 'user', content: message });

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const model = env.CLAUDE_MODEL || 'claude-sonnet-5-5';
  let text = '';
  const changes: string[] = [];
  let snap: string | null = null;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const stream = client.beta.messages.stream({
      model,
      max_tokens: 16000,
      system: SYSTEM,
      tools,
      messages,
      output_config: { effort: 'medium' },
      cache_control: { type: 'ephemeral' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    let sep = text ? '\n\n' : '';
    stream.on('text', (d) => {
      send({ t: 'text', d: sep + d });
      text += sep + d;
      sep = '';
    });
    const res = await stream.finalMessage();
    if (res.stop_reason === 'refusal') throw new HttpError(502, 'Le coach n’a pas pu traiter cette demande. Reformule-la autrement.');
    if (res.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: res.content });
      continue;
    }
    const uses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (!uses.length) break;
    if (res.stop_reason === 'max_tokens') throw new HttpError(502, 'La réponse du coach a été coupée. Réessaie avec une demande plus courte.');
    messages.push({ role: 'assistant', content: res.content });

    // une par une : chaque outil relit et réécrit le même plan
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const u of uses) {
      const args = (u.input ?? {}) as Record<string, unknown>;
      send({ t: 'tool', label: toolLabel(u.name, args) });
      try {
        if (WRITE_TOOLS.has(u.name) && snap === null) snap = await snapshot(env, uid);
        const out = u.name === 'foulee_get_activities' ? await recentRuns(env, uid, args) : await callTool(u.name, args, env, uid);
        if (WRITE_TOOLS.has(u.name) && typeof out === 'string') changes.push(out.replace(/ \(c-\d+\)/, ''));
        results.push({ type: 'tool_result', tool_use_id: u.id, content: typeof out === 'string' ? out : JSON.stringify(out) });
      } catch (e) {
        results.push({ type: 'tool_result', tool_use_id: u.id, content: `Erreur : ${(e as Error).message}`, is_error: true });
      }
    }
    messages.push({ role: 'user', content: results });
  }

  if (!text.trim()) text = changes.length ? 'C’est fait.' : 'Je n’ai pas pu terminer cette demande. Reformule-la ou découpe-la en plusieurs étapes.';
  let runId: number | null = null;
  if (changes.length && snap) {
    const row = await env.DB.prepare('INSERT INTO ai_runs (user_id, created_at, snapshot) VALUES (?1, ?2, ?3) RETURNING id').bind(uid, now(), snap).first<{ id: number }>();
    runId = row!.id;
  }
  const created = now();
  const row = await env.DB.prepare("INSERT INTO plan_chat (user_id, plan_id, role, content, data, created_at) VALUES (?1, ?2, 'assistant', ?3, ?4, ?5) RETURNING id")
    .bind(uid, planId, text, JSON.stringify({ changes, runId }), created)
    .first<{ id: number }>();
  return { id: row!.id, role: 'assistant', content: text, changes, runId, undone: false, created_at: created };
}

async function recentRuns(env: Env, uid: number, a: Record<string, unknown>) {
  const u = await getUserById(env, uid);
  if (!u) throw new Error('compte introuvable');
  const days = Math.min(28, Math.max(1, Number(a.days ?? 14)));
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { activities } = await loadActivities(env, u);
  return activities
    .filter((x) => x.startDate >= from && isRun(x.sportType))
    .map((x) => ({
      date: x.startDate,
      jour: jour(x.startDate),
      km: Math.round(x.distanceM / 100) / 10,
      duree_min: Math.round(x.movingTimeSec / 60),
      d_plus: Math.round(x.elevationGain),
      fc_moy: x.avgHr ? Math.round(x.avgHr) : null,
    }));
}
