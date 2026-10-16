import { describe, expect, it } from 'vitest';
import {
  assignDays,
  buildCourse,
  categorize,
  estimateWorkout,
  fitnessSeries,
  formatPace,
  generatePlan,
  gradeFactor,
  parseGpx,
  predictTime,
  predictTimeLong,
  trainingPaces,
  vdotFromRace,
  type AthleteProfile,
  analyzeFeedback,
  protectAfterPain,
  replanFuture,
  validateWorkout,
  vmaFromVdot,
  vdotFromVma,
  clampTuning,
  analyzeActivities,
  activityVo2,
  addDays,
  estimateFitness,
  velocityFromVo2,
  vo2Progression,
  vo2Samples,
  gapPace,
  type ActivitySummary,
} from './index';
import { declaredSamples, resolveProfile } from '../profile';

describe('VDOT (tables de Daniels)', () => {
  it('retrouve un VDOT de 50 sur 5 km en 19:57', () => {
    expect(vdotFromRace(5000, 19 * 60 + 57)).toBeCloseTo(50, 0);
  });

  it('prédit les temps de la table VDOT 50', () => {
    expect(predictTime(50, 10000)).toBeGreaterThan(41 * 60);
    expect(predictTime(50, 10000)).toBeLessThan(41 * 60 + 45);
    expect(predictTime(50, 42195)).toBeGreaterThan(3 * 3600 + 9 * 60);
    expect(predictTime(50, 42195)).toBeLessThan(3 * 3600 + 13 * 60);
  });

  it('donne des allures cohérentes à VDOT 50', () => {
    const p = trainingPaces(50);
    // Daniels : T ≈ 4:15/km, I ≈ 3:55/km
    expect(Math.abs(p.threshold - 255)).toBeLessThan(6);
    expect(Math.abs(p.interval - 235)).toBeLessThan(6);
    expect(p.easyFast).toBeGreaterThan(p.marathon);
    expect(p.easySlow).toBeGreaterThan(p.easyFast);
    expect(p.repetition).toBeLessThan(p.interval);
  });

  it('ralentit les prédictions ultra', () => {
    const t100 = predictTimeLong(50, 100000);
    expect(t100).toBeGreaterThan(predictTime(50, 100000));
    expect(t100 / 3600).toBeGreaterThan(8);
  });
});

describe('Charge et forme', () => {
  it('converge vers la charge quotidienne constante', () => {
    const loads = new Map<string, number>();
    const days: string[] = [];
    for (let i = 0; i < 200; i++) {
      const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
      days.push(d);
      loads.set(d, 50);
    }
    const s = fitnessSeries(loads, days[0], days[days.length - 1]);
    const last = s[s.length - 1];
    expect(last.ctl).toBeGreaterThan(48);
    expect(last.atl).toBeCloseTo(50, 0);
    expect(Math.abs(last.tsb)).toBeLessThan(2);
  });
});

describe('Pente', () => {
  it('pénalise les montées et plafonne le gain en descente', () => {
    expect(gradeFactor(0)).toBe(1);
    expect(gradeFactor(10)).toBeGreaterThan(1.35);
    expect(gradeFactor(-10)).toBeLessThan(1);
    expect(gradeFactor(-10)).toBeGreaterThan(0.85);
    expect(gradeFactor(-25)).toBeGreaterThan(1);
  });

  it('parse un GPX et calcule le D+', () => {
    const pts = Array.from({ length: 201 }, (_, i) => {
      const lat = 45 + i * 0.0001; // ~11 m par point
      const ele = 1000 + (i <= 100 ? i * 2 : (200 - i) * 2);
      return `<trkpt lat="${lat}" lon="6"><ele>${ele}</ele></trkpt>`;
    }).join('');
    const xml = `<gpx><wpt lat="45.01" lon="6"><name>Sommet</name></wpt><trk><trkseg>${pts}</trkseg></trk></gpx>`;
    const { track, waypoints } = parseGpx(xml);
    expect(track).toHaveLength(201);
    const c = buildCourse(track, waypoints);
    expect(c.distanceM).toBeGreaterThan(2000);
    expect(c.elevationGain).toBeGreaterThan(150);
    expect(c.eqDistanceM).toBeGreaterThan(c.distanceM);
    expect(c.waypoints[0].name).toBe('Sommet');
  });
});

