import { useMemo } from 'react';
import { Link } from 'react-router';
import { RefreshCw } from 'lucide-react';
import {
  addDays,
  analyzeActivities,
  formatClock,
  formatPace,
  formatPaceRange,
  hrZones,
  paceFor,
  pctVma,
  predictTime,
  resolveHr,
  trainingPaces,
  vmaFromVdot,
  type Intensity,
  type ProgressPoint,
  type Vo2Sample,
} from '@engine';
import { useReady } from '../lib/data';
import { computeFitness, progressionFrom, today, vdotSourceLabel, type EffectiveProfile } from '../lib/profile';
import { FORM_TEXT, readForm } from '../lib/form';
import { formatDate } from '../lib/sessions';
import { FitnessChart, ProgressChart, VolumeBars } from '../components/Charts';

const PACE_ROWS: { i: Intensity; label: string; use: string }[] = [
  { i: 'easy', label: 'Endurance (E)', use: 'Footings, sorties longues' },
  { i: 'marathon', label: 'Marathon (M)', use: 'Blocs spécifiques marathon' },
  { i: 'threshold', label: 'Seuil (T)', use: 'Fractionné long, tempo' },
  { i: 'interval', label: 'VMA (I)', use: '3 à 5 min d’effort' },
  { i: 'repetition', label: 'Vitesse (R)', use: '200 à 400 m' },
];

const RACES = [
  { label: '5 km', m: 5000 },
  { label: '10 km', m: 10000 },
  { label: 'Semi', m: 21097.5 },
  { label: 'Marathon', m: 42195 },
];

const LTHR_SOURCE: Record<NonNullable<EffectiveProfile['lthrSource']>, string> = {
  declared: 'saisi dans ton profil',
  activities: 'ta FC prévue à l’allure seuil d’après tes dernières sorties',
  hr_max: 'estimé depuis ta FC max',
};

const METHOD_LABEL: Record<Vo2Sample['method'], string> = {
  hr: 'Cardio et allure',
  race: 'Course',
  declared_race: 'Course déclarée',
  vma_test: 'Test VMA',
};

