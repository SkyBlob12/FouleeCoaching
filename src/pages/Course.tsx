import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Upload } from 'lucide-react';
import {
  buildCourse,
  formatClock,
  formatPace,
  parseGpx,
  predictSplits,
  predictTimeLong,
  type Course as CourseT,
} from '@engine';
import { useReady } from '../lib/data';
import type { PlanPrefill } from './PlanNew';

const fr = (x: number) => x.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const TERRAIN = [
  { v: 1.0, l: 'Roulant' },
  { v: 1.08, l: 'Technique' },
  { v: 1.18, l: 'Très technique' },
];

export function Course() {
  const { profile } = useReady();
  const navigate = useNavigate();
  const [course, setCourse] = useState<CourseT | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [terrain, setTerrain] = useState(1.08);
  const [hover, setHover] = useState<number | null>(null);

  const load = async (file: File) => {
    setError(null);
    try {
      const { track, waypoints, name } = parseGpx(await file.text());
      if (track.length < 10) throw new Error('Ce fichier ne contient pas de trace exploitable.');
      setCourse(buildCourse(track, waypoints));
      setFileName(name ?? file.name.replace(/\.gpx$/i, ''));
    } catch (e) {
      setError((e as Error).message);
      setCourse(null);
    }
  };

  const total = course ? predictTimeLong(profile.vdot, course.eqDistanceM) * terrain : 0;
  const splits = useMemo(() => (course ? predictSplits(course, total) : []), [course, total]);

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <h1>Parcours</h1>
          <p className="sub">Charge le GPX d’une course : profil, temps prédit et temps de passage à chaque ravito.</p>
        </div>
      </header>

      <label className="dropzone">
        <input type="file" accept=".gpx,application/gpx+xml" className="sr-only" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
        <Upload size={18} aria-hidden />
        <span>{course ? 'Charger un autre GPX' : 'Choisir un fichier GPX'}</span>
        <span className="small faint">Les points nommés (ravitos, sommets) servent de points de passage.</span>
      </label>
      {error && <p className="notice error">{error}</p>}

      {course && (
        <>
          <section className="stack">
            <h2>{fileName}</h2>
            <div className="facts">
              <div className="fact">
                <span className="v num">{fr(course.distanceM / 1000)} km</span>
                <span className="l">distance</span>
              </div>
              <div className="fact">
                <span className="v num">{Math.round(course.elevationGain)} m</span>
                <span className="l">D+</span>
              </div>
              <div className="fact">
                <span className="v num">{Math.round(course.elevationLoss)} m</span>
                <span className="l">D−</span>
              </div>
              <div className="fact">
                <span className="v num">{formatClock(total)}</span>
                <span className="l">temps prédit</span>
              </div>
            </div>
            <ElevationProfile course={course} splits={splits.map((s) => s.distM)} hover={hover} onHover={setHover} />
            <div className="field">
              <span>Terrain</span>
              <div className="seg" role="group" aria-label="Technicité">
                {TERRAIN.map((t) => (
                  <button key={t.v} type="button" aria-pressed={terrain === t.v} onClick={() => setTerrain(t.v)}>
                    {t.l}
                  </button>
                ))}
              </div>
              <span className="hint">
                Prédiction : distance équivalent plat ({fr(course.eqDistanceM / 1000)} km) courue à ta VO2 max {profile.vdot.toLocaleString('fr-FR')},
                hors temps d’arrêt aux ravitos.
              </span>
            </div>
          </section>

          <section className="stack">
            <h2>Temps de passage</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Point</th>
                  <th className="r">km</th>
                  <th className="r hide-sm">Alt.</th>
                  <th className="r">Temps</th>
                  <th className="r hide-sm">Allure moy.</th>
                </tr>
              </thead>
              <tbody>
                {splits.map((s, i) => (
                  <tr key={i} onPointerEnter={() => setHover(s.distM)} onPointerLeave={() => setHover(null)}>
                    <td>{s.name}</td>
                    <td className="r num">{fr(s.distM / 1000)}</td>
                    <td className="r num hide-sm">{Math.round(s.ele)} m</td>
                    <td className="r num">{formatClock(s.timeSec)}</td>
                    <td className="r num muted hide-sm">{formatPace(s.timeSec / (s.distM / 1000))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row">
              <button
                className="btn btn-primary"
                onClick={() =>
                  navigate('/plan/nouveau', {
                    state: { sport: 'trail', name: fileName, distanceKm: course.distanceM / 1000, elevationGain: course.elevationGain } satisfies PlanPrefill,
                  })
                }
              >
                Créer un plan pour cette course
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// classes de pente, de la descente raide à la montée très raide (couleurs des zones d'intensité)
const SLOPES = [
  { max: -15, l: 'Descente raide', c: 'var(--i-easy)' },
  { max: -5, l: 'Descente', c: 'color-mix(in srgb, var(--i-easy) 45%, var(--paper))' },
  { max: 5, l: 'Plat', c: 'var(--i-rest)' },
  { max: 10, l: 'Montée', c: 'var(--i-thr)' },
  { max: 20, l: 'Montée raide', c: 'var(--i-hard)' },
  { max: Infinity, l: 'Très raide', c: 'var(--i-max)' },
];
const slopeClass = (g: number) => SLOPES.findIndex((s) => g < s.max);
const signed = (g: number) => `${g > 0 ? '+' : g < 0 ? '−' : ''}${Math.abs(Math.round(g))} %`;

function ElevationProfile({ course, splits, hover, onHover }: { course: CourseT; splits: number[]; hover: number | null; onHover: (d: number | null) => void }) {
  const W = 1000;
  const H = 160;
  const pts = course.points;
  const min = Math.min(...pts.map((p) => p.ele));
  const max = Math.max(...pts.map((p) => p.ele));
  const span = Math.max(50, max - min);
  const x = (d: number) => (d / course.distanceM) * W;
  const y = (e: number) => H - 6 - ((e - min) / span) * (H - 20);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.distM).toFixed(1)},${y(p.ele).toFixed(1)}`).join(' ');

  // pente de chaque segment [i-1, i], lissée sur ~150 m (points tous les ~25 m)
  const { grades, bands, kmByClass } = useMemo(() => {
    const grades = pts.map((_, i) => {
      if (i === 0) return 0;
      const a = pts[Math.max(0, i - 3)];
      const b = pts[Math.min(pts.length - 1, i + 2)];
      return b.distM > a.distM ? ((b.ele - a.ele) / (b.distM - a.distM)) * 100 : 0;
    });
    const bands: { cls: number; from: number; to: number }[] = [];
    const kmByClass = SLOPES.map(() => 0);
    for (let i = 1; i < pts.length; i++) {
      const cls = slopeClass(grades[i]);
      kmByClass[cls] += (pts[i].distM - pts[i - 1].distM) / 1000;
      const last = bands.at(-1);
      if (last && last.cls === cls) last.to = i;
      else bands.push({ cls, from: i - 1, to: i });
    }
    return { grades, bands, kmByClass };
  }, [pts]);

  const band = (from: number, to: number) => {
    let d = `M${x(pts[from].distM).toFixed(1)},${H}`;
    for (let i = from; i <= to; i++) d += ` L${x(pts[i].distM).toFixed(1)},${y(pts[i].ele).toFixed(1)}`;
    return `${d} L${x(pts[to].distM).toFixed(1)},${H} Z`;
  };

  let hi = 0;
  if (hover !== null) {
    hi = pts.findIndex((p) => p.distM >= hover);
    if (hi < 1) hi = hi === 0 ? 1 : pts.length - 1;
  }
  const hp = hover !== null ? pts[hi] : null;

  return (
    <div className="elev stack">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        width="100%"
        height={H}
        role="img"
        aria-label={`Profil altimétrique coloré par pente, de ${Math.round(min)} à ${Math.round(max)} m`}
        onPointerMove={(e) => {
          const b = e.currentTarget.getBoundingClientRect();
          onHover(Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)) * course.distanceM);
        }}
        onPointerLeave={() => onHover(null)}
      >
        {bands.map((b) => (
          <path key={b.from} d={band(b.from, b.to)} fill={SLOPES[b.cls].c} fillOpacity={0.9} />
        ))}
        <path d={line} fill="none" stroke="var(--ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        {splits.map((d) => (
          <line key={d} x1={x(d)} x2={x(d)} y1={0} y2={H} stroke="var(--ink-3)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="var(--ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="row small faint" style={{ justifyContent: 'space-between' }}>
        <span className="num">0 km</span>
        {hp ? (
          <span className="num" style={{ color: 'var(--ink)' }}>
            km {fr(hover! / 1000)} · {Math.round(hp.ele)} m · pente {signed(grades[hi])}
          </span>
        ) : (
          <span className="num">
            altitude {Math.round(min)} à {Math.round(max)} m
          </span>
        )}
        <span className="num">{fr(course.distanceM / 1000)} km</span>
      </div>
      <div className="legend">
        {SLOPES.map((s, i) =>
          kmByClass[i] >= 0.05 ? (
            <span key={s.l}>
              <i className="lg lg-box" style={{ background: s.c }} />
              {s.l}{' '}
              <span className="faint num">
                ({i === 0 ? `< −15 %` : i === SLOPES.length - 1 ? `> 20 %` : `${signed(SLOPES[i - 1].max)} à ${signed(s.max)}`}, {fr(kmByClass[i])} km)
              </span>
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}
