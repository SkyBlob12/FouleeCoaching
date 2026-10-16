/**
 * Modèle VDOT de Jack Daniels & Jimmy Gilbert (Oxygen Power, 1979).
 * v en m/min, t en minutes.
 */

export function vo2FromVelocity(v: number): number {
  return -4.6 + 0.182258 * v + 0.000104 * v * v;
}

export function velocityFromVo2(vo2: number): number {
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.6 - vo2;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

/** Fraction de VO2max soutenable pendant t minutes. */
export function fractionOfMax(tMin: number): number {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin);
}

export function vdotFromRace(distanceM: number, timeSec: number): number {
  const tMin = timeSec / 60;
  const v = distanceM / tMin;
  return vo2FromVelocity(v) / fractionOfMax(tMin);
}

/** Temps prédit (s) sur une distance pour un VDOT donné (bisection). */
export function predictTime(vdot: number, distanceM: number): number {
  let lo = 60;
  let hi = 60 * 60 * 48;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (vdotFromRace(distanceM, mid) > vdot) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Au-delà de ~3h30 la formule de Daniels devient trop optimiste :
 * on prolonge depuis le marathon avec la loi de Riegel, exposant 1.12
 * (les résultats ultra montrent une dégradation plus forte que le 1.06 historique).
 */
export function predictTimeLong(vdot: number, distanceM: number): number {
  const daniels = predictTime(vdot, distanceM);
  if (distanceM <= 42195) return daniels;
  const marathon = predictTime(vdot, 42195);
  return Math.max(daniels, marathon * Math.pow(distanceM / 42195, 1.12));
}

function paceAt(vdot: number, fraction: number): number {
  const v = velocityFromVo2(vdot * fraction); // m/min
  return 60000 / v; // s/km
}

export interface Paces {
  /** s/km */
  easySlow: number;
  easyFast: number;
  recovery: number;
  marathon: number;
  half: number;
  tenK: number;
  fiveK: number;
  threshold: number;
  interval: number;
  repetition: number;
}

export function trainingPaces(vdot: number): Paces {
  const easyFast = paceAt(vdot, 0.74);
  const easySlow = paceAt(vdot, 0.62);
  const interval = paceAt(vdot, 0.975);
  return {
    easyFast,
    easySlow,
    recovery: easySlow + 15,
    marathon: predictTime(vdot, 42195) / 42.195,
    half: predictTime(vdot, 21097.5) / 21.0975,
    tenK: predictTime(vdot, 10000) / 10,
    fiveK: predictTime(vdot, 5000) / 5,
    threshold: paceAt(vdot, 0.88),
    interval,
    // Daniels : R ≈ I − 6 s / 400 m
    repetition: interval - 15,
  };
}

export function clampVdot(v: number): number {
  return Math.min(85, Math.max(20, v));
}

/**
 * VMA « à la française » (vitesse tenue ~6 min, test demi-Cooper), en km/h.
 * C'est la référence des plans Campus Coach et des clubs FFA.
 */
export function vmaFromVdot(vdot: number): number {
  let lo = 500;
  let hi = 3000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (predictTime(vdot, mid) < 360) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2 / 360) * 3.6;
}

export function vdotFromVma(vmaKmh: number): number {
  return vdotFromRace((vmaKmh / 3.6) * 360, 360);
}

/** % de VMA correspondant à une allure (s/km). */
export function pctVma(paceSecPerKm: number, vmaKmh: number): number {
  return (3600 / paceSecPerKm / vmaKmh) * 100;
}
