import type { Exercise } from '@engine';

function dose(e: Exercise) {
  const amount = e.reps ? `${e.reps}` : `${e.durationSec} s`;
  return `${e.sets} × ${amount}${e.perSide ? ' par côté' : ''}`;
}

export function ExerciseList({ exercises }: { exercises: Exercise[] }) {
  return (
    <ol className="exercises">
      {exercises.map((e, i) => (
        <li key={i} className="exercise">
          <span className="exercise-n num">{i + 1}</span>
          <div className="exercise-main">
            <div className="exercise-head">
              <span className="exercise-name">{e.name}</span>
              <span className="num exercise-dose">{dose(e)}</span>
            </div>
            <p className="exercise-cue">{e.cue}</p>
            <p className="small faint">
              {e.focus}, récup {e.restSec} s
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
