/**
 * Allure ajustée à la pente (GAP) et prédiction sur parcours.
 *
 * Courbe empirique : en montée elle suit le coût énergétique de Minetti (2002)
 * aux fortes pentes, mais pénalise moins les pentes modérées (comme le modèle
 * GAP de Strava, 2017, calé sur la FC). En descente, le gain plafonne vers −10 %
 * puis redevient un coût (freinage) au-delà de −20 %.
 */
export function gradeFactor(gradePct: number): number {
  const g = Math.max(-40, Math.min(45, gradePct));
  if (g >= 0) return 1 + 0.0358 * g + 0.000917 * g * g;
  return 1 + 0.018 * g + 0.0009 * g * g;
}

/** En dessous, la pente ne change presque rien à l'allure : on n'affiche pas de VAP. */
export const VAP_MIN_M_PER_KM = 15;

/**
 * VAP (vitesse ajustée à la pente, la « GAP » de Strava), en s/km : l'allure qu'aurait donnée le même effort sur le plat.
 * Avec la VAP de Strava (calculée kilomètre par kilomètre sur le relief réel) quand elle est connue ;
 * sinon estimée depuis le D+ seul, en supposant une boucle : moitié en montée, moitié en descente à pente constante.
 */
export function gapPace(
  a: { distanceM: number; elevationGain: number; movingTimeSec: number },
  stravaGapSpeed?: number,
): { pace: number; estimated: boolean } | null {
  if (a.distanceM <= 0 || a.movingTimeSec <= 0 || a.elevationGain / (a.distanceM / 1000) < VAP_MIN_M_PER_KM) return null;
  if (stravaGapSpeed && stravaGapSpeed > 0) return { pace: 1000 / stravaGapSpeed, estimated: false };
  const half = a.distanceM / 2;
  const grade = (a.elevationGain / half) * 100;
  const flatM = half * gradeFactor(grade) + half * gradeFactor(-grade);
  return { pace: a.movingTimeSec / (flatM / 1000), estimated: true };
}

export function kmEffort(distanceKm: number, elevationGain: number): number {
  return distanceKm + elevationGain / 100;
}

export interface TrackPoint {
  lat: number;
  lon: number;
  ele: number;
}

export interface Waypoint {
  name: string;
  lat: number;
  lon: number;
}

export interface CoursePoint {
  distM: number;
  ele: number;
  eqDistM: number; // distance équivalent plat cumulée
}

export interface Course {
  points: CoursePoint[];
  distanceM: number;
  elevationGain: number;
  elevationLoss: number;
  eqDistanceM: number;
  waypoints: { name: string; distM: number }[];
}