const profile: AthleteProfile = { vdot: 48, level: 'intermediaire', weeklyKm: 35, longRunKm: 15, hrMax: 190, hrRest: 50 };

describe('Plan', () => {
  it('catégorise les courses', () => {
    expect(categorize({ sport: 'road', distanceKm: 21.1, elevationGain: 0 })).toBe('half');
    expect(categorize({ sport: 'trail', distanceKm: 42, elevationGain: 2500 })).toBe('trail_medium');
    expect(categorize({ sport: 'trail', distanceKm: 100, elevationGain: 6000 })).toBe('ultra');
  });

  it('espace les séances de qualité', () => {
    const { qualityDays } = assignDays([1, 3, 5, 6], 6, 'intermediaire');
    expect(qualityDays).toEqual([1, 3]);
  });

  it('génère un plan marathon périodisé', () => {
    const plan = generatePlan({
      profile,
      goal: { sport: 'road', name: 'Marathon de Paris', distanceKm: 42.195, elevationGain: 0, date: '2027-04-11' },
      availability: { days: [1, 3, 5, 6], longRunDay: 6 },
      startDate: '2026-12-14',
    });
    expect(plan.category).toBe('marathon');
    const phases = plan.weeks.map((w) => w.phase);
    expect(phases[0]).toBe('base');
    expect(phases.at(-1)).toBe('taper');
    expect(phases.filter((p) => p === 'taper')).toHaveLength(3);
    // progression ≤ 10 % par rapport à la dernière semaine de charge
    let lastLoad = plan.weeks[0].volumeKm;
    for (const w of plan.weeks.slice(1)) {
      expect(w.volumeKm).toBeLessThanOrEqual(Math.ceil(lastLoad * 1.1) + 1);
      if (!w.recovery) lastLoad = w.volumeKm;
    }
    expect(plan.weeks.some((w) => w.recovery)).toBe(true);
    const last = plan.weeks.at(-1)!;
    expect(last.sessions.at(-1)!.workout.type).toBe('race');
    expect(last.sessions.at(-1)!.date).toBe('2027-04-11');
    // jamais deux séances clés d'affilée hors enchaînement
    for (const w of plan.weeks) {
      const keyDates = w.sessions.filter((s) => s.key && s.workout.type !== 'race').map((s) => s.date);
      for (let i = 1; i < keyDates.length; i++) {
        const gap = (Date.parse(keyDates[i]) - Date.parse(keyDates[i - 1])) / 86400000;
        expect(gap).toBeGreaterThan(1);
      }
    }
  });

  it('respecte le volume visé à ±15 %', () => {
    const plan = generatePlan({
      profile,
      goal: { sport: 'road', name: '10 km', distanceKm: 10, elevationGain: 0, date: '2027-03-07' },
      availability: { days: [0, 2, 4, 6], longRunDay: 6 },
      startDate: '2026-12-14',
    });
    for (const w of plan.weeks.slice(1, -1)) {
      const km = w.sessions.reduce((s, x) => s + estimateWorkout(x.workout, profile.vdot).distanceM / 1000, 0);
      expect(km).toBeGreaterThan(w.volumeKm * 0.85);
      expect(km).toBeLessThan(w.volumeKm * 1.15);
    }
  });

  it('génère un plan trail avec D+ et enchaînements', () => {
    const plan = generatePlan({
      profile: { ...profile, weeklyKm: 50, level: 'confirme' },
      goal: { sport: 'trail', name: 'Maxi-Race', distanceKm: 85, elevationGain: 5200, date: '2027-05-29' },
      availability: { days: [1, 2, 3, 5, 6], longRunDay: 6 },
      startDate: '2026-12-14',
    });
    expect(plan.category).toBe('ultra');
    expect(plan.weeks.some((w) => w.elevationGain > 2000)).toBe(true);
    const types = plan.weeks.flatMap((w) => w.sessions.map((s) => s.workout.type));
    expect(types).toContain('long_hills');
    expect(types).toContain('downhill');
    expect(plan.weeks.some((w) => w.sessions.some((s) => s.workout.title.includes('J1')))).toBe(true);
  });
});

