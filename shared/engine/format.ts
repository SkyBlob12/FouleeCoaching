export function formatPace(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return '–';
  let m = Math.floor(secPerKm / 60);
  let s = Math.round(secPerKm - m * 60);
  if (s === 60) {
    m += 1;
    s = 0;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatPaceRange([slow, fast]: [number, number]): string {
  return `${formatPace(fast)}–${formatPace(slow)}`;
}

export function formatDuration(sec: number): string {
  const t = Math.round(sec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h) return `${h} h ${String(m).padStart(2, '0')}`;
  if (m && s) return `${m}′${String(s).padStart(2, '0')}″`;
  if (m) return `${m} min`;
  return `${s}″`;
}

export function formatClock(sec: number): string {
  const t = Math.round(sec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function formatKm(m: number, digits = 1): string {
  const km = m / 1000;
  return `${km.toLocaleString('fr-FR', { maximumFractionDigits: km >= 20 ? 0 : digits })} km`;
}

export function parseClock(input: string): number | undefined {
  const parts = input.trim().split(/[:h'′"″\s]+/).filter(Boolean).map(Number);
  if (!parts.length || parts.some((x) => !Number.isFinite(x))) return undefined;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 60;
}
