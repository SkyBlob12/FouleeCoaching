import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ActivitySummary, Plan, SessionFeedback, Workout } from '@engine';
import { api, AuthError } from './api';
import { estimateFrom, resolveProfile, type EffectiveProfile, type SavedProfile } from './profile';

export interface Me {
  id: number;
  firstname: string;
  lastname: string;
  avatar: string | null;
  demo: boolean;
}

export type StoredPlan = Plan & { id: number };
export interface CoachNote {
  id: number;
  text: string;
  created_at: number;
}

export interface CustomSession {
  id: number;
  date: string;
  workout: Workout;
}

interface DataState {
  status: 'loading' | 'anonymous' | 'ready' | 'error';
  error?: string;
  config: { demo: boolean; strava: boolean };
  me?: Me;
  saved: SavedProfile | null;
  profile?: EffectiveProfile;
  activities: ActivitySummary[];
  activitiesError?: string;
  syncedAt?: number | null;
  plan: StoredPlan | null;
  sessions: CustomSession[];
  feedback: SessionFeedback[];
  notes: CoachNote[];
  aiStatus: { enabled: boolean; used: number; limit: number };
}

interface DataApi extends DataState {
  reload: () => Promise<void>;
  refreshActivities: () => Promise<void>;
  saveProfile: (p: SavedProfile) => Promise<void>;
  savePlan: (p: Plan) => Promise<void>;
  updatePlan: (p: StoredPlan) => Promise<void>;
  deletePlan: () => Promise<void>;
  addSession: (date: string, workout: Workout) => Promise<void>;
  updateSession: (s: CustomSession) => Promise<void>;
  deleteSession: (id: number) => Promise<void>;
  saveFeedback: (f: SessionFeedback) => Promise<void>;
  deleteNote: (id: number) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const Ctx = createContext<DataApi | null>(null);

const initial: DataState = {
  status: 'loading',
  config: { demo: false, strava: false },
  saved: null,
  activities: [],
  plan: null,
  sessions: [],
  feedback: [],
  notes: [],
  aiStatus: { enabled: false, used: 0, limit: 0 },
};

export function DataProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<DataState>(initial);

  const load = useCallback(async (refresh = false) => {
    const config = await api<DataState['config']>('/config').catch(() => initial.config);
    try {
      const { user, profile } = await api<{ user: Me; profile: SavedProfile | null }>('/me');
      const [acts, plan, sessions, feedback, notes, aiStatus] = await Promise.all([
        api<{ activities: ActivitySummary[]; syncedAt: number | null }>(`/activities${refresh ? '?refresh=1' : ''}`).catch(
          (e: Error) => ({ activities: [] as ActivitySummary[], syncedAt: null, error: e.message }),
        ),
        api<{ plan: StoredPlan | null }>('/plan'),
        api<{ sessions: CustomSession[] }>('/sessions'),
        api<{ feedback: SessionFeedback[] }>('/feedback'),
        api<{ notes: CoachNote[] }>('/notes'),
        api<DataState['aiStatus']>('/ai/status').catch(() => initial.aiStatus),
      ]);
      setS({
        status: 'ready',
        config,
        me: user,
        saved: profile,
        activities: acts.activities,
        activitiesError: 'error' in acts ? acts.error : undefined,
        syncedAt: acts.syncedAt,
        plan: plan.plan,
        sessions: sessions.sessions,
        feedback: feedback.feedback,
        notes: notes.notes,
        aiStatus,
      });
    } catch (e) {
      if (e instanceof AuthError) setS({ ...initial, status: 'anonymous', config });
      else setS({ ...initial, status: 'error', config, error: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // le coach (connecteur Claude) modifie séances et notes hors du site : on les relit au retour sur l'onglet
  const ready = s.status === 'ready';
  useEffect(() => {
    if (!ready) return;
    const sync = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const [plan, sessions, notes] = await Promise.all([
          api<{ plan: StoredPlan | null }>('/plan'),
          api<{ sessions: CustomSession[] }>('/sessions'),
          api<{ notes: CoachNote[] }>('/notes'),
        ]);
        setS((x) => (x.status === 'ready' ? { ...x, plan: plan.plan, sessions: sessions.sessions, notes: notes.notes } : x));
      } catch {
        /* hors ligne ou session expirée : on garde l'état courant */
      }
    };
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [ready]);

  const profile = useMemo(() => {
    if (s.status !== 'ready') return undefined;
    return resolveProfile(s.saved, estimateFrom(s.activities, s.saved));
  }, [s.status, s.saved, s.activities]);

  const value: DataApi = {
    ...s,
    profile,
    reload: () => load(),
    refreshActivities: () => load(true),
    saveProfile: async (p) => {
      await api('/profile', { method: 'PUT', json: p });
      setS((x) => ({ ...x, saved: p }));
    },
    savePlan: async (p) => {
      const { id } = await api<{ id: number }>('/plan', { method: 'POST', json: p });
      setS((x) => ({ ...x, plan: { ...p, id } }));
    },
    updatePlan: async (p) => {
      await api(`/plan/${p.id}`, { method: 'PUT', json: p });
      setS((x) => ({ ...x, plan: p }));
    },
    deletePlan: async () => {
      if (!s.plan) return;
      await api(`/plan/${s.plan.id}`, { method: 'DELETE' });
      setS((x) => ({ ...x, plan: null }));
    },
    addSession: async (date, workout) => {
      const { id } = await api<{ id: number }>('/sessions', { method: 'POST', json: { date, workout } });
      setS((x) => ({ ...x, sessions: [...x.sessions, { id, date, workout }].sort((a, b) => a.date.localeCompare(b.date)) }));
    },
    updateSession: async (cs) => {
      await api(`/sessions/${cs.id}`, { method: 'PUT', json: { date: cs.date, workout: cs.workout } });
      setS((x) => ({ ...x, sessions: x.sessions.map((y) => (y.id === cs.id ? cs : y)).sort((a, b) => a.date.localeCompare(b.date)) }));
    },
    deleteSession: async (id) => {
      await api(`/sessions/${id}`, { method: 'DELETE' });
      setS((x) => ({ ...x, sessions: x.sessions.filter((y) => y.id !== id) }));
    },
    saveFeedback: async (f) => {
      await api(`/feedback/${encodeURIComponent(f.key)}`, { method: 'PUT', json: f });
      setS((x) => ({ ...x, feedback: [...x.feedback.filter((y) => y.key !== f.key), f] }));
    },
    deleteNote: async (id) => {
      await api(`/notes/${id}`, { method: 'DELETE' });
      setS((x) => ({ ...x, notes: x.notes.filter((n) => n.id !== id) }));
    },
    logout: async () => {
      await api('/auth/logout', { method: 'POST' });
      setS({ ...initial, status: 'anonymous', config: s.config });
    },
    deleteAccount: async () => {
      await api('/me', { method: 'DELETE' });
      setS({ ...initial, status: 'anonymous', config: s.config });
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('DataProvider manquant');
  return v;
}

/** Données garanties une fois connecté (pages protégées). */
export function useReady() {
  const d = useData();
  if (d.status !== 'ready' || !d.profile || !d.me) throw new Error('données non prêtes');
  return d as DataApi & { profile: EffectiveProfile; me: Me };
}
