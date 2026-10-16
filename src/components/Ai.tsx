import { useState } from 'react';
import { Link } from 'react-router';
import { Undo2 } from 'lucide-react';
import { addDays, mondayOf, type PlanAiReview, type WeekReview } from '@engine';
import { api } from '../lib/api';
import { useReady } from '../lib/data';
import { aiAllowed, today } from '../lib/profile';
import { AdaptationCard } from './AdaptationCard';

/** Ce que l'IA a analysé et décidé à la création du plan. */
export function AiAnalysis({ ai, title = 'Analyse du coach' }: { ai: PlanAiReview; title?: string }) {
  return (
    <section className="ai">
      <div className="ai-head">
        <h3>{title}</h3>
        <span className="small faint">{new Date(ai.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</span>
      </div>
      <div className="ai-body">
        <p>{ai.assessment}</p>
        {ai.decisions.length > 0 && (
          <table className="ai-decisions">
            <tbody>
              {ai.decisions.map((d, i) => (
                <tr key={i}>
                  <td>{d.topic}</td>
                  <td>
                    {d.choice}
                    <small>{d.why}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {ai.warnings.length > 0 && (
          <ul className="ai-warnings">
            {ai.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function AiProgress({ label }: { label: string }) {
  return (
    <div className="ai-progress" role="status">
      <span>{label}</span>
      <span className="bar" aria-hidden />
    </div>
  );
}

/**
 * Bilan de la semaine par l'IA (prévu / réalisé / ressentis → retouches de la semaine suivante).
 * Sans IA (pas de clé ou pas d'accord), on garde l'adaptation calculée par l'algorithme.
 */
export function WeekReviewPanel() {
  const { plan, saved, aiStatus, reload } = useReady();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  if (!plan) return null;
  const aiOn = aiStatus.enabled && aiAllowed(saved);
  if (!aiOn) {
    return (
      <>
        <AdaptationCard />
        {aiStatus.enabled && (
          <p className="small faint">
            <Link to="/profil#coach-ia">Active le coach IA</Link> pour un bilan hebdomadaire calculé sur tes activités.
          </p>
        )}
      </>
    );
  }

  const nextStart = addDays(mondayOf(today()), 7);
  const nextWeek = plan.weeks.find((w) => w.startDate === nextStart);
  const review: WeekReview | undefined = nextWeek ? plan.reviews?.find((r) => r.week === nextWeek.index) : undefined;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ skipped: string[] }>('/ai/review', { method: 'POST' });
      setSkipped(r.skipped);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const undo = async (runId: number) => {
    setBusy(true);
    try {
      await api(`/ai/undo/${runId}`, { method: 'POST' });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (busy && !review) return <AiProgress label="Le coach compare tes deux dernières semaines à ton plan…" />;

  return (
    <section className="ai">
      <div className="ai-head">
        <h3>{review ? `Bilan pour la semaine ${nextWeek!.index + 1}` : 'Bilan de la semaine'}</h3>
        {review && <span className="small faint">{new Date(review.at).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</span>}
      </div>
      <div className="ai-body">
        {review ? (
          <>
            <p>{review.summary}</p>
            {review.changes.length > 0 ? (
              <ul className="ai-warnings">
                {review.changes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            ) : (
              <p className="small faint">Aucune retouche : la semaine prévue reste adaptée.</p>
            )}
            {skipped.length > 0 && <p className="small faint">Retouches écartées par l’algorithme : {skipped.join(' ; ')}</p>}
            <div className="row">
              {review.runId && review.changes.length > 0 && (
                <button className="btn btn-secondary" disabled={busy} onClick={() => undo(review.runId!)}>
                  <Undo2 size={16} aria-hidden /> Annuler ces retouches
                </button>
              )}
              <button className="btn btn-ghost" disabled={busy || aiStatus.used >= aiStatus.limit} onClick={run}>
                Refaire le bilan
              </button>
            </div>
          </>
        ) : nextWeek ? (
          <>
            <p className="muted">Le coach compare ce que tu as couru (Strava et ressentis) à ton plan, puis retouche la semaine prochaine si besoin.</p>
            <div className="row">
              <button className="btn btn-primary" disabled={busy || aiStatus.used >= aiStatus.limit} onClick={run}>
                Faire le bilan
              </button>
            </div>
          </>
        ) : (
          <p className="muted">Pas de semaine suivante dans ce plan.</p>
        )}
        {error && <p className="notice error">{error}</p>}
      </div>
    </section>
  );
}
