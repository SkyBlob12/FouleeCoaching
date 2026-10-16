/**
 * Outils communs à l'IA du plan : quota quotidien, instantanés et annulation.
 */

export const DAILY_LIMIT = 10;
const now = () => Math.floor(Date.now() / 1000);
const today = () => new Date().toISOString().slice(0, 10);

export async function usage(env: Env, uid: number) {
  const row = await env.DB.prepare('SELECT count FROM ai_usage WHERE user_id = ?1 AND day = ?2').bind(uid, today()).first<{ count: number }>();
  return { used: row?.count ?? 0, limit: DAILY_LIMIT };
}

/** État du plan, des séances sur mesure et du profil avant un passage de l'IA. */
export async function snapshot(env: Env, uid: number) {
  const plan = await env.DB.prepare('SELECT id, data FROM plans WHERE user_id = ?1 AND active = 1 ORDER BY id DESC LIMIT 1').bind(uid).first<{ id: number; data: string }>();
  const custom = await env.DB.prepare('SELECT id, date, data, created_at FROM custom_sessions WHERE user_id = ?1').bind(uid).all();
  const profile = await env.DB.prepare('SELECT data FROM profiles WHERE user_id = ?1').bind(uid).first<{ data: string }>();
  return JSON.stringify({ plan, custom: custom.results, profile: profile?.data ?? null, at: now() });
}

/** Restaure l'état d'avant le passage de l'IA (plan, séances sur mesure, profil, notes). */
export async function undoRun(env: Env, uid: number, runId: number) {
  const run = await env.DB.prepare('SELECT snapshot, created_at, undone FROM ai_runs WHERE id = ?1 AND user_id = ?2')
    .bind(runId, uid)
    .first<{ snapshot: string; created_at: number; undone: number }>();
  if (!run) throw new HttpError(404, 'Modification introuvable.');
  if (run.undone) throw new HttpError(409, 'Déjà annulée.');
  if (now() - run.created_at > 7 * 86400) throw new HttpError(410, 'Trop ancienne pour être annulée.');
  const snap = JSON.parse(run.snapshot) as {
    plan: { id: number; data: string } | null;
    custom: { id: number; date: string; data: string; created_at: number }[];
    profile?: string | null;
    at: number;
  };
  await env.DB.batch([
    ...(snap.plan ? [env.DB.prepare('UPDATE plans SET data = ?1 WHERE id = ?2 AND user_id = ?3').bind(snap.plan.data, snap.plan.id, uid)] : []),
    ...(snap.profile ? [env.DB.prepare('UPDATE profiles SET data = ?1 WHERE user_id = ?2').bind(snap.profile, uid)] : []),
    env.DB.prepare('DELETE FROM custom_sessions WHERE user_id = ?1').bind(uid),
    ...snap.custom.map((c) =>
      env.DB.prepare('INSERT INTO custom_sessions (id, user_id, date, data, created_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(c.id, uid, c.date, c.data, c.created_at),
    ),
    // les notes écrites pendant ce passage de l'IA (après l'instantané)
    env.DB.prepare('DELETE FROM coach_notes WHERE user_id = ?1 AND created_at >= ?2 AND created_at <= ?3').bind(uid, snap.at, run.created_at),
    env.DB.prepare('UPDATE ai_runs SET undone = 1 WHERE id = ?1').bind(runId),
  ]);
}

export class HttpError extends Error {
  constructor(
    public status: 400 | 403 | 404 | 409 | 410 | 429 | 502 | 503,
    message: string,
  ) {
    super(message);
  }
}
