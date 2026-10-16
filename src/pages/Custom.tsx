import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { customSession, type CustomKind, type Sport } from '@engine';
import { useReady } from '../lib/data';
import { today } from '../lib/profile';
import { CUSTOM_KINDS as KINDS, CUSTOM_LEVELS as LEVELS, formatDate } from '../lib/sessions';
import { SessionView } from '../components/SessionView';

export function Custom() {
  const { profile, plan, sessions, addSession, saved } = useReady();
  const navigate = useNavigate();
  // depuis le plan (mode modification) : date de la semaine choisie et retour au plan
  const from = (useLocation().state ?? {}) as { date?: string; back?: string };
  const [kind, setKind] = useState<CustomKind>('threshold');
  const [sport, setSport] = useState<Sport>(profile.sport);
  const [level, setLevel] = useState(0.5);
  const [km, setKm] = useState('10');
  const [date, setDate] = useState(from.date ?? today());
  const [busy, setBusy] = useState(false);

  const meta = KINDS.find((k) => k.kind === kind)!;
  const workout = useMemo(
    () =>
      customSession(kind, { vdot: profile.vdot, sport, category: plan?.category, level, km: Number(km) || 10, athleteLevel: profile.level, fragile: saved?.fragile }),
    [kind, sport, level, km, profile.vdot, plan?.category, profile.level, saved?.fragile],
  );
  const upcoming = sessions.filter((s) => s.date >= today());

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <h1>Séance sur mesure</h1>
          <p className="sub">Une séance isolée, calée sur tes allures, à ajouter quand tu veux.</p>
        </div>
      </header>

      <div className="split">
        <div className="stack">
          <div className="kinds" role="radiogroup" aria-label="Type de séance">
            {KINDS.map((k) => (
              <button key={k.kind} type="button" role="radio" aria-checked={kind === k.kind} className="kind" onClick={() => setKind(k.kind)}>
                <span className="kind-label">{k.label}</span>
                <span className="kind-hint">{k.hint}</span>
              </button>
            ))}
          </div>

          <div className="grid-2">
            <div className="field">
              <span>Terrain</span>
              <div className="seg" role="group" aria-label="Terrain">
                {(['road', 'trail'] as const).map((s) => (
                  <button key={s} type="button" aria-pressed={sport === s} onClick={() => setSport(s)}>
                    {s === 'road' ? 'Route' : 'Trail'}
                  </button>
                ))}
              </div>
            </div>
            {meta.distance ? (
              <label className="field">
                <span>Distance (km)</span>
                <input type="number" min={3} max={60} inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} />
              </label>
            ) : (
              <div className="field">
                <span>Difficulté</span>
                <div className="seg" role="group" aria-label="Difficulté">
                  {LEVELS.map((l) => (
                    <button key={l.v} type="button" aria-pressed={level === l.v} onClick={() => setLevel(l.v)}>
                      {l.l}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <label className="field">
              <span>Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>

          <div style={{ marginTop: 24 }}>
            <SessionView workout={workout} profile={profile}>
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await addSession(date, workout);
                  navigate(from.back ?? '/');
                }}
              >
                Ajouter le {formatDate(date, { day: 'numeric', month: 'long' })}
              </button>
            </SessionView>
          </div>
        </div>

        <aside className="stack side">
          <section className="stat">
            <h3>Tes séances à venir</h3>
            {upcoming.length ? (
              <ul className="list done-list">
                {upcoming.map((s) => (
                  <li key={s.id}>
                    <Link to={`/seance/c-${s.id}`}>{s.workout.title}</Link>
                    <span className="muted small">{formatDate(s.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small" style={{ marginTop: 6 }}>
                Aucune pour l’instant. Celles que tu ajoutes ici s’affichent aussi dans « Aujourd’hui ».
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
