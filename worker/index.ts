import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import { deauthorize, exchangeCode } from './strava';
import { CACHE_TTL_S, getUserById, loadActivities, loadRecordDetails, validAccessToken } from './activities';
import { handleMcp } from './mcp';
import { HttpError, undoRun, usage } from './coach';
import { reviewWeek, tunePlan } from './planAi';
import { chatStream, clearChat, getChat, prepareChat } from './planChat';

type Vars = { uid: number };
type App = { Bindings: Env; Variables: Vars };
type C = Context<App>;

const app = new Hono<App>().basePath('/api');

const SESSION_COOKIE = 'rc_session';
const STATE_COOKIE = 'rc_oauth_state';
const now = () => Math.floor(Date.now() / 1000);

async function startSession(c: C, uid: number) {
  const token = await sign({ uid, exp: now() + 60 * 24 * 3600 }, c.env.SESSION_SECRET, 'HS256');
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 24 * 3600,
  });
}

/* ---------- Auth ---------- */

app.get('/auth/strava', (c) => {
  const state = crypto.randomUUID();
  setCookie(c, STATE_COOKIE, state, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 600 });
  const origin = new URL(c.req.url).origin;
  const params = new URLSearchParams({
    client_id: c.env.STRAVA_CLIENT_ID,
    redirect_uri: `${origin}/api/auth/callback`,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'read,activity:read_all',
    state,
  });
  return c.redirect(`https://www.strava.com/oauth/authorize?${params}`);
});

app.get('/auth/callback', async (c) => {
  const { code, state, error, scope } = c.req.query();
  const expected = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: '/' });
  if (error || !code) return c.redirect('/connexion?erreur=refus');
  if (!state || state !== expected) return c.redirect('/connexion?erreur=etat');
  if (!scope?.includes('activity:read')) return c.redirect('/connexion?erreur=scope');

  const t = await exchangeCode(c.env, code);
  const row = await c.env.DB.prepare(
    `INSERT INTO users (strava_id, firstname, lastname, avatar, access_token, refresh_token, expires_at, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
     ON CONFLICT(strava_id) DO UPDATE SET firstname = ?2, lastname = ?3, avatar = ?4,
       access_token = ?5, refresh_token = ?6, expires_at = ?7
     RETURNING id`,
  )
    .bind(t.athlete.id, t.athlete.firstname, t.athlete.lastname, t.athlete.profile_medium ?? null, t.access_token, t.refresh_token, t.expires_at, now())
    .first<{ id: number }>();
  await startSession(c, row!.id);
  return c.redirect('/');
});

app.post('/auth/demo', async (c) => {
  if (c.env.DEMO_MODE !== '1') return c.json({ error: 'Mode démo désactivé' }, 403);
  let row = await c.env.DB.prepare('SELECT id FROM users WHERE is_demo = 1 LIMIT 1').first<{ id: number }>();
  if (!row) {
    row = await c.env.DB.prepare(
      `INSERT INTO users (firstname, lastname, is_demo, created_at) VALUES ('Camille', 'Démo', 1, ?1) RETURNING id`,
    )
      .bind(now())
      .first<{ id: number }>();
  }
  await startSession(c, row!.id);
  return c.json({ ok: true });
});

app.post('/auth/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

app.get('/config', (c) => c.json({ demo: c.env.DEMO_MODE === '1', strava: Boolean(c.env.STRAVA_CLIENT_ID) }));

/* ---------- Session requise ---------- */

app.use('/*', async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return c.json({ error: 'non connecté' }, 401);
  try {
    const payload = await verify(token, c.env.SESSION_SECRET, 'HS256');
    c.set('uid', payload.uid as number);
  } catch {
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ error: 'session expirée' }, 401);
  }
  await next();
});

async function getUser(c: C) {
  return getUserById(c.env, c.get('uid'));
}

app.get('/me', async (c) => {
  const u = await getUser(c);
  if (!u) return c.json({ error: 'introuvable' }, 404);
  const profile = await c.env.DB.prepare('SELECT data FROM profiles WHERE user_id = ?1').bind(u.id).first<{ data: string }>();
  return c.json({
    user: { id: u.id, firstname: u.firstname, lastname: u.lastname, avatar: u.avatar, demo: Boolean(u.is_demo) },
    profile: profile ? JSON.parse(profile.data) : null,
  });
});

app.put('/profile', async (c) => {
  const body = await c.req.json();
  const data = JSON.stringify(body);
  if (data.length > 10_000) return c.json({ error: 'profil trop volumineux' }, 413);
  await c.env.DB.prepare(
    `INSERT INTO profiles (user_id, data, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(user_id) DO UPDATE SET data = ?2, updated_at = ?3`,
  )
    .bind(c.get('uid'), data, now())
    .run();
  return c.json({ ok: true });
});

