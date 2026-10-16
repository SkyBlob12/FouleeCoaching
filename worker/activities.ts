import type { ActivitySummary } from '../shared/engine/estimate';
import type { ActivityDetail } from '../shared/engine/analysis';
import { isRun } from '../shared/engine/load';
import { demoActivities, demoDetails } from './demo';
import { fetchActivities, fetchActivityDetail, refreshToken } from './strava';

export const CACHE_TTL_S = 7 * 24 * 3600; // règle Strava : 7 jours max
const RESYNC_S = 3 * 3600;
const HISTORY_DAYS = 180;
const DETAIL_COUNT = 14;
const now = () => Math.floor(Date.now() / 1000);

export interface UserRow {
  id: number;
  strava_id: number | null;
  firstname: string;
  lastname: string;
  avatar: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
  is_demo: number;
}

export async function getUserById(env: Env, uid: number) {
  return env.DB.prepare('SELECT * FROM users WHERE id = ?1').bind(uid).first<UserRow>();
}

export async function validAccessToken(env: Env, u: UserRow): Promise<string> {
  if (u.access_token && u.expires_at && u.expires_at > now() + 120) return u.access_token;
  if (!u.refresh_token) throw new Error('Reconnecte ton compte Strava.');
  const t = await refreshToken(env, u.refresh_token);
  await env.DB.prepare('UPDATE users SET access_token = ?1, refresh_token = ?2, expires_at = ?3 WHERE id = ?4')
    .bind(t.access_token, t.refresh_token, t.expires_at, u.id)
    .run();
  return t.access_token;
}

/** Activités des 180 derniers jours : resynchronisées toutes les 3 h, jamais gardées plus de 7 jours. */
export async function loadActivities(env: Env, u: UserRow, force = false): Promise<{ activities: ActivitySummary[]; syncedAt: number | null; source: string }> {
  const today = new Date().toISOString().slice(0, 10);
  if (u.is_demo) return { activities: demoActivities(today), syncedAt: now(), source: 'demo' };

  const sync = await env.DB.prepare('SELECT last_sync FROM sync_state WHERE user_id = ?1').bind(u.id).first<{ last_sync: number }>();
  const stale = !sync || now() - sync.last_sync > RESYNC_S || force;
  if (stale) {
    try {
      const token = await validAccessToken(env, u);
      const acts = await fetchActivities(token, now() - HISTORY_DAYS * 86400);
      const ts = now();
      await env.DB.batch([
        env.DB.prepare('DELETE FROM activity_cache WHERE user_id = ?1').bind(u.id),
        ...acts.map((a) =>
          env.DB.prepare('INSERT INTO activity_cache (user_id, strava_id, start_date, data, fetched_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(
            u.id,
            a.id,
            a.startDate,
            JSON.stringify(a),
            ts,
          ),
        ),
        env.DB.prepare('INSERT INTO sync_state (user_id, last_sync) VALUES (?1, ?2) ON CONFLICT(user_id) DO UPDATE SET last_sync = ?2').bind(u.id, ts),
      ]);
      return { activities: acts, syncedAt: ts, source: 'strava' };
    } catch (e) {
      if (!sync) throw e;
      // on retombe sur le cache existant
    }
  }
  const rows = await env.DB.prepare('SELECT data FROM activity_cache WHERE user_id = ?1 AND fetched_at > ?2 ORDER BY start_date')
    .bind(u.id, now() - CACHE_TTL_S)
    .all<{ data: string }>();
  return { activities: rows.results.map((r) => JSON.parse(r.data)), syncedAt: sync?.last_sync ?? null, source: 'cache' };
}

/** Tours et meilleurs efforts des sorties récentes (14 max), mis en cache 7 jours. */
export async function loadDetails(env: Env, u: UserRow, activities: ActivitySummary[]): Promise<ActivityDetail[]> {
  return (await detailsFor(env, u, activities.filter((a) => isRun(a.sportType)).slice(-DETAIL_COUNT))).details;
}

/**
 * Meilleurs efforts de toutes les courses de l'historique (page Sorties). Le cache se complète
 * par lots, les plus récentes d'abord, pour rester sous la limite de requêtes Strava.
 */
export async function loadRecordDetails(env: Env, u: UserRow, activities: ActivitySummary[]) {
  return detailsFor(env, u, activities.filter((a) => isRun(a.sportType)), RECORD_FETCH_MAX);
}

const RECORD_FETCH_MAX = 25;

async function detailsFor(env: Env, u: UserRow, runs: ActivitySummary[], maxFetch = Infinity): Promise<{ details: ActivityDetail[]; pending: number }> {
  if (u.is_demo) return { details: demoDetails(runs, runs.length), pending: 0 };
  const cached = await env.DB.prepare('SELECT strava_id, data FROM activity_detail_cache WHERE user_id = ?1 AND fetched_at > ?2')
    .bind(u.id, now() - CACHE_TTL_S)
    .all<{ strava_id: number; data: string }>();
  const have = new Map(cached.results.map((r) => [r.strava_id, JSON.parse(r.data) as ActivityDetail]));
  const missing = runs.filter((a) => !have.has(a.id));
  const batch = missing.slice(-maxFetch);
  if (batch.length) {
    const token = await validAccessToken(env, u);
    const fetched = (await Promise.all(batch.map((a) => fetchActivityDetail(token, a.id).catch(() => null)))).filter((d): d is ActivityDetail => !!d);
    if (fetched.length) {
      await env.DB.batch(
        fetched.map((d) =>
          env.DB.prepare(
            'INSERT INTO activity_detail_cache (user_id, strava_id, data, fetched_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(user_id, strava_id) DO UPDATE SET data = ?3, fetched_at = ?4',
          ).bind(u.id, d.id, JSON.stringify(d), now()),
        ),
      );
    }
    for (const d of fetched) have.set(d.id, d);
  }
  return { details: runs.map((a) => have.get(a.id)).filter((d): d is ActivityDetail => !!d), pending: runs.filter((a) => !have.has(a.id)).length };
}