const fr1 = (v: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signed = (v: number, digits = 0) => {
  const r = Number(v.toFixed(digits));
  const abs = Math.abs(r).toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return r > 0 ? `+${abs}` : r < 0 ? `−${abs}` : abs;
};

/** Ce qui découle d'un niveau, comparé d'un mois à l'autre. */
const PROGRESS_ROWS: { label: string; value: (p: ProgressPoint) => string; delta: (a: ProgressPoint, b: ProgressPoint) => { text: string; good?: boolean } }[] = [
  { label: 'VO2 max', value: (p) => fr1(p.vdot), delta: (a, b) => ({ text: signed(b.vdot - a.vdot, 1), good: b.vdot > a.vdot }) },
  {
    label: 'VMA',
    value: (p) => `${fr1(vmaFromVdot(p.vdot))} km/h`,
    delta: (a, b) => ({ text: `${signed(vmaFromVdot(b.vdot) - vmaFromVdot(a.vdot), 1)} km/h`, good: b.vdot > a.vdot }),
  },
  {
    label: 'Allure seuil',
    value: (p) => `${formatPace(trainingPaces(p.vdot).threshold)} /km`,
    delta: (a, b) => {
      const d = trainingPaces(b.vdot).threshold - trainingPaces(a.vdot).threshold;
      return { text: `${signed(d)} s/km`, good: d < 0 };
    },
  },
  {
    label: 'Endurance',
    value: (p) => `${formatPaceRange([trainingPaces(p.vdot).easySlow, trainingPaces(p.vdot).easyFast])} /km`,
    delta: (a, b) => {
      const d = trainingPaces(b.vdot).easyFast - trainingPaces(a.vdot).easyFast;
      return { text: `${signed(d)} s/km`, good: d < 0 };
    },
  },
  {
    label: '10 km prédit',
    value: (p) => formatClock(predictTime(p.vdot, 10000)),
    delta: (a, b) => {
      const d = predictTime(b.vdot, 10000) - predictTime(a.vdot, 10000);
      return { text: `${d < 0 ? '−' : '+'}${formatClock(Math.abs(d))}`, good: d < 0 };
    },
  },
  {
    label: 'FC seuil',
    value: (p) => (p.lthr ? `${p.lthr} bpm` : '–'),
    delta: (a, b) => ({ text: a.lthr && b.lthr ? `${signed(b.lthr - a.lthr)} bpm` : '–' }),
  },
];

function Progression({ points, samples, profile }: { points: ProgressPoint[]; samples: Vo2Sample[]; profile: EffectiveProfile }) {
  const t = today();
  const now = points.at(-1);
  // niveau à une date passée : le dernier calcul d'avant, s'il n'est pas trop vieux
  const at = (days: number) => {
    const d = addDays(t, -days);
    const p = [...points].reverse().find((q) => q.date <= d);
    return p && p.date > addDays(d, -21) ? p : undefined;
  };
  const cols = [
    { label: 'Il y a 3 mois', p: at(90), mid: false },
    { label: 'Il y a 1 mois', p: at(30), mid: true },
    { label: 'Aujourd’hui', p: now, mid: false },
  ].filter((c): c is { label: string; p: ProgressPoint; mid: boolean } => !!c.p);
  const first = cols.length > 1 ? cols[0] : undefined;
  const win = profile.vdotSamples;
  // la plus haute et la plus basse, écartées de la moyenne dès 6 mesures
  const out = new Set<number>();
  if (win.length >= 6) {
    const vals = win.map((s) => s.vdot);
    out.add(vals.indexOf(Math.min(...vals)));
    out.add(vals.lastIndexOf(Math.max(...vals)));
  }
  const gain = first && now ? now.vdot - first.p.vdot : 0;
  const paceGain = first && now ? trainingPaces(first.p.vdot).threshold - trainingPaces(now.vdot).threshold : 0;

  return (
    <section className="stack">
      <div>
        <h2>Progression</h2>
        <p className="muted">
          Ta VO2 max est la moyenne de tes 10 dernières mesures de moins de 4 mois. Chaque sortie de plus de 20 minutes avec cardio en donne une (le rapport
          entre ton allure et ta FC), chaque course aussi, comme la course et le test VMA déclarés dans ton profil. Elle se recalcule à chaque synchronisation :
          tes allures et tes zones suivent.
        </p>
      </div>

      {points.length < 2 || !now ? (
        <p className="muted">
          Pas encore assez de mesures. Il en faut au moins 3 sur 4 mois : des sorties de plus de 20 minutes avec une montre ou une ceinture cardio, des courses, ou
          un test VMA déclaré dans <Link to="/profil">ton profil</Link>.
        </p>
      ) : (
        <>
          <ProgressChart points={points} samples={samples} from={addDays(t, -180)} to={t} />

          {first && (
            <p className="dataline">
              <b>
                {signed(gain, 1)} point{Math.abs(gain) >= 2 ? 's' : ''}
              </b>{' '}
              de VO2 max depuis {first.label.toLowerCase()}
              {Math.round(paceGain) !== 0 ? (
                <>
                  , soit <b>{Math.abs(Math.round(paceGain))} s/km</b> {paceGain > 0 ? 'gagnées' : 'perdues'} à l’allure seuil
                </>
              ) : null}
              .
            </p>
          )}

          <table className="table prog-table">
            <thead>
              <tr>
                <th />
                {cols.map((c) => (
                  <th key={c.label} className={c.mid ? 'r prog-mid' : 'r'}>
                    {c.label}
                  </th>
                ))}
                {first && <th className="r">Évolution</th>}
              </tr>
            </thead>
            <tbody>
              {PROGRESS_ROWS.map((r) => {
                const d = first ? r.delta(first.p, now) : undefined;
                return (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    {cols.map((c) => (
                      <td key={c.label} className={c.mid ? 'r n prog-mid' : 'r n'}>
                        {r.value(c.p)}
                      </td>
                    ))}
                    {d && (
                      <td className="r n" style={{ color: d.good === undefined ? undefined : d.good ? 'var(--s-good-text)' : 'var(--s-bad)' }}>
                        {d.text}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {profile.vdot !== now.vdot && (
            <p className="small muted">
              Tes allures utilisent une VO2 max de {fr1(profile.vdot)} :{' '}
              {profile.vdotSource === 'manual'
                ? 'tu l’as forcée dans ton profil.'
                : profile.vdotOffset
                  ? `la moyenne, ajustée de ${signed(profile.vdotOffset, 1)} d’après tes ressentis.`
                  : `${vdotSourceLabel(profile)}.`}
            </p>
          )}

          {win.length > 0 && (
            <details className="stack">
              <summary className="small">Voir les {win.length} mesures de la moyenne actuelle</summary>
              <table className="table">
                <tbody>
                  {win.map((s, i) => (
                    <tr key={`${s.date}-${i}`} style={out.has(i) ? { color: 'var(--ink-3)' } : undefined}>
                      <td className="n">{formatDate(s.date, { day: 'numeric', month: 'short' })}</td>
                      <td>
                        {s.name}
                        <span className="small faint" style={{ display: 'block' }}>
                          {METHOD_LABEL[s.method]}
                          {s.method === 'hr' && s.avgHr ? `, ${s.avgHr} bpm de moyenne` : ''}
                          {out.has(i) ? ', écartée (valeur extrême)' : ''}
                        </span>
                      </td>
                      <td className="r n">{fr1(s.vdot)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}

          <p className="small faint">
            Calculée sur tes 6 derniers mois Strava. Foulée ne garde pas tes données Strava plus de 7 jours : la courbe est recalculée à chaque synchronisation.
          </p>
        </>
      )}
    </section>
  );
}

export function Fitness() {
  const { activities, profile, refreshActivities, syncedAt, me, saved } = useReady();
  const progress = useMemo(() => progressionFrom(activities, saved), [activities, saved]);
  const points = useMemo(() => computeFitness(activities, profile, 120), [activities, profile]);
  const analysis = useMemo(() => analyzeActivities(activities, [], profile, today()), [activities, profile]);
  const form = readForm(points.at(-1));
  const paces = trainingPaces(profile.vdot);
  const { lthr, hrMax } = resolveHr(profile);
  const mid = (i: Intensity) => {
    const r = paceFor(i, paces)!;
    return (r[0] + r[1]) / 2;
  };
  const last4 = analysis.semaines.slice(-4).reduce((s, w) => s + w.km, 0) / 4;

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <h1>Forme</h1>
          <p className="sub">
            {form ? `${FORM_TEXT[form.state].title}. ${FORM_TEXT[form.state].text} ` : ''}Charge calculée sur la FC (TRIMP) ou, à défaut, sur l’allure ajustée au
            dénivelé : 100 points valent 1 h au seuil.
          </p>
        </div>
        {!me.demo && (
          <button className="btn btn-secondary" onClick={() => refreshActivities()}>
            <RefreshCw size={16} aria-hidden /> Synchroniser Strava
          </button>
        )}
      </header>

      <div className="page-num">
        <span className="hero-num">{Math.round(points.at(-1)?.ctl ?? 0)}</span>
        <div className="hero-unit">
          <b>pts</b>
          <span>
            de forme{form ? `, ${FORM_TEXT[form.state].title.toLowerCase()}` : ''}
          </span>
        </div>
      </div>

      <section className="stack">
        <FitnessChart points={points} />
        {syncedAt ? (
          <p className="small faint">Activités synchronisées le {new Date(syncedAt * 1000).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}.</p>
        ) : null}
      </section>

      <Progression points={progress.points} samples={progress.samples} profile={profile} />

      <div className="split">
        <section className="stack">
          <h2>12 dernières semaines</h2>
          <div>
            <VolumeBars weeks={analysis.semaines.map((w) => ({ label: formatDate(w.debut, { day: 'numeric', month: 'short' }), km: w.km, elev: w.d_plus }))} />
            <div className="legend" style={{ marginLeft: 48 }}>
              <span>
                <i className="lg lg-box" style={{ background: 'var(--i-easy)' }} />
                Kilomètres courus (graduation à gauche)
              </span>
              <span>
                <i className="lg lg-dash" />
                Dénivelé positif (graduation à droite)
              </span>
              <span>
                <i className="lg lg-red" />
                Semaine en cours
              </span>
            </div>
          </div>
          <p className="dataline">
            <b>{Math.round(last4)} km</b> par semaine en moyenne sur 4 semaines, <b>{analysis.regularite.sorties_par_semaine.toLocaleString('fr-FR')}</b> sorties par
            semaine
            {analysis.montee ? (
              <>
                , <b>{analysis.montee.vitesse_montee_mediane_m_dplus_h} m D+/h</b> de vitesse en montée (médiane)
              </>
            ) : null}
            .
          </p>

          {analysis.intensite && (
            <div className="stat stack" style={{ gap: 10 }}>
              <h3>Répartition des intensités</h3>
              <div className="split-bar" role="img" aria-label="Répartition facile, modéré, dur">
                <span style={{ width: `${analysis.intensite.facile_pct}%`, background: 'var(--i-easy)', color: '#fff' }}>{analysis.intensite.facile_pct} %</span>
                <span style={{ width: `${analysis.intensite.modere_pct}%`, background: 'var(--i-mod)', color: '#fff' }}>{analysis.intensite.modere_pct} %</span>
                <span style={{ width: `${analysis.intensite.dur_pct}%`, background: 'var(--i-hard)', color: '#fff' }}>{analysis.intensite.dur_pct} %</span>
              </div>
              <p className="small muted">
                Facile, modéré, dur (temps de course, d’après ta FC moyenne). La référence des coachs est d’environ 80 % en facile.
                {analysis.intensite.facile_pct < 70 ? ' Tu cours trop souvent dans la zone intermédiaire : ralentis tes footings.' : ''}
              </p>
            </div>
          )}

          {analysis.efficacite && (
            <div className="stat">
              <h3>Efficacité cardio</h3>
              <div className="row" style={{ alignItems: 'baseline', gap: 16 }}>
                <span className="metric-big">
                  {analysis.efficacite.evolution_pct > 0 ? '+' : ''}
                  {analysis.efficacite.evolution_pct.toLocaleString('fr-FR')} %
                </span>
                <span className="muted">de distance par battement cardiaque sur tes sorties faciles, comparé au mois précédent.</span>
              </div>
            </div>
          )}
        </section>

        <aside className="stack" style={{ gap: 24 }}>
          <section className="stack">
            <div className="section-title">
              <h2>Allures</h2>
              <Link to="/profil" className="small">
                Ajuster
              </Link>
            </div>
            <p className="muted">
              VMA <b>{profile.vma.toLocaleString('fr-FR', { minimumFractionDigits: 1 })} km/h</b>, VO2 max {profile.vdot.toLocaleString('fr-FR')},{' '}
              {vdotSourceLabel(profile)}.
            </p>
            <table className="table">
              <thead>
                <tr>
                  <th>Allure</th>
                  <th className="r">min/km</th>
                  <th className="r">% VMA</th>
                </tr>
              </thead>
              <tbody>
                {PACE_ROWS.map((r) => (
                  <tr key={r.i}>
                    <td>
                      {r.label}
                      <span className="small faint" style={{ display: 'block' }}>
                        {r.use}
                      </span>
                    </td>
                    <td className="r n">{r.i === 'easy' ? formatPaceRange([paces.easySlow, paces.easyFast]) : formatPace(mid(r.i))}</td>
                    <td className="r n">
                      {r.i === 'easy' ? `${Math.round(pctVma(paces.easySlow, profile.vma))}–${Math.round(pctVma(paces.easyFast, profile.vma))}` : Math.round(pctVma(mid(r.i), profile.vma))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="stack">
            <h2>Temps prédits</h2>
            <table className="table">
              <tbody>
                {RACES.map((r) => {
                  const t = predictTime(profile.vdot, r.m);
                  return (
                    <tr key={r.label}>
                      <td>{r.label}</td>
                      <td className="r n">{formatClock(t)}</td>
                      <td className="r faint">{formatPace(t / (r.m / 1000))} /km</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="stack">
            <h2>Zones cardio</h2>
            {lthr ? (
              <>
                <p className="small muted">
                  Seuil {lthr} bpm, {LTHR_SOURCE[profile.lthrSource ?? 'hr_max']}{hrMax ? `. FC max ${hrMax} bpm` : ''}. Zones de Friel.
                </p>
                <table className="table">
                  <tbody>
                    {hrZones(lthr).map((z) => (
                      <tr key={z.zone}>
                        <td className="n">Z{z.zone}</td>
                        <td>{z.label}</td>
                        <td className="r n">{z.zone === 1 ? `< ${z.hi}` : z.zone === 5 ? `> ${z.lo}` : `${z.lo}–${z.hi}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="muted small">
                Renseigne ta FC max (ou ton année de naissance) dans <Link to="/profil">ton profil</Link> pour obtenir tes zones.
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
