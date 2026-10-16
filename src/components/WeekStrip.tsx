import {
  addDays,
  estimateWorkout,
  formatDuration,
  SESSION_TYPE_LABEL,
  type ActivitySummary,
  type SessionFeedback,
} from '@engine';
import { runsOn, statusOf, TYPE_COLOR, WEEKDAYS_SHORT, type AnySession } from '../lib/sessions';

interface Props {
  weekStart: string;
  sessions: AnySession[];
  activities: ActivitySummary[];
  today: string;
  vdot: number;
  selected?: string;
  onSelect?: (date: string) => void;
  feedback?: SessionFeedback[];
}

/** La semaine en 7 cellules de grille : le jour même en aplat rouge, les autres sports hachurés. */
export function WeekStrip({ weekStart, sessions, activities, today, vdot, selected, onSelect, feedback }: Props) {
  return (
    <div className="weekstrip" role="list">
      {Array.from({ length: 7 }, (_, i) => {
        const date = addDays(weekStart, i);
        const day = sessions.filter((x) => x.date === date);
        const run = day.find((x) => x.workout.type !== 'strength' && x.workout.type !== 'cross');
        const cross = day.find((x) => x.workout.type === 'cross');
        const strength = day.some((x) => x.workout.type === 'strength');
        const status = run ? statusOf(run, activities, today, feedback) : runsOn(activities, date).length ? 'done' : null;
        const main = run ?? cross;
        const sport = main?.workout.cross?.sport ?? '';
        const label = main ? (main.workout.type === 'cross' ? sport.charAt(0).toUpperCase() + sport.slice(1) : SESSION_TYPE_LABEL[main.workout.type]) : 'Repos';
        const dur = main ? formatDuration(estimateWorkout(main.workout, vdot).durationSec) : '';
        return (
          <button
            key={date}
            type="button"
            role="listitem"
            className="wday"
            aria-pressed={selected === date}
            data-today={date === today || undefined}
            data-cross={(!run && cross && date !== today) || undefined}
            onClick={() => onSelect?.(date)}
            aria-label={`${WEEKDAYS_SHORT[i]} ${Number(date.slice(8))} : ${day.map((x) => x.workout.title).join(', ') || 'repos'}`}
          >
            <span className="wday-zone" style={{ background: main ? TYPE_COLOR[main.workout.type] : 'transparent' }} aria-hidden />
            <span className="wday-name">{WEEKDAYS_SHORT[i]}</span>
            <span className="wday-num">{Number(date.slice(8))}</span>
            <span className="wday-what">
              {label}
              {strength && run ? ', renfo' : ''}
              {dur && <small>{dur}</small>}
            </span>
            <span className="wday-mark">{status === 'done' ? 'Fait' : status === 'missed' ? 'Manqué' : ''}</span>
          </button>
        );
      })}
    </div>
  );
}
