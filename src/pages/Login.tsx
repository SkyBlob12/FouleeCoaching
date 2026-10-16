import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Workout } from '@engine';
import { api } from '../lib/api';
import { useData } from '../lib/data';
import { WorkoutProfile } from '../components/WorkoutProfile';
import { CompatibleWithStrava, ConnectWithStrava } from '../components/StravaBadge';

const ERRORS: Record<string, string> = {
  refus: 'Connexion annulée sur Strava.',
  etat: 'La connexion a expiré. Réessaie.',
  scope: 'Foulée a besoin de lire tes activités : coche l’autorisation correspondante sur Strava.',
};

// séance d'exemple dessinée sur l'écran d'accueil
const SAMPLE: Workout = {
  type: 'long_hills',
  title: 'Côtes longues : 5 × 4′',
  purpose: '',
  blocks: [
    { repeat: 1, steps: [{ kind: 'warmup', intensity: 'easy', durationSec: 1200 }] },
    {
      repeat: 5,
      steps: [
        { kind: 'work', intensity: 'hill', durationSec: 240 },
        { kind: 'recovery', intensity: 'recovery', durationSec: 170 },
      ],
    },
    { repeat: 1, steps: [{ kind: 'cooldown', intensity: 'easy', durationSec: 600 }] },
  ],
};

export function Login() {
  const { config, reload } = useData();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const err = params.get('erreur');

  return (
    <div className="login">
      <div className="login-inner">
        <div>
          <div className="login-brand">FOULÉE</div>
          <h1 className="login-title">
            Ton plan route et trail, calé sur ce que tu cours vraiment.
          </h1>
          <p className="login-lede">
            Un algorithme construit ton plan (phases, volumes, allures). Le coach IA l’affine ensuite d’après tes activités Strava (désactivable dans ton profil), et le
            réajuste chaque semaine.
          </p>
        </div>

        <div className="login-side">
          <div className="login-sample" aria-hidden>
            <WorkoutProfile workout={SAMPLE} vdot={48} height={120} compact />
            <div className="login-sample-cap">
              <span>Côtes longues, 5 × 4′</span>
              <span className="tnum">1 h 05</span>
            </div>
          </div>
          {err && <p className="notice error">{ERRORS[err] ?? 'La connexion a échoué.'}</p>}
          <div className="login-actions">
            {config.strava ? <ConnectWithStrava /> : <p className="notice">Connexion Strava non configurée sur ce serveur.</p>}
            {config.demo && (
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await api('/auth/demo', { method: 'POST' });
                  await reload();
                }}
              >
                Essayer avec un profil de démo
              </button>
            )}
          </div>
          <p className="login-legal">
            Tes activités Strava restent 7 jours en cache et ne sont visibles que par toi. Elles ne sont analysées par l’IA (Claude) que si tu l’actives dans ton
            profil.
          </p>
          <CompatibleWithStrava />
        </div>
      </div>
    </div>
  );
}
