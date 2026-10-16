import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import {
  CROSS_LABEL,
  estimateWorkout,
  formatKm,
  toIntervalsText,
  type Workout,
} from '@engine';
import type { EffectiveProfile } from '../lib/profile';
import { ExerciseList } from './ExerciseList';
import { StepList } from './StepList';
import { WorkoutProfile } from './WorkoutProfile';
import { TYPE_COLOR } from '../lib/sessions';

interface Props {
  workout: Workout;
  profile: EffectiveProfile;
  headingLevel?: 1 | 2;
  children?: React.ReactNode;
}

export function SessionView({ workout, profile, headingLevel = 2, children }: Props) {
  const est = estimateWorkout(workout, profile.vdot);
  const H = headingLevel === 1 ? 'h1' : 'h2';
  const strength = workout.type === 'strength';
  const cross = workout.type === 'cross';

  return (
    <article className="session">
      <header className="session-head">
        <H className="session-title">{workout.title}</H>
        <p className="muted">{workout.purpose}</p>
      </header>

      <div className="page-num">
        <span className="hero-num" style={strength || cross ? undefined : { color: TYPE_COLOR[workout.type] }}>
          {Math.round(est.durationSec / 60)}
        </span>
        <div className="hero-unit">
          <b>min</b>
          <span>{strength ? 'échauffement compris' : 'durée estimée'}</span>
        </div>
      </div>

      {!strength && !cross && <WorkoutProfile workout={workout} vdot={profile.vdot} />}

      <p className="dataline">
        {[
          est.distanceM > 0 ? formatKm(est.distanceM) : null,
          workout.elevationGain ? `${workout.elevationGain} m de D+ visés` : null,
          cross && workout.cross ? `intensité ${CROSS_LABEL[workout.cross.intensity].toLowerCase()}` : null,
          `charge ${Math.round(est.load)}`,
        ]
          .filter(Boolean)
          .join(', ')}
        .
      </p>

      {strength && workout.exercises && <ExerciseList exercises={workout.exercises} />}
      {!strength && !cross && <StepList workout={workout} profile={profile} />}

      <div className="row session-actions">
        {!strength && !cross && <CopyIntervals workout={workout} profile={profile} />}
        {children}
      </div>
    </article>
  );
}

function CopyIntervals({ workout, profile }: { workout: Workout; profile: EffectiveProfile }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn btn-secondary"
      type="button"
      title="Colle ce texte dans le constructeur de séance d’intervals.icu pour l’envoyer sur ta montre"
      onClick={async () => {
        await navigator.clipboard.writeText(toIntervalsText(workout, profile));
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }}
    >
      {done ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
      {done ? 'Copié' : 'Copier pour intervals.icu'}
    </button>
  );
}