function haversine(a: TrackPoint | Waypoint, b: TrackPoint | Waypoint): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Parse un GPX sans dépendance (trkpt/rtept + wpt). */
export function parseGpx(xml: string): { track: TrackPoint[]; waypoints: Waypoint[]; name?: string } {
  const track: TrackPoint[] = [];
  const waypoints: Waypoint[] = [];
  const ptRe = /<(trkpt|rtept|wpt)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g;
  let m: RegExpExecArray | null;
  while ((m = ptRe.exec(xml))) {
    const attrs = m[2];
    const body = m[4] ?? '';
    const lat = Number(/lat\s*=\s*["']([-\d.]+)["']/.exec(attrs)?.[1]);
    const lon = Number(/lon\s*=\s*["']([-\d.]+)["']/.exec(attrs)?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (m[1] === 'wpt') {
      const name = /<name>([\s\S]*?)<\/name>/.exec(body)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim();
      waypoints.push({ name: name || `Point ${waypoints.length + 1}`, lat, lon });
    } else {
      const ele = Number(/<ele>([-\d.]+)<\/ele>/.exec(body)?.[1]);
      track.push({ lat, lon, ele: Number.isFinite(ele) ? ele : NaN });
    }
  }
  const name = /<(?:trk|metadata)>[\s\S]*?<name>([\s\S]*?)<\/name>/.exec(xml)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim();
  return { track, waypoints, name: name || undefined };
}

/** Construit le profil : lissage altimétrique sur ~100 m, puis distance équivalent plat. */
export function buildCourse(track: TrackPoint[], waypoints: Waypoint[] = []): Course {
  if (track.length < 2) throw new Error('Trace trop courte');
  const hasEle = track.some((p) => Number.isFinite(p.ele));
  const raw = track.map((p) => ({ ...p, ele: Number.isFinite(p.ele) ? p.ele : 0 }));

  const cum: number[] = [0];
  for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + haversine(raw[i - 1], raw[i]));

  // lissage par fenêtre de distance (±50 m) pour éviter le bruit GPS sur le D+
  const smooth: number[] = [];
  let lo = 0;
  let hi = 0;
  let sum = 0;
  for (let i = 0; i < raw.length; i++) {
    while (hi < raw.length && cum[hi] - cum[i] <= 50) sum += raw[hi++].ele;
    while (cum[i] - cum[lo] > 50) sum -= raw[lo++].ele;
    smooth.push(sum / (hi - lo));
  }

  // rééchantillonnage tous les ~25 m pour des pentes stables
  const points: CoursePoint[] = [{ distM: 0, ele: smooth[0], eqDistM: 0 }];
  let gain = 0;
  let loss = 0;
  let eq = 0;
  let lastD = 0;
  let lastE = smooth[0];
  for (let i = 1; i < raw.length; i++) {
    const seg = cum[i] - lastD;
    if (seg < 25 && i < raw.length - 1) continue;
    const dEle = hasEle ? smooth[i] - lastE : 0;
    if (dEle > 0) gain += dEle;
    else loss -= dEle;
    const grade = seg > 0 ? (dEle / seg) * 100 : 0;
    eq += seg * gradeFactor(grade);
    lastD = cum[i];
    lastE = smooth[i];
    points.push({ distM: lastD, ele: lastE, eqDistM: eq });
  }

  const wps = waypoints
    .map((w) => {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < raw.length; i++) {
        const d = haversine(raw[i], w);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return { name: w.name, distM: cum[best], off: bestD };
    })
    .filter((w) => w.off < 300)
    .sort((a, b) => a.distM - b.distM)
    .map(({ name, distM }) => ({ name, distM }));

  return {
    points,
    distanceM: cum[cum.length - 1],
    elevationGain: gain,
    elevationLoss: loss,
    eqDistanceM: eq,
    waypoints: wps,
  };
}

export interface Split {
  name: string;
  distM: number;
  ele: number;
  timeSec: number;
}

/**
 * Prédit les temps de passage. totalTimeSec = temps prévu pour la distance équivalent plat ;
 * chaque point reçoit une part proportionnelle à sa distance équivalente,
 * avec une dérive de fatigue (on ralentit progressivement sur le long).
 */
export function predictSplits(course: Course, totalTimeSec: number, everyM = 5000): Split[] {
  const fatigue = (x: number) => x + 0.12 * x * x; // x ∈ [0,1], ralentissement croissant
  const norm = fatigue(1);
  const timeAt = (eqD: number) => (fatigue(eqD / course.eqDistanceM) / norm) * totalTimeSec;
  const at = (distM: number) => {
    const pts = course.points;
    let i = pts.findIndex((p) => p.distM >= distM);
    if (i <= 0) i = i === 0 ? 0 : pts.length - 1;
    return pts[i];
  };
  const marks: { name: string; distM: number }[] = course.waypoints.length
    ? course.waypoints
    : Array.from({ length: Math.floor(course.distanceM / everyM) }, (_, k) => ({
        name: `km ${((k + 1) * everyM) / 1000}`,
        distM: (k + 1) * everyM,
      }));
  const out = marks
    .filter((m) => m.distM > 0 && m.distM < course.distanceM - 200)
    .map((m) => {
      const p = at(m.distM);
      return { name: m.name, distM: m.distM, ele: p.ele, timeSec: timeAt(p.eqDistM) };
    });
  const last = course.points[course.points.length - 1];
  out.push({ name: 'Arrivée', distM: course.distanceM, ele: last.ele, timeSec: totalTimeSec });
  return out;
}