/** Supprime le compte, révoque l'accès Strava et efface toutes les données. */
app.delete('/me', async (c) => {
  const u = await getUser(c);
  if (u?.access_token) await deauthorize(await validAccessToken(c.env, u).catch(() => u.access_token!));
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?1').bind(c.get('uid')).run();
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

/* ---------- Activités (cache Strava ≤ 7 jours) ---------- */

app.get('/activities', async (c) => {
  const u = await getUser(c);
  if (!u) return c.json({ error: 'introuvable' }, 404);
  try {
    return c.json(await loadActivities(c.env, u, c.req.query('refresh') === '1'));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

/** Meilleurs efforts Strava de toutes les courses en cache (records de la page Sorties). */
app.get('/records', async (c) => {
  const u = await getUser(c);
  if (!u) return c.json({ error: 'introuvable' }, 404);
  try {
    const { activities } = await loadActivities(c.env, u);
    const { details, pending } = await loadRecordDetails(c.env, u, activities);
    return c.json({ efforts: details.map((d) => ({ id: d.id, bestEfforts: d.bestEfforts, gapSpeed: d.gapSpeed })), pending });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

/* ---------- Plan ---------- */

app.get('/plan', async (c) => {
  const row = await c.env.DB.prepare('SELECT id, data FROM plans WHERE user_id = ?1 AND active = 1 ORDER BY id DESC LIMIT 1')
    .bind(c.get('uid'))
    .first<{ id: number; data: string }>();
  return c.json({ plan: row ? { id: row.id, ...JSON.parse(row.data) } : null });
});

app.post('/plan', async (c) => {
  const body = await c.req.text();
  if (body.length > 1_000_000) return c.json({ error: 'plan trop volumineux' }, 413);
  const plan = JSON.parse(body);
  if (!plan?.weeks || !plan?.goal) return c.json({ error: 'plan invalide' }, 400);
  const uid = c.get('uid');
  await c.env.DB.prepare('UPDATE plans SET active = 0 WHERE user_id = ?1').bind(uid).run();
  const row = await c.env.DB.prepare('INSERT INTO plans (user_id, data, created_at) VALUES (?1, ?2, ?3) RETURNING id')
    .bind(uid, JSON.stringify(plan), now())
    .first<{ id: number }>();
  return c.json({ id: row!.id });
});

app.put('/plan/:id', async (c) => {
  const body = await c.req.text();
  if (body.length > 1_000_000) return c.json({ error: 'plan trop volumineux' }, 413);
  const plan = JSON.parse(body);
  delete plan.id;
  const res = await c.env.DB.prepare('UPDATE plans SET data = ?1 WHERE id = ?2 AND user_id = ?3')
    .bind(JSON.stringify(plan), Number(c.req.param('id')), c.get('uid'))
    .run();
  return res.meta.changes ? c.json({ ok: true }) : c.json({ error: 'introuvable' }, 404);
});

app.delete('/plan/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM plans WHERE id = ?1 AND user_id = ?2').bind(Number(c.req.param('id')), c.get('uid')).run();
  return c.json({ ok: true });
});

/* ---------- Séances sur mesure ---------- */

app.get('/sessions', async (c) => {
  const rows = await c.env.DB.prepare('SELECT id, date, data FROM custom_sessions WHERE user_id = ?1 ORDER BY date')
    .bind(c.get('uid'))
    .all<{ id: number; date: string; data: string }>();
  return c.json({ sessions: rows.results.map((r) => ({ id: r.id, date: r.date, workout: JSON.parse(r.data) })) });
});

app.post('/sessions', async (c) => {
  const { date, workout } = await c.req.json<{ date: string; workout: unknown }>();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !workout) return c.json({ error: 'séance invalide' }, 400);
  const data = JSON.stringify(workout);
  if (data.length > 50_000) return c.json({ error: 'séance trop volumineuse' }, 413);
  const row = await c.env.DB.prepare('INSERT INTO custom_sessions (user_id, date, data, created_at) VALUES (?1, ?2, ?3, ?4) RETURNING id')
    .bind(c.get('uid'), date, data, now())
    .first<{ id: number }>();
  return c.json({ id: row!.id });
});

app.put('/sessions/:id', async (c) => {
  const { date, workout } = await c.req.json<{ date: string; workout: unknown }>();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !workout) return c.json({ error: 'séance invalide' }, 400);
  const data = JSON.stringify(workout);
  if (data.length > 50_000) return c.json({ error: 'séance trop volumineuse' }, 413);
  const res = await c.env.DB.prepare('UPDATE custom_sessions SET date = ?1, data = ?2 WHERE id = ?3 AND user_id = ?4')
    .bind(date, data, Number(c.req.param('id')), c.get('uid'))
    .run();
  return res.meta.changes ? c.json({ ok: true }) : c.json({ error: 'introuvable' }, 404);
});

app.delete('/sessions/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM custom_sessions WHERE id = ?1 AND user_id = ?2').bind(Number(c.req.param('id')), c.get('uid')).run();
  return c.json({ ok: true });
});

/* ---------- Ressentis ---------- */

app.get('/feedback', async (c) => {
  const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  const rows = await c.env.DB.prepare('SELECT session_key, date, data FROM session_feedback WHERE user_id = ?1 AND date >= ?2 ORDER BY date')
    .bind(c.get('uid'), since)
    .all<{ session_key: string; date: string; data: string }>();
  return c.json({ feedback: rows.results.map((r) => ({ ...JSON.parse(r.data), key: r.session_key, date: r.date })) });
});

app.put('/feedback/:key', async (c) => {
  const key = c.req.param('key');
  const body = await c.req.json<{ date: string }>();
  if (!/^[pc]-[\w-]{1,40}$/.test(key) || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return c.json({ error: 'ressenti invalide' }, 400);
  const data = JSON.stringify(body);
  if (data.length > 4000) return c.json({ error: 'ressenti trop long' }, 413);
  await c.env.DB.prepare(
    `INSERT INTO session_feedback (user_id, session_key, date, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(user_id, session_key) DO UPDATE SET date = ?3, data = ?4, updated_at = ?5`,
  )
    .bind(c.get('uid'), key, body.date, data, now())
    .run();
  return c.json({ ok: true });
});

/* ---------- Notes du coach (Claude) ---------- */

app.get('/notes', async (c) => {
  const rows = await c.env.DB.prepare('SELECT id, text, created_at FROM coach_notes WHERE user_id = ?1 ORDER BY id DESC LIMIT 10').bind(c.get('uid')).all();
  return c.json({ notes: rows.results });
});

app.delete('/notes/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM coach_notes WHERE id = ?1 AND user_id = ?2').bind(Number(c.req.param('id')), c.get('uid')).run();
  return c.json({ ok: true });
});

/* ---------- IA du plan ---------- */

const aiRoute = (fn: (c: C) => Promise<unknown>) => async (c: C) => {
  try {
    return c.json(await fn(c));
  } catch (e) {
    if (e instanceof HttpError) return c.json({ error: e.message }, e.status);
    throw e;
  }
};

app.get('/ai/status', async (c) => c.json({ enabled: Boolean(c.env.ANTHROPIC_API_KEY), ...(await usage(c.env, c.get('uid'))) }));
app.post('/ai/tune', aiRoute(async (c) => tunePlan(c.env, c.get('uid'), await c.req.json())));
app.post('/ai/review', aiRoute(async (c) => reviewWeek(c.env, c.get('uid'))));
app.post('/ai/undo/:id', aiRoute(async (c) => (await undoRun(c.env, c.get('uid'), Number(c.req.param('id'))), { ok: true })));

/* ---------- Discussion avec le coach (modification du plan) ---------- */

app.get('/ai/chat', aiRoute(async (c) => getChat(c.env, c.get('uid'))));
app.delete('/ai/chat', aiRoute(async (c) => (await clearChat(c.env, c.get('uid')), { ok: true })));
app.post('/ai/chat', async (c) => {
  try {
    const body = await c.req.json<{ message?: unknown }>().catch(() => ({ message: undefined }));
    const { message, planId } = await prepareChat(c.env, c.get('uid'), body.message);
    return new Response(chatStream(c.env, c.get('uid'), planId, message), {
      headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' },
    });
  } catch (e) {
    if (e instanceof HttpError) return c.json({ error: e.message }, e.status);
    throw e;
  }
});

/* ---------- Connecteur Claude ---------- */

app.get('/mcp-token', async (c) => {
  const row = await c.env.DB.prepare('SELECT mcp_token FROM users WHERE id = ?1').bind(c.get('uid')).first<{ mcp_token: string | null }>();
  return c.json({ token: row?.mcp_token ?? null });
});

app.post('/mcp-token', async (c) => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await c.env.DB.prepare('UPDATE users SET mcp_token = ?1 WHERE id = ?2').bind(token, c.get('uid')).run();
  return c.json({ token });
});

app.delete('/mcp-token', async (c) => {
  await c.env.DB.prepare('UPDATE users SET mcp_token = NULL WHERE id = ?1').bind(c.get('uid')).run();
  return c.json({ ok: true });
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || 'Erreur serveur' }, 500);
});

export default {
  fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(req.url);
    const m = /^\/mcp\/([^/]+)\/?$/.exec(url.pathname);
    if (m) return handleMcp(req, env, m[1]);
    return app.fetch(req, env, ctx);
  },
  async scheduled(_event: ScheduledController, env: Env) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM activity_cache WHERE fetched_at < ?1').bind(now() - CACHE_TTL_S),
      env.DB.prepare('DELETE FROM activity_detail_cache WHERE fetched_at < ?1').bind(now() - CACHE_TTL_S),
    ]);
  },
} satisfies ExportedHandler<Env>;
