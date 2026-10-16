import { useState } from 'react';
import { FEEL_LABEL, vdotFromRace, type Feel, type SessionFeedback } from '@engine';
import { useReady } from '../lib/data';
import type { AnySession } from '../lib/sessions';

const ZONES = ['genou', 'cheville', 'tendon d’Achille', 'mollet', 'ischios', 'hanche', 'dos', 'pied', 'autre'];

/** Retour après séance : c'est ce qui permet au plan de « t'écouter ». */
export function FeedbackForm({ session, compact }: { session: AnySession; compact?: boolean }) {
  const { feedback, saveFeedback, saved, saveProfile } = useReady();
  const existing = feedback.find((f) => f.key === session.key);
  const [done, setDone] = useState(existing?.done ?? true);
  const [feel, setFeel] = useState<Feel | undefined>(existing?.feel);
  const [pain, setPain] = useState<0 | 1 | 2>(existing?.pain ?? 0);
  const [zone, setZone] = useState(existing?.painZone ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [testM, setTestM] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>(existing ? 'saved' : 'idle');
  const isTest = session.workout.type === 'test';
  const isStrength = session.workout.type === 'strength' || session.workout.type === 'cross';

  const submit = async () => {
    setState('saving');
    const f: SessionFeedback = {
      key: session.key,
      date: session.date,
      done,
      feel: done ? feel : undefined,
      pain,
      painZone: pain ? zone || undefined : undefined,
      note: note.trim() || undefined,
      type: session.workout.type,
    };
    await saveFeedback(f);
    const m = Number(testM);
    if (isTest && done && m > 800 && m < 3000) {
      await saveProfile({ ...(saved ?? { level: 'intermediaire', sport: 'road' }), vmaTest: { distanceM: m, date: session.date }, vdotOffset: 0 });
    }
    setState('saved');
  };

  return (
    <form
      className={`feedback ${compact ? 'compact' : ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="feedback-head">
        <h3>Comment ça s’est passé ?</h3>
        {state === 'saved' && <span className="tag done">Enregistré</span>}
      </div>
      <div className="seg" role="group" aria-label="Séance réalisée">
        <button type="button" aria-pressed={done} onClick={() => (setDone(true), setState('idle'))}>
          Faite
        </button>
        <button type="button" aria-pressed={!done} onClick={() => (setDone(false), setState('idle'))}>
          Pas faite
        </button>
      </div>
      {done && (
        <>
          <div className="field">
            <span>Ressenti</span>
            <div className="feel" role="radiogroup" aria-label="Ressenti">
              {([1, 2, 3, 4, 5] as Feel[]).map((v) => (
                <button key={v} type="button" role="radio" aria-checked={feel === v} data-v={v} onClick={() => (setFeel(v), setState('idle'))}>
                  <span className="num feel-n">{v}</span>
                  <span className="feel-l">{FEEL_LABEL[v]}</span>
                </button>
              ))}
            </div>
          </div>
          {isTest && (
            <label className="field">
              <span>Distance parcourue en 6 minutes (m)</span>
              <input type="number" inputMode="numeric" min={800} max={3000} value={testM} onChange={(e) => setTestM(e.target.value)} placeholder="1650" />
              {Number(testM) > 800 && (
                <span className="hint">
                  VMA {((Number(testM) / 360) * 3.6).toFixed(1).replace('.', ',')} km/h, soit une VO2 max de {vdotFromRace(Number(testM), 360).toFixed(1).replace('.', ',')}. Toutes
                  tes allures seront recalculées.
                </span>
              )}
            </label>
          )}
        </>
      )}
      {!isStrength && (
        <div className="field">
          <span>Douleur</span>
          <div className="seg" role="group" aria-label="Douleur">
            {(['Aucune', 'Gêne légère', 'Douleur'] as const).map((l, i) => (
              <button key={l} type="button" aria-pressed={pain === i} onClick={() => (setPain(i as 0 | 1 | 2), setState('idle'))}>
                {l}
              </button>
            ))}
          </div>
          {pain > 0 && (
            <select value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Zone douloureuse">
              <option value="">Où ?</option>
              {ZONES.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      {!compact && (
        <label className="field">
          <span>Commentaire (facultatif)</span>
          <input type="text" value={note} maxLength={300} onChange={(e) => (setNote(e.target.value), setState('idle'))} placeholder="Jambes lourdes, chaleur, très bonnes sensations…" />
        </label>
      )}
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={state === 'saving' || (done && !feel && !isStrength)}>
          {state === 'saved' ? 'Mettre à jour' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}
