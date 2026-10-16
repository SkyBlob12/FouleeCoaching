import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { CalendarPlus, MessageSquare, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  addDays,
  CATEGORY_LABEL,
  estimateWorkout,
  formatClock,
  formatDuration,
  kmEffort,
  mondayOf,
  PHASE_LABEL,
  planToIcs,
  predictTimeLong,
  runKm,
} from '@engine';
import { useReady, type CustomSession, type StoredPlan } from '../lib/data';
import { removeSessions } from '../lib/planEdit';
import { today } from '../lib/profile';
import { allSessions, formatDate, statusOf, TYPE_COLOR, type AnySession, type SessionStatus } from '../lib/sessions';
import { PlanProfile } from '../components/Charts';
import { AiAnalysis, WeekReviewPanel } from '../components/Ai';
import { PlanChat } from '../components/PlanChat';

interface RowProps {
  s: AnySession;
  status: SessionStatus;
  vdot: number;
  /** mode modification : bouton de retrait (absent pour les séances passées) */
  editing?: boolean;
  onRemove?: () => void;
}

function SessionRow({ s, status, vdot, editing, onRemove }: RowProps) {
  const off = s.workout.type === 'strength' || s.workout.type === 'cross';
  const open = status !== 'done' && status !== 'missed';
  return (
    <li className="wsession-item">
      <Link to={`/seance/${s.key}`} className="wsession" data-off={off || undefined}>
        <span className="wsession-day">{formatDate(s.date, { weekday: 'short', day: 'numeric' })}</span>
        <span className="wsession-title">
          <i className="zone-dot" style={{ background: TYPE_COLOR[s.workout.type] }} aria-hidden />
          {s.workout.title}
        </span>
        <span className="wsession-dur">{formatDuration(estimateWorkout(s.workout, vdot).durationSec)}</span>
        <span className="wsession-status">
          {status === 'done' && <span className="tag done">Fait</span>}
          {status === 'missed' && <span className="tag missed">Manqué</span>}
          {open &&
            (s.workout.type === 'strength' ? (
              <span className="tag">Renfo</span>
            ) : s.source === 'custom' ? (
              <span className="tag">Sur mesure</span>
            ) : s.important ? (
              <span className="tag key">Clé</span>
            ) : null)}
        </span>
      </Link>
      {editing &&
        (onRemove ? (
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={onRemove}
            aria-label={`Retirer « ${s.workout.title} » du ${formatDate(s.date, { weekday: 'long', day: 'numeric', month: 'long' })}`}
            title="Retirer"
          >
            <Trash2 size={16} aria-hidden />
          </button>
        ) : (
          <span className="btn-icon" aria-hidden />
        ))}
    </li>
  );
}

