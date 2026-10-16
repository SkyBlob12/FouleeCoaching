import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { easyRun, estimateWorkout, formatDuration, formatKm, formatPace, gapPace, type Workout } from '@engine';
import { useReady } from '../lib/data';
import { today } from '../lib/profile';
import { allSessions, formatDate, runsOn } from '../lib/sessions';
import { isKeyWorkout, moveSession, removeSessions, replaceSession } from '../lib/planEdit';
import { SessionView } from '../components/SessionView';
import { FeedbackForm } from '../components/FeedbackForm';
import { ReplaceSession } from '../components/ReplaceSession';

export function SessionPage() {
  const { key } = useParams();
  const navigate = useNavigate();
  const { plan, sessions: custom, profile, activities, updatePlan, updateSession, deleteSession } = useReady();
  const s = allSessions(plan, custom).find((x) => x.key === key);
  const [moveTo, setMoveTo] = useState(s?.date ?? today());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!s) {
    return (
      <div className="panel empty">
        <h2>Séance introuvable</h2>
        <p className="muted">Elle a peut-être été supprimée ou ton plan a été regénéré.</p>
        <Link className="btn btn-secondary" to="/plan" style={{ marginTop: 12 }}>
          Voir le plan
        </Link>
      </div>
    );
  }

  const runs = runsOn(activities, s.date);

  // séance du plan : on réécrit le plan ; séance sur mesure : on met à jour sa ligne
  const inPlan = s.source === 'plan' && plan;
  const sport = plan?.goal.sport ?? profile.sport;

  const run = async (fn: () => Promise<void>, done?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      if (done) setMsg(done);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const move = () =>
    run(
      () => (inPlan ? updatePlan(moveSession(plan, s.planSessionId!, moveTo)) : updateSession({ id: s.customId!, date: moveTo, workout: s.workout })),
      `Déplacée au ${formatDate(moveTo, { weekday: 'long', day: 'numeric', month: 'long' })}.`,
    );

  const replace = (workout: Workout, done = `Remplacée par : ${workout.title}.`) =>
    run(
      () =>
        inPlan
          ? updatePlan(replaceSession(plan, s.planSessionId!, workout, isKeyWorkout(workout)))
          : updateSession({ id: s.customId!, date: s.date, workout }),
      done,
    );

  const soften = () => {
    const km = estimateWorkout(s.workout, profile.vdot).distanceM / 1000;
    const category = plan?.category ?? (sport === 'trail' ? 'trail_medium' : '10k');
    const easy = easyRun({ vdot: profile.vdot, sport, category, phase: 'base', progress: 0, weekKm: 50, elevationRatio: 0 }, Math.max(5, km * 0.7));
    return replace(easy, 'Remplacée par un footing facile.');
  };

  const remove = () =>
    run(async () => {
      if (inPlan) await updatePlan(removeSessions(plan, [s.planSessionId!]));
      else await deleteSession(s.customId!);
      navigate('/plan');
    });

  return (
    <div className="stack-lg">
      <div>
        <button className="btn btn-ghost back" onClick={() => navigate(-1)}>
          <ChevronLeft size={16} aria-hidden /> Retour
        </button>
        <p className="muted capitalize" style={{ marginTop: 6 }}>
          {formatDate(s.date)}
        </p>
      </div>

      <div className="split">
        <div>
          <SessionView workout={s.workout} profile={profile} headingLevel={1} />
        </div>

        <aside className="stack side">
          {s.date <= today() && (
            <section className="panel">
              <FeedbackForm key={s.key} session={s} />
            </section>
          )}
          {runs.length > 0 && s.workout.type !== 'strength' && s.workout.type !== 'cross' && (
            <section className="panel">
              <h3>Réalisé</h3>
              <ul className="list done-list">
                {runs.map((a) => (
                  <li key={a.id}>
                    <span>{a.name}</span>
                    <span className="num muted">
                      {formatKm(a.distanceM)} en {formatDuration(a.movingTimeSec)}
                      {gapPace(a) ? `, VAP ≈ ${formatPace(gapPace(a)!.pace)} /km` : ''}
                      {a.avgHr ? `, ${Math.round(a.avgHr)} bpm` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(s.source === 'custom' || inPlan) && (
            <section className="panel stack">
              <h3>Modifier</h3>
              <label className="field">
                <span>Déplacer au</span>
                <div className="row">
                  <input type="date" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
                  <button className="btn btn-secondary" disabled={busy || !moveTo || moveTo === s.date} onClick={move}>
                    Déplacer
                  </button>
                </div>
              </label>
              {!['easy', 'race', 'strength', 'cross', 'recovery', 'shakeout'].includes(s.workout.type) && (
                <button className="btn btn-secondary" disabled={busy} onClick={soften}>
                  Trop fatigué : remplacer par un footing
                </button>
              )}
              {s.workout.type !== 'race' && s.workout.type !== 'cross' && <ReplaceSession sport={sport} busy={busy} onReplace={(w) => replace(w)} />}
              <div className="row">
                {confirmDelete ? (
                  <>
                    <span className="muted">{inPlan ? 'Retirer cette séance du plan ?' : 'Supprimer cette séance ?'}</span>
                    <button className="btn btn-danger" disabled={busy} onClick={remove}>
                      Oui, {inPlan ? 'retirer' : 'supprimer'}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
                      Annuler
                    </button>
                  </>
                ) : (
                  <button className="btn btn-ghost" disabled={busy} onClick={() => setConfirmDelete(true)}>
                    <Trash2 size={16} aria-hidden /> {inPlan ? 'Retirer du plan' : 'Supprimer cette séance'}
                  </button>
                )}
              </div>
              {msg && (
                <p className="small muted" role="status">
                  {msg}
                </p>
              )}
            </section>
          )}

          {s.workout.type !== 'strength' && s.workout.type !== 'cross' && (
          <section className="panel small muted">
            Pour l’envoyer sur ta montre : copie la séance, colle-la dans le constructeur de séances d’intervals.icu, puis synchronise avec Garmin Connect,
            Coros ou Suunto.
          </section>
          )}
        </aside>
      </div>
    </div>
  );
}
