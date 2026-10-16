import type { ActivitySummary } from '../shared/engine/estimate';
import type { ActivityDetail } from '../shared/engine/analysis';
import { addDays } from '../shared/engine/load';
import { gapPace } from '../shared/engine/gap';

/** Historique synthétique (mode démo local) : 20 semaines, 4–5 sorties, route et trail. */
export function demoActivities(today: string): ActivitySummary[] {
  const out: ActivitySummary[] = [];
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let d = 140; d >= 1; d--) {
    const date = addDays(today, -d);
    const dow = (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7;
    const week = Math.floor((140 - d) / 7);
    const ramp = 0.75 + week * 0.015;
    const recoveryWeek = week % 4 === 3;
    const f = (recoveryWeek ? 0.75 : 1) * ramp;
    let km = 0;
    let pace = 0;
    let elev = 0;
    let hr = 0;
    let name = '';
    let sport = 'Run';
    if (dow === 1) {
      km = 10 * f;
      pace = 278;
      hr = 158;
      name = 'Fractionné 6 × 800';
    } else if (dow === 3) {
      km = 8 * f;
      pace = 330;
      hr = 138;
      name = 'Footing';
    } else if (dow === 4 && rand() > 0.3) {
      km = 11 * f;
      pace = 298;
      hr = 152;
      name = 'Seuil 3 × 10′';
    } else if (dow === 6) {
      const trail = week % 2 === 0;
      km = (trail ? 18 : 17) * f;
      pace = trail ? 400 : 325;
      elev = trail ? km * 45 : 60;
      hr = trail ? 142 : 140;
      sport = trail ? 'TrailRun' : 'Run';
      name = trail ? 'Sortie longue au Salève' : 'Sortie longue';
    } else if (dow === 5 && rand() > 0.6) {
      sport = 'Ride';
      km = 35;
      pace = 120;
      hr = 125;
      name = 'Vélo';
    }
    if (!km) continue;
    const jitter = 0.97 + rand() * 0.06;
    // progression : la même FC à une allure de plus en plus rapide
    const gain = sport === 'Ride' ? 1 : 1.03 - week * 0.003;
    const moving = Math.round(km * pace * gain * jitter);
    out.push({
      id: 900000 + d,
      name,
      sportType: sport,
      startDate: date,
      movingTimeSec: moving,
      elapsedTimeSec: Math.round(moving * 1.04),
      distanceM: Math.round(km * 1000),
      elevationGain: Math.round(elev || km * 4),
      avgHr: Math.round(hr + (rand() - 0.5) * 6),
      maxHr: Math.round(hr + 18 + rand() * 8),
    });
  }
  // une course récente
  out.push({
    id: 899000,
    name: '10 km de la Ville',
    sportType: 'Run',
    startDate: addDays(today, -38),
    movingTimeSec: 44 * 60 + 12,
    elapsedTimeSec: 44 * 60 + 12,
    distanceM: 10000,
    elevationGain: 35,
    avgHr: 172,
    maxHr: 184,
    isRace: true,
  });
  return out.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** Détails synthétiques (tours, meilleurs efforts) pour le mode démo. */
export function demoDetails(activities: ActivitySummary[], count = 16): ActivityDetail[] {
  return activities
    .filter((a) => a.sportType !== 'Ride')
    .slice(-count)
    .map((a) => {
      const laps: ActivityDetail['laps'] = [];
      if (a.name.startsWith('Fractionné')) {
        laps.push({ distanceM: 3000, movingTimeSec: 990, avgHr: 140 });
        for (let i = 0; i < 6; i++) {
          laps.push({ distanceM: 800, movingTimeSec: 194 + (i % 3), avgHr: 168 + i });
          laps.push({ distanceM: 300, movingTimeSec: 110, avgHr: 150 });
        }
        laps.push({ distanceM: 2000, movingTimeSec: 680, avgHr: 142 });
      } else if (a.name.startsWith('Seuil')) {
        laps.push({ distanceM: 3000, movingTimeSec: 990, avgHr: 140 });
        for (let i = 0; i < 3; i++) {
          laps.push({ distanceM: 2350, movingTimeSec: 600, avgHr: 163 + i });
          laps.push({ distanceM: 350, movingTimeSec: 120, avgHr: 148 });
        }
        laps.push({ distanceM: 1600, movingTimeSec: 560, avgHr: 141 });
      } else {
        const km = Math.max(1, Math.round(a.distanceM / 1000));
        for (let i = 0; i < km; i++) laps.push({ distanceM: 1000, movingTimeSec: a.movingTimeSec / km, avgHr: a.avgHr, elevationGain: a.elevationGain / km });
      }
      const bestEfforts: ActivityDetail['bestEfforts'] = a.isRace
        ? [
            { name: '1K', distanceM: 1000, movingTimeSec: 256 },
            { name: '5K', distanceM: 5000, movingTimeSec: 1318 },
            { name: '10K', distanceM: 10000, movingTimeSec: a.movingTimeSec },
          ]
        : a.name.startsWith('Fractionné')
          ? [{ name: '1K', distanceM: 1000, movingTimeSec: 246 }]
          : [];
      // VAP « Strava » simulée sur les sorties vallonnées
      const gap = gapPace(a);
      return { id: a.id, laps, bestEfforts, gapSpeed: gap ? 1000 / (gap.pace * 0.98) : undefined };
    });
}