describe('Semaine entamée et footings', () => {
  const plan = generatePlan({
    profile: { ...profile, weeklyKm: 35 },
    goal: { sport: 'trail', name: 'T', distanceKm: 45, elevationGain: 2800, date: '2027-04-25' },
    availability: { days: [1, 3, 4, 6], longRunDay: 6 },
    startDate: '2026-10-16', // un vendredi
  });

  it('réduit le volume de la première semaine au prorata', () => {
    expect(plan.weeks[0].sessions.every((s) => s.date >= '2026-10-16')).toBe(true);
    expect(plan.weeks[0].volumeKm).toBeLessThan(plan.weeks[1].volumeKm * 0.75);
  });

  it('ne programme jamais un footing plus long que 65 % de la sortie longue', () => {
    for (const w of plan.weeks.slice(0, -1)) {
      const long = w.sessions.find((s) => s.workout.type === 'long');
      if (!long) continue;
      const longDur = estimateWorkout(long.workout, profile.vdot).durationSec;
      for (const s of w.sessions.filter((x) => x.workout.type === 'easy' && x.workout.blocks.length === 1)) {
        expect(estimateWorkout(s.workout, profile.vdot).durationSec).toBeLessThanOrEqual(longDur * 0.75);
      }
    }
  });
});

it('formate les allures', () => {
  expect(formatPace(255)).toBe('4:15');
  expect(formatPace(299.6)).toBe('5:00');
});

