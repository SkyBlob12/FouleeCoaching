import { useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import {
  addDays,
  categorize,
  CATEGORY_LABEL,
  formatClock,
  generatePlan,
  kmEffort,
  parseClock,
  PHASE_LABEL,
  predictTimeLong,
  runKm,
  type Level,
  type Plan,
  type Sport,
} from '@engine';
import { useReady } from '../lib/data';
import { aiAllowed, today } from '../lib/profile';
import { WEEKDAYS, WEEKDAYS_SHORT } from '../lib/sessions';
import { PlanProfile } from '../components/Charts';
import { AiAnalysis, AiProgress } from '../components/Ai';
import { api } from '../lib/api';

const ROAD_PRESETS = [
  { label: '5 km', km: 5 },
  { label: '10 km', km: 10 },
  { label: 'Semi', km: 21.0975 },
  { label: 'Marathon', km: 42.195 },
];

export interface PlanPrefill {
  sport?: Sport;
  name?: string;
  distanceKm?: number;
  elevationGain?: number;
}

export function PlanNew({ edit = false }: { edit?: boolean }) {
  const { profile, saved, plan: existing, savePlan, updatePlan, saveProfile, aiStatus } = useReady();
  // modification : le formulaire part du plan en cours
  const src = edit ? existing : null;
  const [aiState, setAiState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [aiError, setAiError] = useState<string | null>(null);
  const [basePeak, setBasePeak] = useState<number | null>(null);
  const aiOn = aiStatus.enabled && aiAllowed(saved);
  const navigate = useNavigate();
  const prefill = (useLocation().state ?? {}) as PlanPrefill;

  const [sport, setSport] = useState<Sport>(src?.goal.sport ?? prefill.sport ?? profile.sport);
  const [name, setName] = useState(src?.goal.name ?? prefill.name ?? '');
  const [distance, setDistance] = useState(
    src ? String(src.goal.distanceKm) : prefill.distanceKm ? String(+prefill.distanceKm.toFixed(1)) : sport === 'road' ? '10' : '30',
  );
  const [elevation, setElevation] = useState(
    src?.goal.elevationGain ? String(src.goal.elevationGain) : prefill.elevationGain ? String(Math.round(prefill.elevationGain)) : '1500',
  );
  const [date, setDate] = useState(src?.goal.date ?? addDays(today(), 84));
  const [target, setTarget] = useState(src?.goal.targetTimeSec ? formatClock(src.goal.targetTimeSec) : '');
  const others = saved?.otherSports ?? [];
  const hardDays = new Set(others.filter((o) => o.intensity === 'high').map((o) => o.day));
  const sportOn = (d: number) => others.filter((o) => o.day === d);
  const [days, setDays] = useState<number[]>(src?.availability.days ?? [1, 3, 6].filter((d) => !hardDays.has(d)));
  const [longDay, setLongDay] = useState(src?.availability.longRunDay ?? 6);
  const [maxMin, setMaxMin] = useState(src?.availability.maxWeekdayMin ? String(src.availability.maxWeekdayMin) : '');
  const [level, setLevel] = useState<Level>(src?.level ?? profile.level);
  const [preview, setPreview] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const km = Number(distance.replace(',', '.'));
  const elev = sport === 'trail' ? Number(elevation) || 0 : 0;
  const category = km > 0 ? categorize({ sport, distanceKm: km, elevationGain: elev }) : null;
  const predicted = km > 0 ? predictTimeLong(profile.vdot, kmEffort(km, elev) * 1000) * (sport === 'trail' ? 1.08 : 1) : 0;

  // seuls le nom ou l'objectif chrono changent : on les enregistre sans recalculer les séances
  const sameStructure =
    !!src &&
    sport === src.goal.sport &&
    Math.abs(km - src.goal.distanceKm) < 1e-6 &&
    elev === (src.goal.sport === 'trail' ? src.goal.elevationGain : 0) &&
    date === src.goal.date &&
    [...days].sort().join() === [...src.availability.days].sort().join() &&
    longDay === src.availability.longRunDay &&
    (Number(maxMin) || undefined) === src.availability.maxWeekdayMin &&
    level === (src.level ?? profile.level);

  const quickSave = async () => {
    if (!src) return;
    setSaving(true);
    setError(null);
    try {
      await updatePlan({ ...src, goal: { ...src.goal, name: name.trim() || src.goal.name, targetTimeSec: target ? parseClock(target) : undefined } });
      navigate('/plan');
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const toggleDay = (d: number) => {
    setPreview(null);
    setDays((xs) => {
      const next = xs.includes(d) ? xs.filter((x) => x !== d) : [...xs, d].sort();
      if (!next.includes(longDay) && next.length) setLongDay(next[next.length - 1]);
      return next;
    });
  };

  const tune = async (goal: Plan['goal'], availability: Plan['availability']) => {
    setAiState('running');
    setAiError(null);
    try {
      const r = await api<{ plan: Plan; base: { peakKm: number } }>('/ai/tune', { method: 'POST', json: { goal, availability, startDate: today(), level } });
      setPreview(r.plan);
      setBasePeak(r.base.peakKm);
      setAiState('done');
    } catch (e) {
      setAiError((e as Error).message);
      setAiState('error');
    }
  };

  const enableAi = async () => {
    await saveProfile({ ...(saved ?? { level, sport }), aiActivities: true });
    if (preview) tune(preview.goal, preview.availability);
  };

  const build = () => {
    setError(null);
    setAiState('idle');
    setBasePeak(null);
    if (!(km > 0)) return setError('Indique la distance de la course.');
    if (days.length < 2) return setError('Choisis au moins 2 jours d’entraînement par semaine.');
    if (date < addDays(today(), 7)) return setError('La course doit être dans plus d’une semaine.');
    try {
      const p = generatePlan({
        profile: { ...profile, level },
        goal: {
          sport,
          name: name.trim() || (category ? CATEGORY_LABEL[category] : 'Course'),
          distanceKm: km,
          elevationGain: elev,
          date,
          targetTimeSec: target ? parseClock(target) : undefined,
        },
        availability: { days, longRunDay: longDay, maxWeekdayMin: Number(maxMin) || undefined },
        startDate: today(),
        extras: {
          otherSports: others,
          strength: saved?.strength ?? 'auto',
          fragile: saved?.fragile ?? [],
          needsTest: profile.vdotSource === 'default' || profile.vdotSource === 'best_effort',
        },
      });
      setPreview(p);
      requestAnimationFrame(() => document.getElementById('apercu')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      if (aiOn) tune(p.goal, p.availability);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const peak = useMemo(() => (preview ? Math.max(...preview.weeks.map(runKm)) : 0), [preview]);

  if (edit && !existing) return <Navigate to="/plan/nouveau" replace />;

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <h1>{edit ? 'Modifier le plan' : 'Nouveau plan'}</h1>
          <p className="sub">
            {edit
              ? 'Le nom et l’objectif chrono s’enregistrent tels quels. Changer la course, les jours ou le niveau recalcule le plan à partir de cette semaine : les séances déjà passées et tes retouches à la main sont remplacées.'
              : `Les allures partent de ton niveau actuel (VO2 max ${profile.vdot.toLocaleString('fr-FR')}) et se mettent à jour quand ta forme évolue.`}
          </p>
        </div>
      </header>

      <form
        className="stack-lg form-narrow"
        onSubmit={(e) => {
          e.preventDefault();
          if (sameStructure) quickSave();
          else build();
        }}
      >
        <fieldset className="fs">
          <legend>La course</legend>
          <div className="seg" role="group" aria-label="Type de course">
            {(['road', 'trail'] as const).map((s) => (
              <button key={s} type="button" aria-pressed={sport === s} onClick={() => (setSport(s), setPreview(null))}>
                {s === 'road' ? 'Route' : 'Trail'}
              </button>
            ))}
          </div>
          <label className="field">
            <span>Nom</span>
            <input type="text" value={name} placeholder={sport === 'road' ? 'Semi-marathon de Lyon' : 'Trail des Aiguilles'} onChange={(e) => setName(e.target.value)} />
          </label>
          {sport === 'road' && (
            <div className="seg" role="group" aria-label="Distance">
              {ROAD_PRESETS.map((p) => (
                <button key={p.label} type="button" aria-pressed={Math.abs(km - p.km) < 0.01} onClick={() => (setDistance(String(p.km)), setPreview(null))}>
                  {p.label}
                </button>
              ))}
            </div>
          )}
          <div className="grid-2">
            <label className="field">
              <span>Distance (km)</span>
              <input type="number" inputMode="decimal" min={1} step="any" value={distance} onChange={(e) => (setDistance(e.target.value), setPreview(null))} />
            </label>
            {sport === 'trail' && (
              <label className="field">
                <span>Dénivelé positif (m)</span>
                <input type="number" inputMode="numeric" min={0} value={elevation} onChange={(e) => (setElevation(e.target.value), setPreview(null))} />
              </label>
            )}
            <label className="field">
              <span>Date</span>
              <input type="date" value={date} min={addDays(today(), 7)} onChange={(e) => (setDate(e.target.value), setPreview(null))} />
            </label>
            <label className="field">
              <span>Objectif chrono (facultatif)</span>
              <input type="text" value={target} placeholder="h:mm:ss" onChange={(e) => setTarget(e.target.value)} />
              {predicted > 0 && <span className="hint">Prédiction à ton niveau actuel : {formatClock(predicted)}</span>}
            </label>
          </div>
          {category && (
            <p className="small faint">
              Catégorie : {CATEGORY_LABEL[category]}.
            </p>
          )}
        </fieldset>

        <fieldset className="fs">
          <legend>Tes disponibilités</legend>
          <div className="field">
            <span>Jours où tu peux courir</span>
            <div className="days" role="group" aria-label="Jours d’entraînement">
              {WEEKDAYS_SHORT.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={days.includes(i)}
                  disabled={hardDays.has(i)}
                  onClick={() => toggleDay(i)}
                  title={sportOn(i).map((o) => `${o.sport} (${o.label ?? 'séance'})`).join(', ') || undefined}
                >
                  {d}
                  {sportOn(i).length > 0 && <small className="day-sport">{sportOn(i)[0].sport.slice(0, 4)}.</small>}
                </button>
              ))}
            </div>
            <span className="hint">
              {others.length
                ? `Jours de ${[...new Set(others.map((o) => o.sport))].join(', ')} intégrés (charge, récupération, pas de séance dure à côté). `
                : 'Tu pratiques un autre sport ? '}
              <Link to="/profil">{others.length ? 'Modifier' : 'Ajoute-le dans ton profil'}</Link>
              {others.length ? '' : ' : le plan en tiendra compte.'}
            </span>
          </div>
          <div className="grid-2">
            <label className="field">
              <span>Jour de la sortie longue</span>
              <select value={longDay} onChange={(e) => (setLongDay(Number(e.target.value)), setPreview(null))}>
                {days.map((d) => (
                  <option key={d} value={d}>
                    {WEEKDAYS[d]}
                  </option>
                ))}
              </select>
              {hardDays.has((longDay + 6) % 7) && (
                <span className="hint">Le lendemain d’une séance intense : elle restera en endurance pure. Un jour en milieu de semaine serait idéal.</span>
              )}
            </label>
            <label className="field">
              <span>Durée max en semaine (min)</span>
              <input type="number" inputMode="numeric" min={20} placeholder="Pas de limite" value={maxMin} onChange={(e) => (setMaxMin(e.target.value), setPreview(null))} />
            </label>
          </div>
          <div className="field">
            <span>Ton niveau</span>
            <div className="seg" role="group" aria-label="Niveau">
              {(
                [
                  ['debutant', 'Débutant'],
                  ['intermediaire', 'Intermédiaire'],
                  ['confirme', 'Confirmé'],
                ] as const
              ).map(([v, l]) => (
                <button key={v} type="button" aria-pressed={level === v} onClick={() => (setLevel(v), setPreview(null))}>
                  {l}
                </button>
              ))}
            </div>
            <span className="hint">
              Volume actuel détecté : {Math.round(profile.weeklyKm)} km/semaine, sortie longue {Math.round(profile.longRunKm)} km.
            </span>
          </div>
        </fieldset>

        {error && <p className="notice error">{error}</p>}
        <div className="row">
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {sameStructure ? 'Enregistrer' : preview ? 'Recalculer l’aperçu' : 'Voir l’aperçu du plan'}
          </button>
          {edit && (
            <Link className="btn btn-ghost" to="/plan">
              Annuler
            </Link>
          )}
        </div>
      </form>

      {preview && (
        <section id="apercu" className="stack">
          <div className="section-title">
            <h2>
              {preview.weeks.length} semaines vers {preview.goal.name}
            </h2>
          </div>
          {aiState === 'running' && <AiProgress label="Le coach analyse tes 12 dernières semaines d’activités et ajuste le plan…" />}
          {aiState === 'error' && <p className="notice error">{aiError} Le plan ci-dessous est celui de l’algorithme seul.</p>}
          {aiState === 'done' && preview.ai && <AiAnalysis ai={preview.ai} title="Ce que le coach a ajusté" />}
          {aiStatus.enabled && !aiOn && (
            <div className="box">
              <label className="switch">
                <input type="checkbox" onChange={(e) => e.target.checked && enableAi()} />
                <span>
                  <b>Affiner ce plan avec le coach IA</b>
                  <br />
                  <span className="small muted">
                    Claude analyse tes activités Strava des 12 dernières semaines (volumes, intensités, meilleurs efforts, montée) et ajuste le plan. Tu peux
                    le désactiver à tout moment dans ton profil.
                  </span>
                </span>
              </label>
            </div>
          )}
          <PlanProfile weeks={preview.weeks} current={0} trail={preview.goal.sport === 'trail'} />
          <div className="facts">
            <div className="fact">
              <span className="v num">{peak} km</span>
              <span className="l">semaine la plus chargée</span>
            </div>
            <div className="fact">
              <span className="v num">{preview.weeks.reduce((s, w) => s + w.sessions.filter((x) => x.workout.type !== 'strength' && x.workout.type !== 'cross').length, 0)}</span>
              <span className="l">séances de course</span>
            </div>
            <div className="fact">
              <span className="v num">{preview.weeks.reduce((s, w) => s + w.sessions.filter((x) => x.workout.type === 'strength').length, 0)}</span>
              <span className="l">séances de renfo</span>
            </div>
            {(['base', 'build', 'specific', 'taper'] as const).map((ph) => {
              const n = preview.weeks.filter((w) => w.phase === ph).length;
              return n ? (
                <div className="fact" key={ph}>
                  <span className="v num">{n} sem.</span>
                  <span className="l">{PHASE_LABEL[ph].toLowerCase()}</span>
                </div>
              ) : null;
            })}
          </div>
          {preview.notes.map((n) => (
            <p key={n} className="notice">
              {n}
            </p>
          ))}
          {existing && (
            <p className="small faint">{edit ? 'Enregistrer remplace la version actuelle du plan.' : `Enregistrer remplace ton plan actuel (${existing.goal.name}).`}</p>
          )}
          <div className="row">
            <button
              className="btn btn-primary"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await savePlan(preview);
                  if (level !== saved?.level || !saved) await saveProfile({ ...(saved ?? { sport }), level, sport: saved?.sport ?? sport });
                  navigate('/plan');
                } catch (e) {
                  setError((e as Error).message);
                  setSaving(false);
                }
              }}
            >
              Enregistrer ce plan
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
