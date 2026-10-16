import type { AthleteProfile } from './types';
import type { ActivitySummary } from './estimate';
import { activityLoad, addDays, fitnessSeries, isRun, mondayOf } from './load';
import { resolveHr } from './zones';
import { vdotFromRace } from './vdot';
import { formatPace } from './format';

/** Détail d'une activité (tours et meilleurs efforts), récupéré pour les sorties récentes. */
export interface ActivityDetail {
  id: number;
  laps: { distanceM: number; movingTimeSec: number; avgHr?: number; elevationGain?: number }[];
  bestEfforts: { name: string; distanceM: number; movingTimeSec: number }[];
  /** VAP de Strava sur toute la sortie (m/s), tirée de ses splits au kilomètre */
  gapSpeed?: number;
}

export interface ActivityAnalysis {
  periode: { du: string; au: string };
  semaines: { debut: string; km: number; d_plus: number; heures: number; sorties: number; plus_longue_km: number }[];
  regularite: { sorties_par_semaine: number; semaines_sans_course: number };
  intensite?: { facile_pct: number; modere_pct: number; dur_pct: number };
  efficacite?: { metres_par_battement_recent: number; metres_par_battement_avant: number; evolution_pct: number };
  meilleurs_efforts: { effort: string; temps: string; date: string; vdot: number }[];
  montee?: { vitesse_montee_mediane_m_dplus_h: number; sorties_vallonnees: number };
  sorties_longues: { date: string; km: number; d_plus: number; duree_min: number; fc_moy?: number }[];
  seances_qualite: { date: string; nom: string; tours: string }[];
  charge: { forme_ctl: number; fatigue_atl: number; fraicheur_tsb: number; ratio_aigu_chronique?: number };
  autres_sports_4_semaines: { sport: string; heures: number }[];
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Résumé chiffré des 12 dernières semaines, calculé par l'algorithme.
 * C'est ce résumé (et non les données brutes) qui est transmis à l'IA.
 */
export function analyzeActivities(
  activities: ActivitySummary[],
  details: ActivityDetail[],
  profile: AthleteProfile,
  today: string,
): ActivityAnalysis {
  const from = addDays(mondayOf(today), -7 * 11);
  const recent = activities.filter((a) => a.startDate >= from && a.startDate <= today);
  const runs = recent.filter((a) => isRun(a.sportType));
  const { lthr } = resolveHr(profile);

  const semaines = Array.from({ length: 12 }, (_, i) => {
    const debut = addDays(from, i * 7);
    const fin = addDays(debut, 6);
    const w = runs.filter((a) => a.startDate >= debut && a.startDate <= fin);
    return {
      debut,
      km: r1(w.reduce((s, a) => s + a.distanceM, 0) / 1000),
      d_plus: Math.round(w.reduce((s, a) => s + a.elevationGain, 0)),
      heures: r1(w.reduce((s, a) => s + a.movingTimeSec, 0) / 3600),
      sorties: w.length,
      plus_longue_km: r1(Math.max(0, ...w.map((a) => a.distanceM / 1000))),
    };
  });

  // répartition d'intensité (pondérée par le temps) d'après la FC moyenne vs seuil
  let intensite: ActivityAnalysis['intensite'];
  const withHr = runs.filter((a) => a.avgHr);
  if (lthr && withHr.length >= 4) {
    const t = { e: 0, m: 0, h: 0 };
    for (const a of withHr) {
      const ratio = a.avgHr! / lthr;
      if (ratio < 0.89) t.e += a.movingTimeSec;
      else if (ratio < 0.95) t.m += a.movingTimeSec;
      else t.h += a.movingTimeSec;
    }
    const tot = t.e + t.m + t.h || 1;
    intensite = { facile_pct: Math.round((t.e / tot) * 100), modere_pct: Math.round((t.m / tot) * 100), dur_pct: Math.round((t.h / tot) * 100) };
  }

  // efficacité aérobie : mètres parcourus par battement sur les sorties faciles et plates
  let efficacite: ActivityAnalysis['efficacite'];
  if (lthr) {
    const easy = runs.filter((a) => a.avgHr && a.avgHr / lthr < 0.9 && a.elevationGain / Math.max(1, a.distanceM / 1000) < 20 && a.movingTimeSec > 1500);
    const mpb = (a: ActivitySummary) => a.distanceM / ((a.avgHr! * a.movingTimeSec) / 60);
    const cut = addDays(today, -28);
    const rec = easy.filter((a) => a.startDate >= cut).map(mpb);
    const old = easy.filter((a) => a.startDate < cut && a.startDate >= addDays(today, -56)).map(mpb);
    if (rec.length >= 2 && old.length >= 2) {
      const avg = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
      const a = avg(rec);
      const b = avg(old);
      efficacite = { metres_par_battement_recent: r1(a * 100) / 100, metres_par_battement_avant: r1(b * 100) / 100, evolution_pct: r1(((a - b) / b) * 100) };
    }
  }

  // meilleurs efforts (Strava best_efforts) → VDOT par distance
  const byName = new Map<string, { effort: string; temps: string; date: string; vdot: number; sec: number }>();
  for (const d of details) {
    const act = activities.find((a) => a.id === d.id);
    for (const e of d.bestEfforts) {
      if (e.distanceM < 1000) continue;
      const v = vdotFromRace(e.distanceM, e.movingTimeSec);
      const cur = byName.get(e.name);
      if (!cur || e.movingTimeSec < cur.sec) {
        byName.set(e.name, { effort: e.name, temps: fmtClock(e.movingTimeSec), date: act?.startDate ?? '', vdot: r1(v), sec: e.movingTimeSec });
      }
    }
  }
  const meilleurs_efforts = [...byName.values()].map(({ sec: _s, ...x }) => x).sort((a, b) => b.vdot - a.vdot).slice(0, 6);

  // vitesse ascensionnelle sur les sorties vallonnées (> 30 m D+ / km)
  let montee: ActivityAnalysis['montee'];
  const hilly = runs.filter((a) => a.elevationGain / Math.max(1, a.distanceM / 1000) > 30 && a.movingTimeSec > 1800);
  if (hilly.length) {
    const vam = hilly.map((a) => a.elevationGain / (a.movingTimeSec / 3600)).sort((a, b) => a - b);
    montee = { vitesse_montee_mediane_m_dplus_h: Math.round(vam[Math.floor(vam.length / 2)]), sorties_vallonnees: hilly.length };
  }

  const longues = [...runs].sort((a, b) => b.distanceM - a.distanceM).slice(0, 5);

  // séances de qualité lues dans les tours : tours rapides répétés
  const seances_qualite = details
    .map((d) => {
      const act = activities.find((a) => a.id === d.id);
      if (!act || !isRun(act.sportType)) return null;
      const laps = d.laps.filter((l) => l.distanceM > 150 && l.movingTimeSec > 30);
      if (laps.length < 3) return null;
      const paces = laps.map((l) => l.movingTimeSec / (l.distanceM / 1000));
      const median = [...paces].sort((a, b) => a - b)[Math.floor(paces.length / 2)];
      const fast = laps.filter((_, i) => paces[i] < median * 0.92);
      if (fast.length < 2) return null;
      const fp = fast.map((l) => l.movingTimeSec / (l.distanceM / 1000));
      const hr = fast.map((l) => l.avgHr).filter((x): x is number => !!x);
      const dist = Math.round(fast.reduce((s, l) => s + l.distanceM, 0) / fast.length);
      return {
        date: act.startDate,
        nom: act.name,
        tours: `${fast.length} × ~${dist} m à ${formatPace(Math.min(...fp))}–${formatPace(Math.max(...fp))}/km${hr.length ? `, FC ${Math.round(Math.min(...hr))}–${Math.round(Math.max(...hr))}` : ''}`,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .slice(0, 8);

  const loads = new Map<string, number>();
  for (const a of activities) loads.set(a.startDate, (loads.get(a.startDate) ?? 0) + activityLoad(a, profile));
  const series = fitnessSeries(loads, activities[0]?.startDate ?? from, today);
  const last = series.at(-1);

  const others = new Map<string, number>();
  for (const a of recent.filter((x) => !isRun(x.sportType) && x.startDate >= addDays(today, -28))) {
    others.set(a.sportType, (others.get(a.sportType) ?? 0) + a.movingTimeSec / 3600);
  }

  return {
    periode: { du: from, au: today },
    semaines,
    regularite: { sorties_par_semaine: r1(runs.length / 12), semaines_sans_course: semaines.filter((w) => w.sorties === 0).length },
    intensite,
    efficacite,
    meilleurs_efforts,
    montee,
    sorties_longues: longues.map((a) => ({
      date: a.startDate,
      km: r1(a.distanceM / 1000),
      d_plus: Math.round(a.elevationGain),
      duree_min: Math.round(a.movingTimeSec / 60),
      fc_moy: a.avgHr ? Math.round(a.avgHr) : undefined,
    })),
    seances_qualite,
    charge: {
      forme_ctl: Math.round(last?.ctl ?? 0),
      fatigue_atl: Math.round(last?.atl ?? 0),
      fraicheur_tsb: Math.round(last?.tsb ?? 0),
      ratio_aigu_chronique: last && last.ctl > 5 ? r1(last.atl / last.ctl) : undefined,
    },
    autres_sports_4_semaines: [...others].map(([sport, h]) => ({ sport, heures: r1(h) })),
  };
}

function fmtClock(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
