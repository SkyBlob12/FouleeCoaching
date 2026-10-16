import type { ActivitySummary } from '../shared/engine/estimate';
import type { ActivityDetail } from '../shared/engine/analysis';

// Strava annonce https://api-v3.strava.com à partir du 4 janvier 2027.
export const STRAVA_API = 'https://www.strava.com/api/v3';
export const STRAVA_OAUTH = 'https://www.strava.com/oauth';

export interface TokenSet {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface StravaAthlete {
  id: number;
  firstname: string;
  lastname: string;
  profile_medium?: string;
}

export async function exchangeCode(env: Env, code: string): Promise<TokenSet & { athlete: StravaAthlete }> {
  const res = await fetch(`${STRAVA_OAUTH}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Strava token exchange failed (${res.status})`);
  return res.json();
}

export async function refreshToken(env: Env, refresh: string): Promise<TokenSet> {
  const res = await fetch(`${STRAVA_OAUTH}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Strava refresh failed (${res.status})`);
  return res.json();
}

export async function deauthorize(accessToken: string): Promise<void> {
  await fetch(`${STRAVA_OAUTH}/deauthorize`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}` },
  }).catch(() => undefined);
}

interface RawActivity {
  id: number;
  name: string;
  sport_type: string;
  start_date_local: string;
  moving_time: number;
  elapsed_time: number;
  distance: number;
  total_elevation_gain: number;
  average_heartrate?: number;
  max_heartrate?: number;
  workout_type?: number | null;
}

export function toSummary(a: RawActivity): ActivitySummary {
  return {
    id: a.id,
    name: a.name,
    sportType: a.sport_type,
    startDate: a.start_date_local.slice(0, 10),
    movingTimeSec: a.moving_time,
    elapsedTimeSec: a.elapsed_time,
    distanceM: a.distance,
    elevationGain: a.total_elevation_gain,
    avgHr: a.average_heartrate,
    maxHr: a.max_heartrate,
    isRace: a.workout_type === 1,
  };
}

export async function fetchActivities(accessToken: string, afterEpoch: number): Promise<ActivitySummary[]> {
  const out: ActivitySummary[] = [];
  for (let page = 1; page <= 4; page++) {
    const url = `${STRAVA_API}/athlete/activities?after=${afterEpoch}&per_page=200&page=${page}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
    if (res.status === 429) throw new Error('Limite de requêtes Strava atteinte, réessaie dans 15 minutes.');
    if (!res.ok) throw new Error(`Strava activities failed (${res.status})`);
    const batch = (await res.json()) as RawActivity[];
    out.push(...batch.map(toSummary));
    if (batch.length < 200) break;
  }
  return out;
}

interface RawDetail {
  id: number;
  laps?: { distance: number; moving_time: number; average_heartrate?: number; total_elevation_gain?: number }[];
  best_efforts?: { name: string; distance: number; moving_time: number }[];
  splits_metric?: { distance: number; average_grade_adjusted_speed?: number }[];
}

/** VAP de toute la sortie : distance totale / temps « à plat » de chaque split. */
function gapSpeedOf(splits: RawDetail['splits_metric']): number | undefined {
  const ok = (splits ?? []).filter((s) => s.distance > 0 && s.average_grade_adjusted_speed && s.average_grade_adjusted_speed > 0);
  if (!ok.length) return undefined;
  const dist = ok.reduce((t, s) => t + s.distance, 0);
  const flatSec = ok.reduce((t, s) => t + s.distance / s.average_grade_adjusted_speed!, 0);
  return dist / flatSec;
}

/** Détail d'une activité : tours et meilleurs efforts (1 requête par activité). */
export async function fetchActivityDetail(accessToken: string, id: number): Promise<ActivityDetail | null> {
  const res = await fetch(`${STRAVA_API}/activities/${id}`, { headers: { authorization: `Bearer ${accessToken}` } });
  if (res.status === 429) throw new Error('Limite de requêtes Strava atteinte, réessaie dans 15 minutes.');
  if (!res.ok) return null;
  const d = (await res.json()) as RawDetail;
  return {
    id: d.id,
    laps: (d.laps ?? []).map((l) => ({ distanceM: l.distance, movingTimeSec: l.moving_time, avgHr: l.average_heartrate, elevationGain: l.total_elevation_gain })),
    bestEfforts: (d.best_efforts ?? []).map((e) => ({ name: e.name, distanceM: e.distance, movingTimeSec: e.moving_time })),
    gapSpeed: gapSpeedOf(d.splits_metric),
  };
}
