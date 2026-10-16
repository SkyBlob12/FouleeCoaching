import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight, MessageSquare, X } from 'lucide-react';
import {
  addDays,
  daysBetween,
  estimateWorkout,
  formatDuration,
  formatKm,
  mondayOf,
  PHASE_LABEL,
  runKm,
  targetFor,
  type Workout,
} from '@engine';
import { useReady } from '../lib/data';
import { computeFitness, today as todayIso } from '../lib/profile';
import { allSessions, formatDate, runsOn, TYPE_COLOR, type AnySession } from '../lib/sessions';
import { FORM_TEXT, readForm } from '../lib/form';
import { WorkoutProfile } from '../components/WorkoutProfile';
import { StepList } from '../components/StepList';
import { ExerciseList } from '../components/ExerciseList';
import { WeekStrip } from '../components/WeekStrip';
import { FeedbackForm } from '../components/FeedbackForm';
import { AiAnalysis, WeekReviewPanel } from '../components/Ai';
import { TrendCurve } from '../components/Charts';

/** Durée en « 42 » + « min », ou « 1:20 » + « h ». */
function heroDuration(sec: number) {
  const m = Math.round(sec / 60);
  if (m < 100) return { num: String(m), unit: 'min' };
  return { num: `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`, unit: 'h' };
}

function hardSeconds(w: Workout) {
  let s = 0;
  for (const b of w.blocks)
    for (const st of b.steps) if (st.kind === 'work' && ['threshold', 'interval', 'repetition', 'hill', '10k', '5k'].includes(st.intensity)) s += (st.durationSec ?? 0) * b.repeat;
  return s;
}