describe('Autres sports, renfo et adaptation', () => {
  const handball = [
    { sport: 'handball', day: 4, intensity: 'high' as const, durationMin: 90, label: 'Entraînement' },
    { sport: 'handball', day: 5, intensity: 'high' as const, durationMin: 60, label: 'Match' },
  ];
  const plan = generatePlan({
    profile,
    goal: { sport: 'road', name: 'Semi', distanceKm: 21.1, elevationGain: 0, date: '2027-04-11' },
    availability: { days: [0, 1, 2, 3, 6], longRunDay: 6 },
    startDate: '2026-12-14',
    extras: { otherSports: handball, strength: 'auto', fragile: ['genou'] },
  });

  it('place le handball et ne met aucune séance dure à côté', () => {
    for (const w of plan.weeks.slice(0, -1)) {
      const cross = w.sessions.filter((s) => s.workout.type === 'cross');
      expect(cross.length).toBeGreaterThanOrEqual(1);
      const hardRun = w.sessions.filter((s) => s.key && s.workout.type !== 'long' && s.workout.type !== 'race');
      for (const s of hardRun) {
        const dow = (new Date(s.date + 'T00:00:00Z').getUTCDay() + 6) % 7;
        expect([3, 4, 5, 6]).not.toContain(dow); // ni jeudi (veille), ni vendredi/samedi, ni dimanche
      }
    }
    expect(plan.notes.join(' ')).toContain('points de charge');
  });

  it('ajoute du renforcement, jamais un jour de handball ni en semaine de course', () => {
    const strength = plan.weeks.flatMap((w) => w.sessions).filter((s) => s.workout.type === 'strength');
    expect(strength.length).toBeGreaterThan(10);
    for (const s of strength) {
      const dow = (new Date(s.date + 'T00:00:00Z').getUTCDay() + 6) % 7;
      expect([4, 5]).not.toContain(dow);
      expect(s.workout.exercises!.some((e) => e.name.includes('Step-down') || e.name.includes('Clamshell'))).toBe(true);
    }
    expect(plan.weeks.at(-1)!.sessions.some((s) => s.workout.type === 'strength')).toBe(false);
  });

  it('relève les allures si la qualité paraît facile', () => {
    const fb = [
      { key: 'a', date: '2027-01-05', done: true, feel: 2 as const, type: 'intervals' as const },
      { key: 'b', date: '2027-01-12', done: true, feel: 1 as const, type: 'threshold' as const },
    ];
    const a = analyzeFeedback(fb, [], new Set(), '2027-01-14');
    expect(a.vdotDelta).toBeGreaterThan(0);
  });

  it('réduit et protège après une douleur', () => {
    const fb = [{ key: 'x', date: '2027-01-13', done: true, feel: 4 as const, pain: 2 as const, painZone: 'genou' }];
    const a = analyzeFeedback(fb, [], new Set(), '2027-01-14');
    expect(a.volumeFactor).toBeLessThan(1);
    const protectedPlan = protectAfterPain(plan, a.pain!, 48, '2027-01-14');
    const next3 = protectedPlan.weeks.flatMap((w) => w.sessions).filter((s) => s.date >= '2027-01-14' && s.date <= '2027-01-17');
    expect(next3.some((s) => ['intervals', 'threshold', 'race_pace', 'hills'].includes(s.workout.type))).toBe(false);
  });

  it('recalcule le futur sans toucher au passé ni aux phases', () => {
    const re = replanFuture(plan, { profile: { ...profile, vdot: 49 } }, { volumeFactor: 0.9 }, '2027-01-14');
    expect(re.weeks).toHaveLength(plan.weeks.length);
    expect(re.weeks.map((w) => w.phase)).toEqual(plan.weeks.map((w) => w.phase));
    const cur = plan.weeks.findIndex((w) => w.startDate === '2027-01-11');
    expect(re.weeks[cur]).toEqual(plan.weeks[cur]);
    expect(re.weeks[cur + 2].volumeKm).toBeLessThanOrEqual(plan.weeks[cur + 2].volumeKm);
    // pas d'effondrement du volume au redémarrage
    expect(re.weeks[cur + 1].volumeKm).toBeGreaterThan(plan.weeks[cur + 1].volumeKm * 0.8);
  });

  it('recalcule correctement après une première semaine entamée', () => {
    const p2 = generatePlan({
      profile,
      goal: { sport: 'trail', name: 'T', distanceKm: 45, elevationGain: 2800, date: '2027-04-25' },
      availability: { days: [0, 1, 2, 3, 6], longRunDay: 6 },
      startDate: '2026-10-16',
      extras: { otherSports: handball },
    });
    const re = replanFuture(p2, { profile }, { volumeFactor: 1 }, '2026-10-16');
    expect(re.weeks[1].volumeKm).toBeGreaterThan(p2.weeks[1].volumeKm * 0.9);
  });

  it('valide les séances venant de Claude', () => {
    expect(validateWorkout({ type: 'threshold', title: 'Seuil', purpose: '', blocks: [{ repeat: 3, steps: [{ kind: 'work', intensity: 'threshold', durationSec: 600 }] }] })).toEqual([]);
    expect(validateWorkout({ type: 'nope', title: '', blocks: [] }).length).toBeGreaterThan(0);
  });

  it('convertit VDOT et VMA', () => {
    const vma = vmaFromVdot(50);
    expect(vma).toBeGreaterThan(16);
    expect(vma).toBeLessThan(17.5);
    expect(vdotFromVma(vma)).toBeCloseTo(50, 1);
  });
});

