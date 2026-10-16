import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  addDays,
  formatClock,
  formatDuration,
  formatKm,
  formatPace,
  gapPace,
  isRun,
  type ActivitySummary,
} from '@engine';
import { api } from '../lib/api';
import { useReady } from '../lib/data';
import { today as todayIso } from '../lib/profile';
import { formatDate } from '../lib/sessions';

interface Efforts {
  efforts: { id: number; bestEfforts: { name: string; distanceM: number; movingTimeSec: number }[]; gapSpeed?: number }[];
  pending: number;
}

/** Noms des meilleurs efforts Strava retenus comme records de distance. */
const DISTANCES = [
  { name: '1K', l: '1 km' },
  { name: '5K', l: '5 km' },
  { name: '10K', l: '10 km' },
  { name: 'Half-Marathon', l: 'Semi' },
  { name: 'Marathon', l: 'Marathon' },
];

type Filter = 'all' | 'road' | 'trail' | 'other';
const FILTERS: { v: Filter; l: string }[] = [
  { v: 'all', l: 'Tout' },
  { v: 'road', l: 'Route' },
  { v: 'trail', l: 'Trail' },
  { v: 'other', l: 'Autres sports' },
];

const SPORT_LABEL: Record<string, string> = {
  Ride: 'Vélo',
  VirtualRide: 'Home trainer',
  GravelRide: 'Gravel',
  MountainBikeRide: 'VTT',
  Hike: 'Randonnée',
  Walk: 'Marche',
  Swim: 'Natation',
  WeightTraining: 'Musculation',
  Workout: 'Entraînement',
  Handball: 'Handball',
  Soccer: 'Football',
  Basketball: 'Basket',
  Tennis: 'Tennis',
  RockClimbing: 'Escalade',
  BackcountrySki: 'Ski de rando',
  Yoga: 'Yoga',
};

const isTrail = (a: ActivitySummary) => a.sportType === 'TrailRun';
const stravaUrl = (id: number) => `https://www.strava.com/activities/${id}`;
const PAGE = 30;

