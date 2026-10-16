import { useLayoutEffect, useRef, useState } from 'react';
import {
  formatPace,
  formState,
  PHASE_LABEL,
  runKm,
  trainingPaces,
  vmaFromVdot,
  type FitnessPoint,
  type Phase,
  type PlanWeek,
  type ProgressPoint,
  type Vo2Sample,
} from '@engine';
import { formatDate } from '../lib/sessions';
import { FORM_COLOR, FORM_TEXT } from '../lib/form';

/*
 * Signature de l'univers : les graphes se tracent SUR la grille de la page.
 * Chaque graphe est calé sur une ligne de la grille (useGridSnap), sa hauteur est un multiple de 24 px
 * et chaque ligne de grille vaut un pas rond, écrit dans la marge gauche.
 */

const W = 1000;
const CELL = 24;

/** Décale le tracé pour que son haut tombe exactement sur une ligne de la grille de fond. */
export function useGridSnap() {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const y = el.getBoundingClientRect().top + window.scrollY;
      // les lignes de fond occupent y = 24k − 1
      const next = (((CELL - 1 - y) % CELL) + CELL) % CELL;
      setTop((cur) => (cur === next ? cur : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  return { ref, top };
}

/** Pas « rond » par ligne de grille (1, 2, 5, 10, 20, 25, 50…). */
function niceStep(max: number, rows: number) {
  const raw = max / Math.max(1, rows);
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

function Axis({ rows, step, unit, side = 'left', every = 1 }: { rows: number; step: number; unit?: string; side?: 'left' | 'right'; every?: number }) {
  return (
    <div className={`axis ${side === 'right' ? 'right' : ''}`} aria-hidden style={{ height: rows * CELL }}>
      {Array.from({ length: rows + 1 }, (_, k) => k)
        .filter((k) => k % every === 0 && k > 0)
        .map((k) => (
          <span key={k} style={{ top: (rows - k) * CELL }}>
            {Math.round(k * step).toLocaleString('fr-FR')}
            {k === rows - (rows % every) && unit ? ` ${unit}` : ''}
          </span>
        ))}
    </div>
  );
}

export const PHASE_COLOR: Record<Phase, string> = {
  base: 'var(--ph-base)',
  build: 'var(--ph-build)',
  specific: 'var(--ph-specific)',
  taper: 'var(--ph-taper)',
};

/** Saison du plan : 1 ligne de grille = un pas de volume ; semaine en cours en rouge, D+ en courbe. */
export function PlanProfile({ weeks, current, trail, onSelect }: { weeks: PlanWeek[]; current: number; trail: boolean; onSelect?: (i: number) => void }) {
  const { ref, top } = useGridSnap();
  const rows = 7;
  const H = rows * CELL;
  const max = Math.max(...weeks.map(runKm), 1);
  const step = niceStep(max, rows - 1);
  const maxElev = Math.max(...weeks.map((w) => w.elevationGain), 1);
  const cw = W / weeks.length;
  const y = (v: number) => H - (v / step) * CELL;
  const ye = (v: number) => H - (v / maxElev) * (H - 2 * CELL);
  const elev = weeks.map((w, i) => `${i ? 'L' : 'M'}${(i + 0.5) * cw},${ye(w.elevationGain)}`).join(' ');
  const phases: { phase: Phase; len: number; start: number }[] = [];
  weeks.forEach((w, i) => {
    const last = phases.at(-1);
    if (last && last.phase === w.phase) last.len++;
    else phases.push({ phase: w.phase, len: 1, start: i });
  });
  return (
    <div ref={ref} style={{ paddingTop: top }}>
      <div className="pprofile-chart">
        <Axis rows={rows} step={step} unit="km" every={2} />
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} aria-hidden style={{ display: 'block' }}>
          {weeks.map((w, i) => (
            <rect
              key={i}
              x={i * cw + 1.5}
              y={y(runKm(w))}
              width={cw - 3}
              height={H - y(runKm(w))}
              fill={i === current ? 'var(--red)' : PHASE_COLOR[w.phase]}
              opacity={i !== current && w.recovery ? 0.45 : 1}
            />
          ))}
          {trail && <path d={elev} fill="none" stroke="var(--ink-3)" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />}
        </svg>
        <div className="pprofile-hit" style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}>
          {weeks.map((w, i) => (
            <button key={i} type="button" onClick={() => onSelect?.(i)} aria-label={`Semaine ${w.index + 1}, ${PHASE_LABEL[w.phase]}, ${runKm(w)} km${w.elevationGain ? `, ${w.elevationGain} m D+` : ''}`} />
          ))}
        </div>
      </div>
      <div className="pprofile-phases" style={{ gridTemplateColumns: phases.map((p) => `${p.len}fr`).join(' ') }}>
        {phases.map((p) => (
          <span key={p.start} className="pprofile-phase" style={{ borderTopColor: PHASE_COLOR[p.phase] }}>
            {p.len >= 3 ? PHASE_LABEL[p.phase] : PHASE_LABEL[p.phase].slice(0, 3) + '.'}
          </span>
        ))}
      </div>
      <div className="legend" style={{ marginLeft: 48 }}>
        <span>Kilomètres par semaine, une ligne de grille = {step.toLocaleString('fr-FR')} km, couleur de la phase</span>
        <span>
          <i className="lg lg-box" style={{ background: 'var(--ph-base)', opacity: 0.45 }} />
          Semaine allégée
        </span>
        <span>
          <i className="lg lg-red" />
          Cette semaine
        </span>
        {trail && (
          <span>
            <i className="lg lg-dash" />
            Dénivelé (relatif)
          </span>
        )}
      </div>
    </div>
  );
}

/** Forme (CTL) et fatigue (ATL) en courbes, fraîcheur (TSB) en barres colorées par état, sur un axe de temps commun. */
export function FitnessChart({ points }: { points: FitnessPoint[] }) {
  const { ref: snapRef, top } = useGridSnap();
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  if (points.length < 2) return null;
  const rows = 8;
  const H = rows * CELL;
  const rowsT = 4;
  const HT = rowsT * CELL;
  const max = Math.max(...points.map((p) => Math.max(p.ctl, p.atl)), 10);
  const step = niceStep(max, rows - 1);
  const tsbAbs = Math.max(...points.map((p) => Math.abs(p.tsb)), 10);
  const stepT = niceStep(tsbAbs, rowsT / 2);
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - (v / step) * CELL;
  const line = (f: (p: FitnessPoint) => number) => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(f(p)).toFixed(1)}`).join(' ');
  const area = `${line((q) => q.ctl)} L${W},${H} L0,${H} Z`;
  const bw = W / points.length;
  const last = points.length - 1;
  const idx = hover ?? last;
  const p = points[idx];
  const state = formState(p);
  const months = points.map((pt, i) => ({ i, d: pt.date })).filter(({ d }, i) => i > 0 && d.endsWith('-01'));
  const pick = (cx: number) => {
    const b = ref.current?.getBoundingClientRect();
    if (!b) return;
    setHover(Math.max(0, Math.min(last, Math.round(((cx - b.left) / b.width) * last))));
  };
  // étiquettes directes en bout de courbe, écartées si elles se chevauchent
  let yCtl = y(points[last].ctl);
  let yAtl = y(points[last].atl);
  if (Math.abs(yCtl - yAtl) < 18) {
    const mid = (yCtl + yAtl) / 2;
    const up = points[last].ctl >= points[last].atl;
    yCtl = mid + (up ? -9 : 9);
    yAtl = mid + (up ? 9 : -9);
  }
  const sign = (v: number) => {
    const r = Math.round(v);
    return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r)}`;
  };
  const states = (['fresh', 'optimal', 'tired', 'overreaching', 'detraining'] as const).filter((s) => points.some((q) => formState(q) === s));

  return (
    <div className="chart fchart">
      <div className="fchart-key" aria-live="polite">
        <p className="fchart-day">
          <b className="capitalize">{hover === null ? 'Aujourd’hui' : formatDate(p.date, { weekday: 'long', day: 'numeric', month: 'long' })}</b>
          {p.load > 0 ? `, séance de charge ${Math.round(p.load)}` : hover === null ? '' : ', pas de séance'}
        </p>
        <div className="fchart-cells">
          <div className="fchart-cell">
            <span className="fchart-name">
              <i className="lg" style={{ borderTopColor: 'var(--c-forme)' }} />
              Forme <b>{Math.round(p.ctl)}</b>
            </span>
            <span className="fchart-def">Ton niveau d’entraînement : ta charge moyenne sur 6 semaines. Elle monte lentement quand tu cours régulièrement.</span>
          </div>
          <div className="fchart-cell">
            <span className="fchart-name">
              <i className="lg lg-dash" style={{ borderTopColor: 'var(--c-fatigue)' }} />
              Fatigue <b>{Math.round(p.atl)}</b>
            </span>
            <span className="fchart-def">Ta charge des 7 derniers jours. Elle grimpe vite après une grosse séance et redescend vite au repos.</span>
          </div>
          <div className="fchart-cell">
            <span className="fchart-name">
              <i className="lg lg-box" style={{ background: FORM_COLOR[state] }} />
              Fraîcheur <b>{sign(p.tsb)}</b>
              <span className="fchart-state">{FORM_TEXT[state].title}</span>
            </span>
            <span className="fchart-def">Forme moins fatigue. Positive : tu es reposé. Très négative : tu accumules trop.</span>
          </div>
        </div>
      </div>

      <div ref={snapRef} style={{ paddingTop: top }}>
        <div ref={ref} className="chart-plot fchart-plot" onPointerMove={(e) => pick(e.clientX)} onPointerDown={(e) => pick(e.clientX)} onPointerLeave={() => setHover(null)}>
          <span className="fchart-panel">Forme et fatigue</span>
          <Axis rows={rows} step={step} unit="pts" every={2} />
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            width="100%"
            height={H}
            role="img"
            aria-label={`Forme ${Math.round(points[last].ctl)} et fatigue ${Math.round(points[last].atl)} aujourd’hui`}
            style={{ display: 'block' }}
          >
            <path d={area} fill="var(--c-forme-wash)" />
            <path d={line((q) => q.atl)} fill="none" stroke="var(--c-fatigue)" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
            <path d={line((q) => q.ctl)} fill="none" stroke="var(--c-forme)" strokeWidth={3} vectorEffect="non-scaling-stroke" />
            <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="var(--ink)" vectorEffect="non-scaling-stroke" />
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="var(--ink-3)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
          </svg>
          {/* points en HTML : ils restent ronds malgré l'étirement du SVG */}
          <span className="fchart-dot" style={{ left: `${(idx / last) * 100}%`, top: y(p.atl), background: 'var(--c-fatigue)' }} />
          <span className="fchart-dot big" style={{ left: `${(idx / last) * 100}%`, top: y(p.ctl), background: 'var(--c-forme)' }} />
          <span className="fchart-label" style={{ top: yCtl }}>
            Forme {Math.round(points[last].ctl)}
          </span>
          <span className="fchart-label" style={{ top: yAtl }}>
            Fatigue {Math.round(points[last].atl)}
          </span>

          <div style={{ position: 'relative', marginTop: CELL }}>
            <span className="fchart-panel">Fraîcheur</span>
            <div className="axis" aria-hidden style={{ height: HT }}>
              <span style={{ top: 0 }}>{sign(stepT * 2)}</span>
              <span style={{ top: HT / 2 }}>0</span>
              <span style={{ top: HT }}>{sign(-stepT * 2)}</span>
            </div>
            <span className="fchart-side" style={{ top: HT / 4 }}>
              reposé
            </span>
            <span className="fchart-side" style={{ top: (HT * 3) / 4 }}>
              fatigué
            </span>
            <svg
              viewBox={`0 0 ${W} ${HT}`}
              preserveAspectRatio="none"
              width="100%"
              height={HT}
              role="img"
              aria-label={`Fraîcheur ${sign(points[last].tsb)} aujourd’hui, ${FORM_TEXT[formState(points[last])].title.toLowerCase()}`}
              style={{ display: 'block' }}
            >
              {points.map((pt, i) => {
                const h = Math.min(HT / 2, (Math.abs(pt.tsb) / (stepT * 2)) * (HT / 2));
                return (
                  <rect
                    key={i}
                    x={x(i) - bw * 0.4}
                    width={bw * 0.8}
                    y={pt.tsb >= 0 ? HT / 2 - h : HT / 2}
                    height={h}
                    fill={FORM_COLOR[formState(pt)]}
                    opacity={hover === null || hover === i ? 1 : 0.55}
                  />
                );
              })}
              <line x1={0} x2={W} y1={HT / 2} y2={HT / 2} stroke="var(--ink)" vectorEffect="non-scaling-stroke" />
              {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={HT} stroke="var(--ink-3)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
            </svg>
          </div>
          <div className="chart-months">
            {months.map(({ i, d }) => (
              <span key={d} style={{ left: `${(i / last) * 100}%` }}>
                {formatDate(d, { month: 'short' })}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="legend" style={{ marginLeft: 48 }}>
        {states.map((s) => (
          <span key={s}>
            <i className="lg lg-box" style={{ background: FORM_COLOR[s] }} />
            {FORM_TEXT[s].title}
          </span>
        ))}
        <span className="faint">Survole ou touche le graphique pour lire un jour.</span>
      </div>
    </div>
  );
}

const SAMPLE_COLOR: Record<Vo2Sample['method'], string> = {
  hr: 'var(--ink-3)',
  race: 'var(--i-thr)',
  declared_race: 'var(--i-thr)',
  vma_test: 'var(--i-max)',
};

/**
 * Progression de la VO2 max : la moyenne glissante des 10 dernières mesures en courbe,
 * chaque mesure en point (gris : sortie avec cardio, ambre : course, violet : test VMA).
 */
export function ProgressChart({ points, samples, from, to }: { points: ProgressPoint[]; samples: Vo2Sample[]; from: string; to: string }) {
  const { ref: snapRef, top } = useGridSnap();
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  if (points.length < 2) return null;
  const rows = 6;
  const H = rows * CELL;
  const shown = samples.filter((s) => s.date >= from);
  const values = [...points.map((p) => p.vdot), ...shown.map((s) => s.vdot)];
  const step = niceStep(Math.max(2, Math.max(...values) - Math.min(...values)), rows - 1);
  const lo = Math.floor(Math.min(...values) / step) * step;
  const span = Math.max(1, (Date.parse(to) - Date.parse(from)) / 864e5);
  const xPct = (d: string) => ((Date.parse(d) - Date.parse(from)) / 864e5 / span) * 100;
  const y = (v: number) => H - ((v - lo) / step) * CELL;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${((xPct(p.date) / 100) * W).toFixed(1)},${y(p.vdot).toFixed(1)}`).join(' ');
  const last = points.length - 1;
  const p = points[hover ?? last];
  const months: string[] = [];
  for (let d = new Date(from + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= to; d.setUTCMonth(d.getUTCMonth() + 1, 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (iso > from) months.push(iso);
  }
  const pick = (cx: number) => {
    const b = ref.current?.getBoundingClientRect();
    if (!b) return;
    const pct = ((cx - b.left) / b.width) * 100;
    let best = 0;
    points.forEach((q, i) => {
      if (Math.abs(xPct(q.date) - pct) < Math.abs(xPct(points[best].date) - pct)) best = i;
    });
    setHover(best);
  };
  const fr = (v: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <div className="chart">
      <p className="chart-readout" aria-live="polite">
        <span>
          <b>{fr(p.vdot)}</b> VO2 max
        </span>
        <span>
          <b>{fr(vmaFromVdot(p.vdot))}</b> km/h de VMA
        </span>
        <span>
          <b>{formatPace(trainingPaces(p.vdot).threshold)}</b> /km au seuil
        </span>
        <span className="muted">{hover === null ? 'aujourd’hui' : `au ${formatDate(p.date, { day: 'numeric', month: 'long' })}`}</span>
      </p>
      <div ref={snapRef} style={{ paddingTop: top }}>
        <div ref={ref} className="chart-plot fchart-plot" onPointerMove={(e) => pick(e.clientX)} onPointerDown={(e) => pick(e.clientX)} onPointerLeave={() => setHover(null)}>
          <div className="axis" aria-hidden style={{ height: H }}>
            {Array.from({ length: rows }, (_, k) => k + 1)
              .filter((k) => k % 2 === 0)
              .map((k) => (
                <span key={k} style={{ top: H - k * CELL }}>
                  {(lo + k * step).toLocaleString('fr-FR')}
                </span>
              ))}
          </div>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            width="100%"
            height={H}
            role="img"
            aria-label={`VO2 max passée de ${fr(points[0].vdot)} à ${fr(points[last].vdot)}`}
            style={{ display: 'block' }}
          >
            <path d={line} fill="none" stroke="var(--c-forme)" strokeWidth={3} vectorEffect="non-scaling-stroke" />
            <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="var(--ink)" vectorEffect="non-scaling-stroke" />
            {hover !== null && (
              <line x1={(xPct(p.date) / 100) * W} x2={(xPct(p.date) / 100) * W} y1={0} y2={H} stroke="var(--ink-3)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          {shown.map((s, i) => (
            <span
              key={i}
              className="fchart-dot"
              style={{ left: `${xPct(s.date)}%`, top: Math.max(0, Math.min(H, y(s.vdot))), background: SAMPLE_COLOR[s.method], opacity: s.method === 'hr' ? 0.55 : 1, width: 6, height: 6 }}
            />
          ))}
          <span className="fchart-dot big" style={{ left: `${xPct(p.date)}%`, top: y(p.vdot), background: 'var(--c-forme)' }} />
          <span className="fchart-label" style={{ top: y(points[last].vdot) }}>
            {fr(points[last].vdot)}
          </span>
          <div className="chart-months">
            {months.map((d) => (
              <span key={d} style={{ left: `${xPct(d)}%` }}>
                {formatDate(d, { month: 'short' })}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="legend" style={{ marginLeft: 48 }}>
        <span>
          <i className="lg" style={{ borderTopColor: 'var(--c-forme)' }} />
          Moyenne des 10 dernières mesures
        </span>
        <span>
          <i className="lg lg-box" style={{ background: 'var(--ink-3)', opacity: 0.55 }} />
          Sortie (cardio et allure)
        </span>
        {shown.some((s) => s.method === 'race' || s.method === 'declared_race') && (
          <span>
            <i className="lg lg-box" style={{ background: 'var(--i-thr)' }} />
            Course
          </span>
        )}
        {shown.some((s) => s.method === 'vma_test') && (
          <span>
            <i className="lg lg-box" style={{ background: 'var(--i-max)' }} />
            Test VMA
          </span>
        )}
        <span className="faint">Une ligne de grille = {step.toLocaleString('fr-FR')} point{step > 1 ? 's' : ''}.</span>
      </div>
    </div>
  );
}

/** Courbe de forme sur 2 lignes de grille, valeurs de début et de fin écrites. */
export function TrendCurve({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const H = 2 * CELL;
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const span = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - 3 - ((v - min) / span) * (H - 6);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} role="img" aria-label={label} style={{ display: 'block' }}>
        <path d={d} fill="none" stroke="var(--c-forme)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="row small faint" style={{ justifyContent: 'space-between' }}>
        <span className="tnum">il y a 8 sem. : {Math.round(values[0])}</span>
        <span className="tnum">aujourd’hui : {Math.round(values.at(-1)!)}</span>
      </div>
    </div>
  );
}

/** Kilomètres en barres (graduation à gauche), D+ en courbe tiretée (graduation à droite). */
export function VolumeBars({ weeks }: { weeks: { label: string; km: number; elev: number }[] }) {
  const { ref, top } = useGridSnap();
  const rows = 6;
  const H = rows * CELL;
  const maxKm = Math.max(10, ...weeks.map((w) => w.km));
  const step = niceStep(maxKm, rows - 1);
  const maxElev = Math.max(100, ...weeks.map((w) => w.elev));
  const stepE = niceStep(maxElev, rows - 1);
  const hasElev = weeks.some((w) => w.elev > 200);
  const cw = W / weeks.length;
  const y = (v: number) => H - (v / step) * CELL;
  const ye = (v: number) => H - (v / stepE) * CELL;
  const elev = weeks.map((w, i) => `${i ? 'L' : 'M'}${(i + 0.5) * cw},${ye(w.elev)}`).join(' ');
  return (
    <div ref={ref} style={{ paddingTop: top }}>
      <div className="chart-plot" style={{ marginRight: hasElev ? 56 : 0 }}>
        <Axis rows={rows} step={step} unit="km" every={2} />
        {hasElev && <Axis rows={rows} step={stepE} unit="m" every={2} side="right" />}
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} role="img" aria-label="Volume de course hebdomadaire" style={{ display: 'block' }}>
          {weeks.map((w, i) => (
            <rect key={w.label} x={i * cw + 3} y={y(w.km)} width={cw - 6} height={H - y(w.km)} fill={i === weeks.length - 1 ? 'var(--red)' : 'var(--i-easy)'}>
              <title>{`${w.label} : ${w.km.toFixed(1)} km, ${Math.round(w.elev)} m D+`}</title>
            </rect>
          ))}
          {hasElev && <path d={elev} fill="none" stroke="var(--ink-3)" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />}
          <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="var(--ink)" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="row small faint" style={{ justifyContent: 'space-between', height: CELL, alignItems: 'center' }}>
          <span>{weeks[0]?.label}</span>
          <span>{weeks.at(-1)?.label}</span>
        </div>
      </div>
    </div>
  );
}