describe('Réglages IA du plan et analyse des activités', () => {
  const base = {
    profile,
    goal: { sport: 'trail' as const, name: 'T', distanceKm: 45, elevationGain: 2800, date: '2027-04-25' },
    availability: { days: [0, 1, 2, 3, 6], longRunDay: 6 },
    startDate: '2026-12-14',
  };

  it('borne les réglages proposés par l’IA', () => {
    const t = clampTuning({ vdot: 70, peakFactor: 3, startVolumeKm: 500, qualityPerWeek: 5 as 1, cycleWeeks: 7 as 3, emphasis: 'nimporte' as 'seuil' }, { vdot: 48 });
    expect(t.vdot).toBe(52);
    expect(t.peakFactor).toBe(1.2);
    expect(t.startVolumeKm).toBe(160);
    expect(t.qualityPerWeek).toBeUndefined();
    expect(t.cycleWeeks).toBeUndefined();
    expect(t.emphasis).toBeUndefined();
  });

  it('applique un cycle de 3 semaines et une seule séance dure', () => {
    const plan = generatePlan({ ...base, tuning: { cycleWeeks: 3, qualityPerWeek: 1 } });
    const recov = plan.weeks.filter((w) => w.recovery).map((w) => w.index);
    expect(recov.slice(0, 3)).toEqual([2, 5, 8]);
    const hard = ['intervals', 'threshold', 'race_pace', 'hills', 'long_hills', 'repetition', 'fartlek', 'downhill', 'test'];
    for (const w of plan.weeks.slice(1, -3)) expect(w.sessions.filter((s) => hard.includes(s.workout.type)).length).toBeLessThanOrEqual(1);
    expect(plan.tuning?.cycleWeeks).toBe(3);
  });

  it('oriente la deuxième séance selon l’accent choisi', () => {
    const plan = generatePlan({ ...base, availability: { days: [0, 1, 3, 4, 6], longRunDay: 6 }, tuning: { emphasis: 'montee', qualityPerWeek: 2 } });
    const types = plan.weeks.filter((w) => w.phase === 'build' && !w.recovery).flatMap((w) => w.sessions.map((s) => s.workout.type));
    expect(types.filter((t) => t === 'long_hills').length).toBeGreaterThan(types.filter((t) => t === 'intervals').length);
  });

  it('résume les activités : volumes, intensités, tours de qualité, meilleurs efforts', () => {
    const acts = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      name: i % 3 === 0 ? 'Fractionné' : 'Footing',
      sportType: i % 5 === 4 ? 'TrailRun' : 'Run',
      startDate: new Date(Date.UTC(2026, 7, 1 + i * 2)).toISOString().slice(0, 10),
      movingTimeSec: 3000,
      elapsedTimeSec: 3100,
      distanceM: 10000,
      elevationGain: i % 5 === 4 ? 600 : 50,
      avgHr: i % 3 === 0 ? 162 : 140,
    }));
    const details = [{ id: 3, laps: [{ distanceM: 2000, movingTimeSec: 660 }, ...Array.from({ length: 6 }, () => [{ distanceM: 800, movingTimeSec: 195, avgHr: 170 }, { distanceM: 300, movingTimeSec: 110 }]).flat()], bestEfforts: [{ name: '5K', distanceM: 5000, movingTimeSec: 1290 }] }];
    const a = analyzeActivities(acts, details, profile, '2026-10-16');
    expect(a.semaines).toHaveLength(12);
    expect(a.intensite!.facile_pct + a.intensite!.modere_pct + a.intensite!.dur_pct).toBeGreaterThanOrEqual(99);
    expect(a.seances_qualite[0].tours).toMatch(/6 × ~800 m/);
    expect(a.meilleurs_efforts[0].effort).toBe('5K');
    expect(a.montee?.sorties_vallonnees).toBeGreaterThan(0);
  });
});