export function Today() {
  const { plan, sessions: custom, activities, profile, activitiesError, feedback, aiStatus, notes, deleteNote } = useReady();
  const today = todayIso();
  const [selected, setSelected] = useState(today);
  const weekStart = mondayOf(selected);
  const sessions = useMemo(() => allSessions(plan, custom), [plan, custom]);
  const fitness = useMemo(() => computeFitness(activities, profile, 56), [activities, profile]);
  const form = readForm(fitness.at(-1));

  const day = sessions.filter((s) => s.date === selected);
  const main: AnySession | undefined = day.find((s) => s.workout.type !== 'strength' && s.workout.type !== 'cross') ?? day[0];
  const others = day.filter((s) => s !== main);
  const next = sessions.find((s) => s.date > selected);
  const week = plan?.weeks.find((w) => w.startDate === weekStart);
  const doneRuns = runsOn(activities, selected);
  const inWeek = (d: string) => d >= weekStart && d <= addDays(weekStart, 6);
  const weekRunKm = activities.filter((a) => inWeek(a.startDate) && runsOn([a], a.startDate).length).reduce((t, a) => t + a.distanceM, 0) / 1000;
  const raceIn = plan ? daysBetween(today, plan.goal.date) : undefined;
  const est = main ? estimateWorkout(main.workout, profile.vdot) : undefined;
  const hero = est ? heroDuration(est.durationSec) : undefined;
  const isRun = !!main && main.workout.type !== 'strength' && main.workout.type !== 'cross';
  const hard = main && isRun ? hardSeconds(main.workout) : 0;
  const easyHr = targetFor('easy', profile).hr;

  const context = [
    formatDate(selected),
    week && plan ? `semaine ${week.index + 1} sur ${plan.weeks.length}, ${PHASE_LABEL[week.phase].toLowerCase()}${week.recovery ? ' (allégée)' : ''}` : null,
    plan && raceIn !== undefined && raceIn > 0 ? `${plan.goal.name} dans ${raceIn} jours` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="today-grid">
      <section className="t-main">
        <p className="hero-date capitalize">{context}.</p>
        {activitiesError && (
          <p className="notice error" style={{ marginTop: 12 }}>
            Strava : {activitiesError}
          </p>
        )}

        {main && hero && est ? (
          <>
            <div className="hero">
              <span className="hero-num" style={isRun ? { color: TYPE_COLOR[main.workout.type] } : undefined}>
                {hero.num}
              </span>
              <div className="hero-unit">
                <b>{hero.unit}</b>
                <span>{main.workout.title}</span>
              </div>
            </div>
            <p className="hero-purpose">{main.workout.purpose}</p>

            {isRun && (
              <div style={{ marginTop: 24 }}>
                <WorkoutProfile workout={main.workout} vdot={profile.vdot} height={96} compact />
              </div>
            )}

            {main.important ? (
            <div className="facts plane" style={{ marginTop: 16 }}>
              {est.distanceM > 0 && (
                <div className="fact">
                  <span className="v">{formatKm(est.distanceM)}</span>
                  <span className="l">Distance</span>
                </div>
              )}
              {main.workout.elevationGain ? (
                <div className="fact">
                  <span className="v">{main.workout.elevationGain} m</span>
                  <span className="l">D+ visé</span>
                </div>
              ) : null}
              <div className="fact">
                <span className="v">{Math.round(est.load)}</span>
                <span className="l">Charge</span>
              </div>
              {isRun &&
                (hard > 0 ? (
                  <div className="fact">
                    <span className="v">{formatDuration(hard)}</span>
                    <span className="l">Temps en zone haute</span>
                  </div>
                ) : easyHr ? (
                  <div className="fact">
                    <span className="v">
                      {easyHr[0]}–{easyHr[1]}
                    </span>
                    <span className="l">FC cible (bpm)</span>
                  </div>
                ) : null)}
            </div>
            ) : (
              <p className="dataline" style={{ marginTop: 16 }}>
                {[
                  est.distanceM > 0 ? `${formatKm(est.distanceM)}` : null,
                  main.workout.elevationGain ? `${main.workout.elevationGain} m de D+` : null,
                  `charge ${Math.round(est.load)}`,
                  isRun && easyHr && !hard ? `FC cible ${easyHr[0]}–${easyHr[1]} bpm` : null,
                ]
                  .filter(Boolean)
                  .join(', ')}
                .
              </p>
            )}

            {isRun && <StepList workout={main.workout} profile={profile} />}
            {main.workout.type === 'strength' && main.workout.exercises && <ExerciseList exercises={main.workout.exercises} />}

            <div className="row" style={{ marginTop: 12 }}>
              <Link className="btn btn-secondary" to={`/seance/${main.key}`}>
                Ouvrir la séance
              </Link>
            </div>

            {main.date <= today && (
              <div className="box" style={{ marginTop: 24 }}>
                <FeedbackForm key={main.key} session={main} />
              </div>
            )}

            {others.map((s) => (
              <Link key={s.key} to={`/seance/${s.key}`} className="box row" style={{ marginTop: 16, justifyContent: 'space-between', textDecoration: 'none' }}>
                <span>
                  <b>Aussi ce jour-là : </b>
                  {s.workout.title}
                </span>
                <span className="num" style={{ fontSize: 20, fontWeight: 700 }}>
                  {formatDuration(estimateWorkout(s.workout, profile.vdot).durationSec)}
                </span>
              </Link>
            ))}
          </>
        ) : (
          <>
            <div className="hero-rest">{sessions.length ? 'Repos' : 'Rien de prévu'}</div>
            <p className="hero-purpose">
              {next ? (
                <>
                  Prochaine séance {formatDate(next.date, { weekday: 'long', day: 'numeric' })} : <Link to={`/seance/${next.key}`}>{next.workout.title}</Link>.
                </>
              ) : (
                'Crée un plan vers ta prochaine course, ou ajoute une séance isolée.'
              )}
            </p>
            {!plan && (
              <div className="row" style={{ marginTop: 16 }}>
                <Link className="btn btn-primary" to="/plan/nouveau">
                  Créer un plan
                </Link>
                <Link className="btn btn-secondary" to="/sur-mesure">
                  Séance sur mesure
                </Link>
              </div>
            )}
          </>
        )}

        {doneRuns.length > 0 && (
          <div className="box" style={{ marginTop: 24 }}>
            <h3>Couru ce jour-là</h3>
            <ul className="list done-list">
              {doneRuns.map((a) => (
                <li key={a.id}>
                  <span>{a.name}</span>
                  <span className="num" style={{ fontSize: 20, fontWeight: 700 }}>
                    {formatKm(a.distanceM)}, {formatDuration(a.movingTimeSec)}
                    {a.elevationGain > 50 ? `, ${Math.round(a.elevationGain)} m D+` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <aside className="stack sticky-aside t-side" style={{ gap: 24 }}>
        <div>
          <div className="week-nav">
            <div>
              <h2>{week ? `Semaine ${week.index + 1}` : `Semaine du ${formatDate(weekStart, { day: 'numeric', month: 'long' })}`}</h2>
              <p className="muted" style={{ marginTop: 4 }}>
                {week ? `${runKm(week)} km${week.elevationGain ? ` et ${week.elevationGain} m D+` : ''} prévus, ` : ''}
                {weekRunKm.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km courus.
              </p>
            </div>
            <div className="row" style={{ gap: 0 }}>
              {mondayOf(today) !== weekStart && (
                <button className="btn btn-ghost" onClick={() => setSelected(today)}>
                  Aujourd’hui
                </button>
              )}
              <button className="btn btn-ghost icon" onClick={() => setSelected(addDays(weekStart, -7))} aria-label="Semaine précédente">
                <ChevronLeft size={20} />
              </button>
              <button className="btn btn-ghost icon" onClick={() => setSelected(addDays(weekStart, 7))} aria-label="Semaine suivante">
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
          <WeekStrip weekStart={weekStart} sessions={sessions} activities={activities} today={today} vdot={profile.vdot} selected={selected} onSelect={setSelected} feedback={feedback} />
        </div>

        <div className="grid-2" style={{ gap: 24 }}>
          {form && (
            <Link to="/forme" className="stat">
              <span className="small faint">Forme sur 42 jours</span>
              <div className="metric-big">{Math.round(fitness.at(-1)!.ctl)}</div>
              <p className="small muted" style={{ margin: '6px 0 8px' }}>
                {FORM_TEXT[form.state].title}, fraîcheur {Math.round(fitness.at(-1)!.tsb)}.
              </p>
              <TrendCurve values={fitness.map((p) => p.ctl)} label="Évolution de la forme sur 8 semaines" />
            </Link>
          )}
          <Link to="/forme" className="stat">
            <span className="small faint">VMA</span>
            <div className="metric-big">{profile.vma.toLocaleString('fr-FR', { minimumFractionDigits: 1 })}</div>
            <p className="small muted" style={{ marginTop: 6 }}>
              km/h, VO2 max {profile.vdot.toLocaleString('fr-FR')}.
            </p>
          </Link>
        </div>
        {form?.rampWarning && (
          <p className="notice">
            Ta charge des 7 derniers jours monte vite (ratio {form.ratio!.toFixed(1).replace('.', ',')}). Au-delà de 1,5, le risque de blessure augmente.
          </p>
        )}

      </aside>

      <div className="stack t-coach" style={{ gap: 24 }}>
        {notes.slice(0, 3).map((n) => (
          <section key={n.id} className="box">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h3>Note du coach</h3>
              <span className="small faint">{formatDate(new Date(n.created_at * 1000).toISOString().slice(0, 10), { day: 'numeric', month: 'long' })}</span>
            </div>
            <p style={{ marginTop: 8, whiteSpace: 'pre-line' }}>{n.text}</p>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn btn-ghost" onClick={() => deleteNote(n.id)}>
                <X size={16} aria-hidden /> Masquer
              </button>
            </div>
          </section>
        ))}
        {(plan || custom.length > 0) && aiStatus.enabled && (
          <div className="row">
            <Link className="btn btn-secondary" to="/plan#coach">
              <MessageSquare size={16} aria-hidden /> Un imprévu ? Modifie ton plan avec le coach
            </Link>
          </div>
        )}
        <WeekReviewPanel />
        {plan?.ai && !plan.reviews?.length && <AiAnalysis ai={plan.ai} />}
      </div>
    </div>
  );
}
