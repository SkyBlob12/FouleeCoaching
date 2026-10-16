import {
  formatDuration,
  formatPaceRange,
  intensityLabel,
  pctVma,
  targetFor,
  vmaFromVdot,
  type AthleteProfile,
  type Step,
  type Workout,
} from '@engine';
import { INTENSITY_COLOR } from '../lib/sessions';

const KIND: Record<Step['kind'], string> = {
  warmup: 'Échauffement',
  work: '',
  recovery: 'Récup',
  cooldown: 'Retour au calme',
  steady: '',
};

function amount(s: Step) {
  if (s.distanceM) return s.distanceM >= 1000 ? `${(s.distanceM / 1000).toLocaleString('fr-FR')} km` : `${s.distanceM} m`;
  return formatDuration(s.durationSec ?? 0);
}

interface Props {
  workout: Workout;
  profile: AthleteProfile;
}

export function StepList({ workout, profile }: Props) {
  const vma = vmaFromVdot(profile.vdot);
  return (
    <ol className="steps">
      {workout.blocks.map((b, bi) => (
        <li key={bi} className={b.repeat > 1 ? 'steps-block repeat' : 'steps-block'}>
          {b.repeat > 1 && <div className="steps-repeat num">{b.repeat} ×</div>}
          <ul className="steps-inner">
            {b.steps.map((s, si) => {
              const t = targetFor(s.intensity, profile, s.terrain);
              const label = KIND[s.kind] || intensityLabel(s.intensity);
              return (
                <li key={si} className="step">
                  <span className="zone-dot" style={{ background: INTENSITY_COLOR[s.intensity] }} aria-hidden />
                  <div className="step-main">
                    <div className="step-title">
                      <span className="num step-amount">{amount(s)}</span>
                      <span>{label}</span>
                    </div>
                    {s.note && <div className="step-note">{s.note}</div>}
                  </div>
                  <div className="step-target">
                    {t.pace ? (
                      <span className="num step-pace">
                        {formatPaceRange(t.pace)}
                        <small> /km</small>
                      </span>
                    ) : (
                      <span className="step-pace soft">{s.intensity === 'race' ? 'Ton allure course' : `Effort ${t.rpe}`}</span>
                    )}
                    <span className="tnum faint small">
                      {t.pace && s.kind === 'work' ? `${Math.round(pctVma((t.pace[0] + t.pace[1]) / 2, vma))} % VMA` : ''}
                      {t.pace && s.kind === 'work' && t.hr ? ', ' : ''}
                      {t.hr ? `${t.hr[0]}–${t.hr[1]} bpm` : ''}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
}