export function Activities() {
  const { activities, activitiesError, me, refreshActivities, syncedAt } = useReady();
  const [filter, setFilter] = useState<Filter>('all');
  const [shown, setShown] = useState(PAGE);
  const [records, setRecords] = useState<Efforts | null>(null);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const t = todayIso();
  const recent = addDays(t, -6);

  useEffect(() => {
    api<Efforts>('/records')
      .then(setRecords)
      .catch((e: Error) => setRecordsError(e.message));
  }, [syncedAt]);

  const runs = useMemo(() => activities.filter((a) => isRun(a.sportType)), [activities]);
  const sorted = useMemo(() => [...activities].sort((a, b) => b.startDate.localeCompare(a.startDate) || b.id - a.id), [activities]);
  const list = sorted.filter((a) =>
    filter === 'all' ? true : filter === 'trail' ? isTrail(a) : filter === 'road' ? isRun(a.sportType) && !isTrail(a) : !isRun(a.sportType),
  );

  const month = runs.filter((a) => a.startDate > addDays(t, -30));
  const monthKm = month.reduce((s, a) => s + a.distanceM, 0) / 1000;
  const monthSec = month.reduce((s, a) => s + a.movingTimeSec, 0);
  const monthElev = month.reduce((s, a) => s + a.elevationGain, 0);

  // records de distance : meilleur effort Strava de chaque distance, toutes courses confondues
  const byId = new Map(activities.map((a) => [a.id, a]));
  const stravaGap = new Map((records?.efforts ?? []).map((e) => [e.id, e.gapSpeed]));
  /** « VAP 5:47 /km », précédée de ≈ quand elle est estimée depuis le D+ */
  const vap = (a: ActivitySummary) => {
    const g = isRun(a.sportType) ? gapPace(a, stravaGap.get(a.id)) : null;
    return g ? `VAP ${g.estimated ? '≈ ' : ''}${formatPace(g.pace)} /km` : null;
  };
  const anyVap = list.slice(0, shown).some((a) => vap(a));
  const distanceRecords = DISTANCES.map((d) => {
    let best: { sec: number; act: ActivitySummary } | undefined;
    for (const e of records?.efforts ?? []) {
      const act = byId.get(e.id);
      const be = e.bestEfforts.find((x) => x.name === d.name);
      if (act && be && (!best || be.movingTimeSec < best.sec)) best = { sec: be.movingTimeSec, act };
    }
    return { ...d, best, meters: records?.efforts.flatMap((e) => e.bestEfforts).find((x) => x.name === d.name)?.distanceM };
  });

  const max = (f: (a: ActivitySummary) => number, pool = runs) => pool.reduce<ActivitySummary | undefined>((m, a) => (!m || f(a) > f(m) ? a : m), undefined);
  const vam = (a: ActivitySummary) => a.elevationGain / (a.movingTimeSec / 3600);
  const hilly = runs.filter((a) => a.elevationGain / Math.max(1, a.distanceM / 1000) > 30 && a.movingTimeSec >= 1800);
  const longest = max((a) => a.distanceM);
  const longestTime = max((a) => a.movingTimeSec);
  const mostElev = max((a) => a.elevationGain);
  const bestVam = max(vam, hilly);
  const races = runs.filter((a) => a.isRace).sort((a, b) => b.startDate.localeCompare(a.startDate));

  const when = (a: ActivitySummary) => (
    <>
      {formatDate(a.startDate, { day: 'numeric', month: 'short' })}
      {a.startDate >= recent && (
        <>
          {' '}
          <span className="tag key">Cette semaine</span>
        </>
      )}
    </>
  );

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <h1>Sorties</h1>
          <p className="sub">Tes 6 derniers mois d’activités Strava et tes records sur cette période. Visible par toi seul.</p>
        </div>
        {!me.demo && (
          <button className="btn btn-secondary" onClick={() => refreshActivities()}>
            <RefreshCw size={16} aria-hidden /> Synchroniser Strava
          </button>
        )}
      </header>

      {activitiesError && <p className="notice error">Strava : {activitiesError}</p>}

      <div>
        <div className="page-num">
          <span className="hero-num">{Math.round(monthKm)}</span>
          <div className="hero-unit">
            <b>km</b>
            <span>courus ces 30 derniers jours</span>
          </div>
        </div>
        <p className="dataline" style={{ marginTop: 16 }}>
          <b>{month.length}</b> sortie{month.length > 1 ? 's' : ''}, <b>{formatDuration(monthSec)}</b> de course, <b>{Math.round(monthElev).toLocaleString('fr-FR')} m</b> de
          D+.
        </p>
      </div>

      <div className="split">
        <section className="stack">
          <div className="section-title">
            <h2>Dernières sorties</h2>
          </div>
          <div className="seg" role="group" aria-label="Type d’activité">
            {FILTERS.map((f) => (
              <button
                key={f.v}
                type="button"
                aria-pressed={filter === f.v}
                onClick={() => {
                  setFilter(f.v);
                  setShown(PAGE);
                }}
              >
                {f.l}
              </button>
            ))}
          </div>
          {list.length === 0 ? (
            <p className="muted">Aucune activité de ce type sur les 6 derniers mois.</p>
          ) : (
            <ul className="list acts">
              {list.slice(0, shown).map((a) => {
                const run = isRun(a.sportType);
                const meta = [
                  formatClock(a.movingTimeSec),
                  run && a.distanceM > 0 ? `${formatPace(a.movingTimeSec / (a.distanceM / 1000))} /km` : null,
                  vap(a),
                  a.elevationGain >= 20 ? `${Math.round(a.elevationGain)} m D+` : null,
                  a.avgHr ? `${Math.round(a.avgHr)} bpm` : null,
                ].filter(Boolean);
                return (
                  <li key={a.id} className="act" data-off={!run || undefined}>
                    <span className="act-date">{formatDate(a.startDate, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    <span className="act-name">
                      <span className="act-title">{a.name}</span>
                      <span className="row" style={{ gap: 6 }}>
                        {a.isRace && <span className="tag">Course</span>}
                        {isTrail(a) && <span className="tag">Trail</span>}
                        {!run && <span className="tag">{SPORT_LABEL[a.sportType] ?? a.sportType}</span>}
                      </span>
                    </span>
                    <span className="act-km">{a.distanceM > 0 ? formatKm(a.distanceM) : formatDuration(a.movingTimeSec)}</span>
                    <span className="act-meta">
                      {meta.join(', ')}
                      {!me.demo && (
                        <>
                          {' · '}
                          <a href={stravaUrl(a.id)} target="_blank" rel="noreferrer" className="strava-link">
                            Voir sur Strava
                          </a>
                        </>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {anyVap && (
            <p className="small faint">
              VAP : vitesse ajustée à la pente, l’allure que le même effort aurait donnée sur le plat. C’est celle de Strava, calculée sur le relief réel ; précédée
              de ≈, elle est estimée depuis le D+ en attendant le détail de la sortie.
            </p>
          )}
          {list.length > shown && (
            <div className="row">
              <button className="btn btn-secondary" onClick={() => setShown((n) => n + PAGE)}>
                Afficher {Math.min(PAGE, list.length - shown)} de plus
              </button>
              <span className="small faint">
                {shown} sur {list.length}
              </span>
            </div>
          )}
        </section>

        <aside className="stack-lg sticky-aside acts-aside">
          <section className="stack">
            <h2>Records par distance</h2>
            <p className="small muted">Meilleur temps sur chaque distance, mesuré par Strava à l’intérieur de tes sorties (pas seulement en course).</p>
            {records === null && !recordsError ? (
              <div className="skeleton" style={{ height: 240 }} />
            ) : recordsError ? (
              <p className="notice error">Records indisponibles : {recordsError}</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Distance</th>
                    <th className="r">Temps</th>
                    <th className="r">Allure</th>
                    <th className="r">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {distanceRecords.map((r) => (
                    <tr key={r.name}>
                      <td>{r.l}</td>
                      {r.best ? (
                        <>
                          <td className="r n">{formatClock(r.best.sec)}</td>
                          <td className="r tnum">{r.meters ? `${formatPace(r.best.sec / (r.meters / 1000))} /km` : ''}</td>
                          <td className="r small" title={r.best.act.name}>
                            {when(r.best.act)}
                          </td>
                        </>
                      ) : (
                        <td className="r faint" colSpan={3}>
                          pas encore
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {records && records.pending > 0 && (
              <p className="small faint">
                {records.pending} sortie{records.pending > 1 ? 's' : ''} encore à analyser : elles seront prises en compte aux prochaines visites (Strava limite le
                nombre de requêtes).
              </p>
            )}
          </section>

          <section className="stack">
            <h2>Endurance et dénivelé</h2>
            {runs.length === 0 ? (
              <p className="muted small">Aucune course sur les 6 derniers mois.</p>
            ) : (
              <table className="table">
                <tbody>
                  {[
                    { l: 'Plus longue sortie', a: longest, v: (a: ActivitySummary) => formatKm(a.distanceM) },
                    { l: 'Plus longue durée', a: longestTime, v: (a: ActivitySummary) => formatClock(a.movingTimeSec) },
                    { l: 'Plus gros dénivelé', a: mostElev, v: (a: ActivitySummary) => `${Math.round(a.elevationGain).toLocaleString('fr-FR')} m` },
                    { l: 'Meilleure vitesse en montée', a: bestVam, v: (a: ActivitySummary) => `${Math.round(vam(a)).toLocaleString('fr-FR')} m D+/h` },
                  ]
                    .filter((r) => r.a && (r.l !== 'Plus gros dénivelé' || r.a.elevationGain > 0))
                    .map((r) => (
                      <tr key={r.l}>
                        <td>
                          {r.l}
                          <span className="small faint" style={{ display: 'block' }}>
                            {r.a!.name}
                          </span>
                        </td>
                        <td className="r n">{r.v(r.a!)}</td>
                        <td className="r small">{when(r.a!)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
            {bestVam && <p className="small faint">Vitesse en montée : D+ par heure de course, sur les sorties de plus de 30 min avec plus de 30 m de D+ par km.</p>}
          </section>

          {races.length > 0 && (
            <section className="stack">
              <h2>Courses</h2>
              <table className="table">
                <tbody>
                  {races.map((a) => (
                    <tr key={a.id}>
                      <td>
                        {a.name}
                        <span className="small faint" style={{ display: 'block' }}>
                          {formatKm(a.distanceM)}
                          {a.elevationGain >= 50 ? `, ${Math.round(a.elevationGain)} m D+` : ''}
                          {vap(a) ? `, ${vap(a)}` : ''}
                        </span>
                      </td>
                      <td className="r n">{formatClock(a.movingTimeSec)}</td>
                      <td className="r small">{when(a)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