describe('Niveau : moyenne des dernières sorties', () => {
  const hr = { hrMax: 190, hrRest: 50 };
  // sortie cohérente avec un VDOT donné, courue à une fraction de FC de réserve donnée (Swain)
  const run = (date: string, vdot: number, frac: number, extra: Partial<ActivitySummary> = {}): ActivitySummary => {
    const vo2 = 3.5 + frac * (vdot / 0.95 - 3.5);
    const v = velocityFromVo2(vo2);
    return {
      id: Number(date.replaceAll('-', '')),
      name: 'Footing',
      sportType: 'Run',
      startDate: date,
      movingTimeSec: 45 * 60,
      elapsedTimeSec: 45 * 60,
      distanceM: Math.round(v * 45),
      elevationGain: 0,
      avgHr: Math.round(hr.hrRest + frac * (hr.hrMax - hr.hrRest)),
      maxHr: 185,
      ...extra,
    };
  };
  const days = (n: number, from = '2026-09-01') => Array.from({ length: n }, (_, i) => addDays(from, i * 3));

  it('tire une VO2 max d’une sortie facile grâce à la FC', () => {
    expect(activityVo2(run('2026-09-01', 50, 0.68), hr)!.vdot).toBeCloseTo(50, 0);
    expect(activityVo2(run('2026-09-01', 50, 0.85), hr)!.vdot).toBeCloseTo(50, 0);
    expect(activityVo2(run('2026-09-01', 50, 0.68, { movingTimeSec: 600 }), hr)).toBeNull();
  });

  it('moyenne les 10 dernières mesures sans qu’une course isolée ne dicte le niveau', () => {
    const acts = days(12).map((d, i) => run(d, 50, 0.65 + (i % 4) * 0.07));
    // une course exceptionnelle, ancienne règle : elle aurait fixé toutes les allures
    acts.push({ ...run('2026-10-05', 50, 0.9), name: '10 km', isRace: true, distanceM: 10000, movingTimeSec: 38 * 60, avgHr: 178 });
    const e = estimateFitness(acts, '2026-10-10', { hrMax: 190, hrRest: 50 });
    expect(e.source).toBe('activities');
    expect(e.samples).toHaveLength(10);
    expect(vdotFromRace(10000, 38 * 60)).toBeGreaterThan(54);
    expect(e.vdot).toBeGreaterThan(49);
    expect(e.vdot).toBeLessThan(51.5);
  });

  it('estime la FC seuil sur la droite FC / vitesse', () => {
    const acts = days(10).map((d, i) => run(d, 50, 0.62 + (i % 5) * 0.06));
    const e = estimateFitness(acts, '2026-10-10', { hrMax: 190, hrRest: 50 });
    // 88 % de VO2 max au seuil → environ 82 % de la FC de réserve
    expect(e.lthr).toBeGreaterThan(162);
    expect(e.lthr).toBeLessThan(169);
  });

  it('suit la progression quand l’allure progresse à FC égale', () => {
    const acts = days(30, '2026-06-01').map((d, i) => run(d, 45 + i * 0.2, 0.7 + (i % 3) * 0.05));
    const samples = vo2Samples(acts, { hrMax: 190, hrRest: 50 });
    const pts = vo2Progression(samples, hr);
    expect(pts[0].vdot).toBeLessThan(47);
    expect(pts.at(-1)!.vdot).toBeGreaterThan(48);
    expect(pts.at(-1)!.vdot).toBeLessThan(51);
  });

  it('compte la course et le test déclarés comme des mesures', () => {
    const acts = days(2).map((d) => run(d, 50, 0.7));
    const declared = declaredSamples({ level: 'intermediaire', sport: 'road', vmaTest: { distanceM: 1700, date: '2026-09-08' } });
    const e = estimateFitness(acts, '2026-09-10', { hrMax: 190, hrRest: 50 }, declared);
    expect(e.source).toBe('activities');
    expect(e.samples.map((s) => s.method)).toContain('vma_test');
    expect(resolveProfile({ level: 'intermediaire', sport: 'road' }, e, '2026-09-10').vdotSource).toBe('activities');
  });
});

describe('VAP (vitesse ajustée à la pente)', () => {
  it('estime une allure à plat plus rapide en trail et reprend celle de Strava si elle est connue', () => {
    const trail = { distanceM: 18000, elevationGain: 810, movingTimeSec: 18 * 400 };
    const g = gapPace(trail)!;
    expect(g.estimated).toBe(true);
    expect(g.pace).toBeLessThan(400);
    expect(g.pace).toBeGreaterThan(320);
    expect(gapPace(trail, 1000 / 345)).toEqual({ pace: 345, estimated: false });
    expect(gapPace({ distanceM: 10000, elevationGain: 40, movingTimeSec: 3000 })).toBeNull();
  });
});
