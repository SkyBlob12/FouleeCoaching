import type { AthleteProfile, Plan, Step, Workout } from './types';
import { formatPace } from './format';
import { resolveHr, targetFor } from './zones';

const KIND_LABEL: Record<Step['kind'], string> = {
  warmup: 'Échauffement',
  work: 'Effort',
  recovery: 'Récupération',
  cooldown: 'Retour au calme',
  steady: 'Continu',
};

function amount(s: Step): string {
  if (s.distanceM) return s.distanceM >= 1000 ? `${+(s.distanceM / 1000).toFixed(2)}km` : `${s.distanceM}mtr`;
  const sec = s.durationSec ?? 0;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  if (!m) return `${r}s`;
  return r ? `${m}m${r}s` : `${m}m`;
}

/**
 * Format texte du constructeur de séances intervals.icu
 * (coller dans intervals.icu → la séance part sur la montre Garmin/Coros/Suunto).
 */
export function toIntervalsText(w: Workout, profile: AthleteProfile): string {
  const { lthr } = resolveHr(profile);
  const line = (s: Step) => {
    const t = targetFor(s.intensity, profile, s.terrain);
    let target: string;
    if (t.pace) target = `${formatPace(t.pace[1])}-${formatPace(t.pace[0])}/km Pace`;
    else if (lthr && t.hr) target = `${Math.round((t.hr[0] / lthr) * 100)}-${Math.round((t.hr[1] / lthr) * 100)}% LTHR`;
    else target = `Z${t.zone} HR`;
    return `- ${amount(s)} ${target}${s.note ? ` ${s.note}` : ''}`;
  };
  return w.blocks
    .map((b) => {
      if (b.repeat > 1) return `${b.repeat}x\n${b.steps.map(line).join('\n')}`;
      const s = b.steps[0];
      return `${KIND_LABEL[s.kind]}\n${b.steps.map(line).join('\n')}`;
    })
    .join('\n\n');
}

const icsEscape = (x: string) => x.replace(/[\,;]/g, (m) => `\${m}`).replace(/\n/g, '\n');

/** Export calendrier (.ics) : une journée par séance. */
export function planToIcs(plan: Plan, extra: { date: string; workout: Workout }[] = [], describe?: (w: Workout) => string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const events = [...plan.weeks.flatMap((wk) => wk.sessions), ...extra].map((s, i) => {
    const d = s.date.replace(/-/g, '');
    const next = new Date(Date.parse(s.date + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10).replace(/-/g, '');
    return [
      'BEGIN:VEVENT',
      `UID:foulee-${d}-${i}@foulee`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d}`,
      `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${icsEscape(s.workout.title)}`,
      `DESCRIPTION:${icsEscape(describe ? describe(s.workout) : s.workout.purpose)}`,
      'END:VEVENT',
    ].join('\r\n');
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Foulee//Plan//FR', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR'].join('\r\n');
}