export function PlanPage() {
  const { plan, profile, activities, deletePlan, updatePlan, addSession, deleteSession, sessions: custom, feedback, aiStatus } = useReady();
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<{ label: string; plan: StoredPlan; customs: CustomSession[] } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const chatOpen = aiStatus.enabled && location.hash === '#coach';
  const closeChat = useCallback(() => navigate({ hash: '' }, { replace: true }), [navigate]);
  const t = today();
  const current = plan ? Math.max(0, plan.weeks.findIndex((w) => w.startDate === mondayOf(t))) : 0;
  const all = useMemo(() => allSessions(plan, custom), [plan, custom]);

  if (!plan) {
    // séances hors plan (ajoutées à la main ou par le coach via le connecteur), groupées par semaine
    const upcoming = all.filter((s) => s.date >= mondayOf(t));
    const weeks = [...new Set(upcoming.map((s) => mondayOf(s.date)))].map((monday) => ({
      monday,
      sessions: upcoming.filter((s) => mondayOf(s.date) === monday),
    }));
    return (
      <div className="stack-lg">
        <header className="page-head">
          <h1>Plan</h1>
          {aiStatus.enabled && weeks.length > 0 && (
            <div className="row">
              <button className="btn btn-primary" onClick={() => navigate({ hash: 'coach' }, { replace: true })} aria-expanded={chatOpen}>
                <MessageSquare size={16} aria-hidden /> Modifier avec le coach
              </button>
            </div>
          )}
        </header>
        {weeks.length > 0 && (
          <section className="stack">
            <h2>Séances prévues</h2>
            <div className="weeks">
              {weeks.map((w, i) => {
                const runSec = w.sessions
                  .filter((s) => s.workout.type !== 'strength' && s.workout.type !== 'cross')
                  .reduce((sum, s) => sum + estimateWorkout(s.workout, profile.vdot).durationSec, 0);
                return (
                  <details key={w.monday} className="week" open data-current={w.monday === mondayOf(t) || undefined}>
                    <summary>
                      <span className="week-n">S{i + 1}</span>
                      <span className="week-dates">
                        {formatDate(w.monday, { day: 'numeric', month: 'short' })} au {formatDate(addDays(w.monday, 6), { day: 'numeric', month: 'short' })}
                      </span>
                      <span />
                      <span className="week-vol">{runSec ? formatDuration(runSec) : ''}</span>
                    </summary>
                    <ul className="list week-sessions">
                      {w.sessions.map((s) => (
                        <SessionRow key={s.key} s={s} status={statusOf(s, activities, t, feedback)} vdot={profile.vdot} />
                      ))}
                    </ul>
                  </details>
                );
              })}
            </div>
          </section>
        )}
        <div className="box empty">
          <h2>Pas encore de plan</h2>
          <p className="muted">
            Donne ta course cible et tes jours disponibles. L’algorithme construit les phases, la progression du volume et chaque séance à tes allures, puis le
            coach IA l’ajuste d’après tes activités, sauf si tu l’as désactivé.
          </p>
          <div className="row" style={{ marginTop: 16 }}>
            <Link className="btn btn-primary" to="/plan/nouveau">
              Créer un plan
            </Link>
          </div>
        </div>
        {chatOpen && <PlanChat onClose={closeChat} />}
      </div>
    );
  }

  const g = plan.goal;
  const predicted = predictTimeLong(profile.vdot, kmEffort(g.distanceKm, g.elevationGain) * 1000) * (g.sport === 'trail' ? 1.08 : 1);
  const peak = Math.max(...plan.weeks.map(runKm));

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    setEditError(null);
    try {
      await fn();
    } catch (e) {
      setEditError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // retrait en un geste ; la dernière série retirée peut être remise (instantané du plan + séances sur mesure)
  const removeMany = (list: AnySession[], label: string) =>
    guard(async () => {
      const ids = list.filter((x) => x.source === 'plan').map((x) => x.planSessionId!);
      const customs = custom.filter((c) => list.some((x) => x.customId === c.id));
      if (ids.length) await updatePlan(removeSessions(plan, ids));
      for (const c of customs) await deleteSession(c.id);
      setUndo({ label, plan, customs });
    });

  const restore = () =>
    guard(async () => {
      if (!undo) return;
      await updatePlan(undo.plan);
      for (const c of undo.customs) await addSession(c.date, c.workout);
      setUndo(null);
    });

  const downloadIcs = () => {
    const ics = planToIcs(plan, custom);
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `foulee-${g.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <h1>{g.name}</h1>
          <p className="sub">
            {CATEGORY_LABEL[plan.category]}, {g.distanceKm.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km
            {g.elevationGain ? ` et ${g.elevationGain} m D+` : ''}, le {formatDate(g.date, { day: 'numeric', month: 'long', year: 'numeric' })}.
          </p>
        </div>
        <div className="row">
          {aiStatus.enabled && (
            <button className="btn btn-primary" onClick={() => navigate({ hash: 'coach' }, { replace: true })} aria-expanded={chatOpen}>
              <MessageSquare size={16} aria-hidden /> Modifier avec le coach
            </button>
          )}
          <Link className="btn btn-secondary" to="/plan/modifier">
            <Pencil size={16} aria-hidden /> Modifier le plan
          </Link>
          <button className="btn btn-secondary" onClick={downloadIcs}>
            <CalendarPlus size={16} aria-hidden /> Exporter vers l’agenda
          </button>
          <Link className="btn btn-ghost" to="/plan/nouveau">
            <Plus size={16} aria-hidden /> Nouveau plan
          </Link>
        </div>
      </header>

      <div className="page-num">
        <span className="hero-num">{formatClock(predicted)}</span>
        <div className="hero-unit">
          <span>temps prédit à ton niveau actuel</span>
        </div>
      </div>

      <p className="dataline">
        Semaine <b>{Math.min(plan.weeks.length, current + 1)}</b> sur {plan.weeks.length}, semaine la plus chargée à <b>{peak} km</b>
        {g.targetTimeSec ? (
          <>
            , objectif <b>{formatClock(g.targetTimeSec)}</b>
          </>
        ) : null}
        .
      </p>

      <PlanProfile
        weeks={plan.weeks}
        current={current}
        trail={g.sport === 'trail'}
        onSelect={(i) => {
          const el = document.getElementById(`semaine-${i}`) as HTMLDetailsElement | null;
          if (el) {
            el.open = true;
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }}
      />

      <div className="split">
        <div className="stack">
          <div className="section-title">
            <h2>Semaines</h2>
            <button
              className={editing ? 'btn btn-primary' : 'btn btn-ghost'}
              aria-pressed={editing}
              onClick={() => {
                setEditing((x) => !x);
                setUndo(null);
                setEditError(null);
              }}
            >
              {editing ? (
                'Terminé'
              ) : (
                <>
                  <Pencil size={16} aria-hidden /> Modifier les séances
                </>
              )}
            </button>
          </div>
          {editing && (
            <p className="small muted">
              Retire une séance avec la corbeille, vide une semaine (vacances, blessure) ou ajoute une séance. Pour déplacer ou remplacer une séance, ouvre-la.
            </p>
          )}
          {undo && (
            <p className="notice row undo" role="status">
              <span>{undo.label}</span>
              <button className="btn btn-ghost" disabled={busy} onClick={restore}>
                Annuler
              </button>
            </p>
          )}
          {editError && <p className="notice error">{editError}</p>}
          <div className="weeks">
            {plan.weeks.map((w, i) => {
              const end = addDays(w.startDate, 6);
              const weekSessions = all.filter((s) => s.date >= w.startDate && s.date <= end);
              const upcoming = weekSessions.filter((s) => s.date >= t);
              return (
                <details key={w.index} id={`semaine-${i}`} className="week" open={i === current || i === current + 1} data-past={end < t || undefined} data-current={i === current || undefined}>
                  <summary>
                    <span className="week-n">S{w.index + 1}</span>
                    <span className="week-dates">
                      {formatDate(w.startDate, { day: 'numeric', month: 'short' })} au {formatDate(end, { day: 'numeric', month: 'short' })}
                    </span>
                    <span className="row" style={{ gap: 6 }}>
                      <span className="tag">{PHASE_LABEL[w.phase]}</span>
                      {w.recovery && <span className="tag">Allégée</span>}
                    </span>
                    <span className="week-vol">
                      {runKm(w)} km{w.elevationGain ? `, ${w.elevationGain} m D+` : ''}
                    </span>
                  </summary>
                  <ul className="list week-sessions">
                    {weekSessions.map((s) => (
                      <SessionRow
                        key={s.key}
                        s={s}
                        status={statusOf(s, activities, t, feedback)}
                        vdot={profile.vdot}
                        editing={editing}
                        onRemove={
                          s.date >= t && !busy
                            ? () => removeMany([s], `${s.workout.title} du ${formatDate(s.date, { weekday: 'long', day: 'numeric' })} retirée.`)
                            : undefined
                        }
                      />
                    ))}
                  </ul>
                  {editing && end >= t && (
                    <div className="row week-edit">
                      <Link className="btn btn-ghost" to="/sur-mesure" state={{ date: w.startDate < t ? t : w.startDate, back: '/plan' }}>
                        <Plus size={16} aria-hidden /> Ajouter une séance
                      </Link>
                      {upcoming.length > 0 && (
                        <button
                          className="btn btn-ghost"
                          disabled={busy}
                          onClick={() =>
                            removeMany(upcoming, `Semaine ${w.index + 1} : ${upcoming.length} séance${upcoming.length > 1 ? 's retirées' : ' retirée'}.`)
                          }
                        >
                          <Trash2 size={16} aria-hidden /> {w.startDate >= t ? 'Vider la semaine' : 'Retirer les séances à venir'}
                        </button>
                      )}
                    </div>
                  )}
                </details>
              );
            })}
          </div>
        </div>

        <aside className="stack" style={{ gap: 24 }}>
          <WeekReviewPanel />
          {plan.ai && <AiAnalysis ai={plan.ai} title="Analyse du coach à la création" />}
          {plan.reviews && plan.reviews.length > 1 && (
            <section className="box">
              <h3>Bilans précédents</h3>
              <ul className="list">
                {[...plan.reviews]
                  .sort((a, b) => b.week - a.week)
                  .slice(1)
                  .map((r) => (
                    <li key={r.week} style={{ padding: '10px 0' }}>
                      <b>Semaine {r.week + 1}.</b> <span className="muted">{r.summary}</span>
                    </li>
                  ))}
              </ul>
            </section>
          )}
          {plan.notes.map((n) => (
            <p key={n} className="notice">
              {n}
            </p>
          ))}
          <div className="row">
            {confirm ? (
              <>
                <span className="muted">Supprimer définitivement ce plan ?</span>
                <button className="btn btn-danger" onClick={() => deletePlan()}>
                  Oui, supprimer
                </button>
                <button className="btn btn-ghost" onClick={() => setConfirm(false)}>
                  Annuler
                </button>
              </>
            ) : (
              <button className="btn btn-ghost" onClick={() => setConfirm(true)}>
                <Trash2 size={16} aria-hidden /> Supprimer le plan
              </button>
            )}
          </div>
        </aside>
      </div>
      {chatOpen && <PlanChat onClose={closeChat} />}
    </div>
  );
}
