import { useMemo, useState } from 'react';
import { analyzeFeedback, protectAfterPain, replanFuture, type Plan } from '@engine';
import { useReady } from '../lib/data';
import { today as todayIso } from '../lib/profile';
import { allSessions } from '../lib/sessions';

/** Propose les ajustements tirés des ressentis, à valider en un clic. */
export function AdaptationCard() {
  const { plan, sessions, feedback, activities, profile, saved, saveProfile, updatePlan } = useReady();
  const [busy, setBusy] = useState(false);
  const today = todayIso();

  const adaptation = useMemo(() => {
    if (!plan) return null;
    const since = plan.lastAdaptation;
    const fresh = feedback.filter((f) => !since || f.date > since);
    const planned = allSessions(plan, sessions).map((s) => ({ key: s.key, date: s.date, type: s.workout.type }));
    const runDates = new Set(activities.map((a) => a.startDate));
    const compliancePlanned = since ? planned.filter((p) => p.date > since) : planned;
    return analyzeFeedback(fresh, compliancePlanned, runDates, today);
  }, [plan, sessions, feedback, activities, today]);

  if (!plan || !adaptation?.replan) return null;

  const apply = async () => {
    setBusy(true);
    try {
      let next: Plan = plan;
      if (adaptation.pain) next = protectAfterPain(next, adaptation.pain, profile.vdot, today);
      if (adaptation.volumeFactor < 1 || adaptation.vdotDelta) {
        next = replanFuture(next, { profile: { ...profile, vdot: profile.vdot + adaptation.vdotDelta } }, adaptation, today);
      }
      if (adaptation.vdotDelta) {
        await saveProfile({ ...(saved ?? { level: profile.level, sport: profile.sport }), vdotOffset: Math.round(((saved?.vdotOffset ?? 0) + adaptation.vdotDelta) * 10) / 10 });
      }
      await updatePlan({
        ...next,
        id: plan.id,
        lastAdaptation: today,
        adaptations: [...(plan.adaptations ?? []), { date: today, reasons: adaptation.reasons }],
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel adapt" aria-live="polite">
      <h3>Ton plan peut s’adapter</h3>
      <ul className="adapt-list">
        {adaptation.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <div className="row">
        <button className="btn btn-primary" disabled={busy} onClick={apply}>
          Appliquer et recalculer
        </button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => updatePlan({ ...plan, lastAdaptation: today })}>
          Ignorer
        </button>
      </div>
    </section>
  );
}
