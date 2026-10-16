import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Check, Copy, LogOut, Plus, Trash2 } from 'lucide-react';
import {
  crossLoad,
  formatClock,
  parseClock,
  replanFuture,
  vdotFromRace,
  type CrossIntensity,
  type FragileZone,
  type Level,
  type OtherSport,
  type Sex,
  type Sport,
  type StrengthPref,
} from '@engine';
import { api } from '../lib/api';
import { useReady } from '../lib/data';
import { aiAllowed, estimateFrom, resolveProfile, today, vdotSourceLabel, type SavedProfile } from '../lib/profile';
import { WEEKDAYS } from '../lib/sessions';
import { CompatibleWithStrava } from '../components/StravaBadge';

const RACE_DIST = [
  { km: 5, l: '5 km' },
  { km: 10, l: '10 km' },
  { km: 21.0975, l: 'Semi' },
  { km: 42.195, l: 'Marathon' },
];

const SPORTS = ['handball', 'football', 'basket', 'rugby', 'volley', 'tennis', 'vélo', 'natation', 'musculation', 'escalade', 'ski de randonnée'];

const FRAGILE: { v: FragileZone; l: string }[] = [
  { v: 'genou', l: 'Genoux' },
  { v: 'cheville', l: 'Chevilles' },
  { v: 'achille', l: 'Tendon d’Achille' },
  { v: 'ischios', l: 'Ischios' },
  { v: 'hanche', l: 'Hanches' },
  { v: 'dos', l: 'Dos' },
];

const INTENSITY: { v: CrossIntensity; l: string }[] = [
  { v: 'low', l: 'Facile' },
  { v: 'moderate', l: 'Modéré' },
  { v: 'high', l: 'Intense' },
];

const TABS = [
  { id: 'entrainement', l: 'Entraînement' },
  { id: 'semaine', l: 'Semaine type' },
  { id: 'sante', l: 'Santé' },
  { id: 'coach-ia', l: 'Coach IA' },
  { id: 'compte', l: 'Compte' },
] as const;
type Tab = (typeof TABS)[number]['id'];
/** onglets qui modifient le formulaire du profil (les autres agissent tout de suite) */
const FORM_TABS: Tab[] = ['entrainement', 'semaine', 'sante'];

/** Titre et explication à gauche, champs sur une feuille posée à droite. */
function Section({ title, intro, aside, children }: { title: string; intro?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="pf-sec">
      <div className="pf-sec-head">
        <h2>{title}</h2>
        {intro && <p className="small muted">{intro}</p>}
        {aside}
      </div>
      <div className="box stack">{children}</div>
    </section>
  );
}

/** Forme stable d'un profil pour savoir s'il reste des modifications à enregistrer. */
const fingerprint = (p: SavedProfile) =>
  JSON.stringify([
    p.level,
    p.sport,
    p.sex,
    p.birthYear,
    p.hrMax,
    p.hrRest,
    p.lthr,
    p.race,
    p.vmaTest,
    p.vdotManual,
    p.otherSports ?? [],
    p.strength ?? 'auto',
    p.fragile ?? [],
  ]);

export function Profile() {
  const { saved, profile, saveProfile, plan, updatePlan, activities } = useReady();
  const location = useLocation();
  const navigate = useNavigate();
  const tab: Tab = TABS.find((t) => `#${t.id}` === location.hash)?.id ?? 'entrainement';

  const s: SavedProfile = saved ?? { level: profile.level, sport: profile.sport };
  const [level, setLevel] = useState<Level>(s.level);
  const [sport, setSport] = useState<Sport>(s.sport);
  const [sex, setSex] = useState<Sex | ''>(s.sex ?? '');
  const [birthYear, setBirthYear] = useState(s.birthYear ? String(s.birthYear) : '');
  const [hrMax, setHrMax] = useState(s.hrMax ? String(s.hrMax) : '');
  const [hrRest, setHrRest] = useState(s.hrRest ? String(s.hrRest) : '');
  const [lthr, setLthr] = useState(s.lthr ? String(s.lthr) : '');
  const [raceKm, setRaceKm] = useState(s.race?.distanceKm ?? 10);
  const [raceTime, setRaceTime] = useState(s.race ? formatClock(s.race.timeSec) : '');
  const [raceDate, setRaceDate] = useState(s.race?.date ?? today());
  const [testM, setTestM] = useState(s.vmaTest ? String(s.vmaTest.distanceM) : '');
  const [testDate, setTestDate] = useState(s.vmaTest?.date ?? today());
  const [vdotManual, setVdotManual] = useState(s.vdotManual ? String(s.vdotManual) : '');
  const [others, setOthers] = useState<OtherSport[]>(s.otherSports ?? []);
  const [strength, setStrength] = useState<StrengthPref>(s.strength ?? 'auto');
  const [fragile, setFragile] = useState<FragileZone[]>(s.fragile ?? []);
  const [status, setStatus] = useState<string | null>(null);
  const [replanOffer, setReplanOffer] = useState(false);
  const [busy, setBusy] = useState(false);

  const raceSec = raceTime ? parseClock(raceTime) : undefined;
  const raceVdot = raceSec ? vdotFromRace(raceKm * 1000, raceSec) : undefined;
  const testDist = Number(testM);
  const n = (x: string) => (x.trim() ? Number(x.replace(',', '.')) : undefined);
  const weeklyCross = others.reduce((t, o) => t + crossLoad(o), 0);

  const race = raceSec ? { distanceKm: raceKm, timeSec: raceSec, date: raceDate } : undefined;
  const vmaTest = testDist > 800 && testDist < 3000 ? { distanceM: testDist, date: testDate } : undefined;
  const levelInputChanged = JSON.stringify(race) !== JSON.stringify(s.race) || JSON.stringify(vmaTest) !== JSON.stringify(s.vmaTest) || n(vdotManual) !== s.vdotManual;
  const draft: SavedProfile = {
    level,
    sport,
    sex: sex || undefined,
    birthYear: n(birthYear),
    hrMax: n(hrMax),
    hrRest: n(hrRest),
    lthr: n(lthr),
    race,
    vmaTest,
    vdotManual: n(vdotManual),
    // une nouvelle mesure remet à zéro les ajustements issus des ressentis
    vdotOffset: levelInputChanged ? 0 : s.vdotOffset,
    otherSports: others.filter((o) => o.sport.trim()),
    strength,
    fragile,
    aiActivities: s.aiActivities,
  };
  const dirty = fingerprint(draft) !== fingerprint(s);
  // niveau obtenu avec les valeurs saisies (même calcul que le serveur)
  const draftProfile = resolveProfile(draft, estimateFrom(activities, draft));

  const save = async () => {
    setBusy(true);
    try {
      await saveProfile(draft);
      const extrasChanged =
        JSON.stringify(draft.otherSports ?? []) !== JSON.stringify(plan?.extras?.otherSports ?? []) ||
        (draft.strength ?? 'auto') !== (plan?.extras?.strength ?? 'auto') ||
        JSON.stringify(draft.fragile ?? []) !== JSON.stringify(plan?.extras?.fragile ?? []);
      setReplanOffer(Boolean(plan && extrasChanged));
      setStatus('Profil enregistré. Les allures de toutes tes séances sont recalculées.');
    } finally {
      setBusy(false);
    }
  };

  const replan = async () => {
    if (!plan) return;
    const extras = { ...plan.extras, otherSports: others, strength, fragile };
    const hard = new Set(others.filter((o) => o.intensity === 'high').map((o) => o.day));
    const days = plan.availability.days.filter((d) => !hard.has(d) || d === plan.availability.longRunDay);
    const next = replanFuture({ ...plan, extras, availability: { ...plan.availability, days } }, { profile }, { volumeFactor: 1 }, today());
    await updatePlan({ ...next, id: plan.id, extras, availability: { ...plan.availability, days } });
    setReplanOffer(false);
    setStatus('Plan recalculé à partir de la semaine prochaine.');
  };

  const setOther = (i: number, patch: Partial<OtherSport>) => setOthers((xs) => xs.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const used = (src: 'declared_race' | 'vma_test' | 'manual') =>
    draftProfile.vdotSource === src ? (
      <span className="tag">Utilisée</span>
    ) : draftProfile.vdotSamples.some((x) => x.method === src) ? (
      <span className="tag">Comptée dans la moyenne</span>
    ) : null;

  return (
    <div className="stack profile-page">
      <header className="page-head">
        <div>
          <h1>Profil</h1>
          <p className="sub">
            VO2 max <b className="num">{profile.vdot.toLocaleString('fr-FR')}</b>, VMA <b className="num">{profile.vma.toLocaleString('fr-FR')} km/h</b>,{' '}
            {vdotSourceLabel(profile)}
            {profile.vdotOffset ? `, ajustée de ${profile.vdotOffset > 0 ? '+' : ''}${profile.vdotOffset.toLocaleString('fr-FR')} d’après tes ressentis` : ''}.
          </p>
        </div>
      </header>

      <nav className="subnav" role="tablist" aria-label="Sections du profil">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => navigate({ hash: t.id === 'entrainement' ? '' : t.id }, { replace: true })}
          >
            {t.l}
          </button>
        ))}
      </nav>

      <form
        className="stack-lg"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {tab === 'entrainement' && (
          <>
            <Section title="Pratique" intro="Ton expérience règle la progression du volume et le nombre de séances dures par semaine.">
              <div className="field">
                <span>Niveau</span>
                <div className="seg" role="group" aria-label="Niveau">
                  {(
                    [
                      ['debutant', 'Débutant'],
                      ['intermediaire', 'Intermédiaire'],
                      ['confirme', 'Confirmé'],
                    ] as const
                  ).map(([v, l]) => (
                    <button key={v} type="button" aria-pressed={level === v} onClick={() => setLevel(v)}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <span>Terrain de prédilection</span>
                <div className="seg" role="group" aria-label="Terrain">
                  {(['road', 'trail'] as const).map((v) => (
                    <button key={v} type="button" aria-pressed={sport === v} onClick={() => setSport(v)}>
                      {v === 'road' ? 'Route' : 'Trail'}
                    </button>
                  ))}
                </div>
              </div>
            </Section>

            <Section
              title="Ton niveau"
              intro={
                <>
                  Il fixe toutes tes allures. C’est la moyenne de tes 10 dernières mesures de moins de 4 mois : tes sorties Strava avec cardio, tes courses,
                  et la course et le test VMA ci-dessous s’ils sont assez récents. Sans assez de sorties, Foulée prend le test VMA (moins de 6 mois) ou la course
                  (moins d’un an). Une VO2 max forcée remplace tout.
                  {draftProfile.vdot !== profile.vdot && (
                    <>
                      {' '}
                      Avec ces valeurs : VO2 max <b className="num">{draftProfile.vdot.toLocaleString('fr-FR')}</b>.
                    </>
                  )}
                </>
              }
            >
              <div className="pf-sub">
                <div className="pf-sub-head">
                  <h3>Dernière course</h3>
                  {used('declared_race')}
                </div>
                <div className="seg" role="group" aria-label="Distance">
                  {RACE_DIST.map((r) => (
                    <button key={r.l} type="button" aria-pressed={raceKm === r.km} onClick={() => setRaceKm(r.km)}>
                      {r.l}
                    </button>
                  ))}
                </div>
                <div className="grid-2">
                  <label className="field">
                    <span>Temps</span>
                    <input type="text" placeholder="h:mm:ss ou mm:ss" value={raceTime} onChange={(e) => setRaceTime(e.target.value)} aria-invalid={Boolean(raceTime && !raceSec)} />
                    {raceVdot && <span className="hint">Soit une VO2 max de {raceVdot.toFixed(1).replace('.', ',')}</span>}
                  </label>
                  <label className="field">
                    <span>Date</span>
                    <input type="date" value={raceDate} max={today()} onChange={(e) => setRaceDate(e.target.value)} />
                  </label>
                </div>
              </div>

              <div className="pf-sub">
                <div className="pf-sub-head">
                  <h3>Test VMA</h3>
                  {used('vma_test')}
                </div>
                <p className="small muted">Demi-Cooper : la plus grande distance possible en 6 minutes. Le plan en prévoit un au début du bloc de développement.</p>
                <div className="grid-2">
                  <label className="field">
                    <span>Distance en 6 min (m)</span>
                    <input type="number" inputMode="numeric" min={800} max={3000} placeholder="1650" value={testM} onChange={(e) => setTestM(e.target.value)} />
                    {testDist > 800 && <span className="hint">VMA {((testDist / 360) * 3.6).toFixed(1).replace('.', ',')} km/h</span>}
                  </label>
                  <label className="field">
                    <span>Date du test</span>
                    <input type="date" value={testDate} max={today()} onChange={(e) => setTestDate(e.target.value)} />
                  </label>
                </div>
              </div>

              <div className="pf-sub">
                <div className="pf-sub-head">
                  <h3>VO2 max forcée</h3>
                  {used('manual')}
                </div>
                <label className="field">
                  <span>Valeur (facultatif)</span>
                  <input type="number" step="0.5" min={20} max={85} value={vdotManual} onChange={(e) => setVdotManual(e.target.value)} style={{ maxWidth: 160 }} />
                  <span className="hint">Remplace toute autre source. Laisse vide pour un calcul automatique.</span>
                </label>
              </div>
            </Section>
          </>
        )}

        {tab === 'semaine' && (
          <>
            <Section
              title="Autres sports"
              intro="Tes séances récurrentes hors course. Les jours intenses sont bloqués pour la course et comptés dans ta charge ; le plan évite toute séance dure la veille et le lendemain."
              aside={others.length > 0 && <p className="small faint">Environ {Math.round(weeklyCross)} points de charge par semaine.</p>}
            >
              {others.length === 0 && <p className="muted">Aucun autre sport pour l’instant.</p>}
              {others.map((o, i) => (
                <div key={i} className="other">
                  <div className="other-row">
                    <label className="field">
                      <span>Sport</span>
                      <input type="text" list="sports" value={o.sport} onChange={(e) => setOther(i, { sport: e.target.value })} />
                    </label>
                    <label className="field">
                      <span>Jour</span>
                      <select value={o.day} onChange={(e) => setOther(i, { day: Number(e.target.value) })}>
                        {WEEKDAYS.map((d, k) => (
                          <option key={d} value={k}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Type</span>
                      <input type="text" value={o.label ?? ''} placeholder="Entraînement, match…" onChange={(e) => setOther(i, { label: e.target.value })} />
                    </label>
                    <label className="field">
                      <span>Durée (min)</span>
                      <input type="number" min={15} max={300} value={o.durationMin} onChange={(e) => setOther(i, { durationMin: Number(e.target.value) || 60 })} />
                    </label>
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div className="seg" role="group" aria-label="Intensité">
                      {INTENSITY.map((x) => (
                        <button key={x.v} type="button" aria-pressed={o.intensity === x.v} onClick={() => setOther(i, { intensity: x.v })}>
                          {x.l}
                        </button>
                      ))}
                    </div>
                    <button type="button" className="btn btn-ghost" onClick={() => setOthers((xs) => xs.filter((_, k) => k !== i))}>
                      <Trash2 size={16} aria-hidden /> Retirer
                    </button>
                  </div>
                </div>
              ))}
              <datalist id="sports">
                {SPORTS.map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
              <div className="row">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setOthers((xs) => [...xs, { sport: xs.at(-1)?.sport ?? '', day: 4, intensity: 'high', durationMin: 90, label: 'Entraînement' }])}
                >
                  <Plus size={16} aria-hidden /> Ajouter une séance
                </button>
              </div>
            </Section>

            <Section title="Renforcement" intro="Les séances de renfo que le plan ajoute à ta semaine.">
              <div className="field">
                <span>Séances par semaine</span>
                <div className="seg" role="group" aria-label="Renforcement">
                  {(
                    [
                      ['auto', 'Auto'],
                      [0, 'Aucune'],
                      [1, '1'],
                      [2, '2'],
                    ] as const
                  ).map(([v, l]) => (
                    <button key={String(v)} type="button" aria-pressed={strength === v} onClick={() => setStrength(v)}>
                      {l}
                    </button>
                  ))}
                </div>
                <span className="hint">
                  Auto : 2 en foncier, 1 à 2 en développement selon ton niveau et tes fragilités, 1 en spécifique, aucune la semaine de course.
                </span>
              </div>
            </Section>
          </>
        )}

        {tab === 'sante' && (
          <>
            <Section title="Zones fragiles" intro="Ce qui a déjà été blessé ou qui tire souvent. Chaque séance de renfo ajoute des exercices de prévention ciblés.">
              <div className="chips" role="group" aria-label="Zones fragiles">
                {FRAGILE.map((f) => (
                  <button
                    key={f.v}
                    type="button"
                    className="chip"
                    aria-pressed={fragile.includes(f.v)}
                    onClick={() => setFragile((xs) => (xs.includes(f.v) ? xs.filter((x) => x !== f.v) : [...xs, f.v]))}
                  >
                    {f.l}
                  </button>
                ))}
              </div>
            </Section>

            <Section
              title="Cardio"
              intro="Tes fréquences cardiaques fixent tes zones de FC et le calcul de ta charge. Laisse vide ce que tu ne connais pas : la FC max est la plus haute vue sur Strava (sinon tirée de ton année de naissance), la FC seuil est ta FC prévue à l’allure seuil d’après tes dernières sorties."
            >
              <div className="grid-3">
                <label className="field">
                  <span>FC max</span>
                  <input type="number" inputMode="numeric" placeholder={profile.hrMax ? String(profile.hrMax) : '—'} value={hrMax} onChange={(e) => setHrMax(e.target.value)} />
                </label>
                <label className="field">
                  <span>FC repos</span>
                  <input type="number" inputMode="numeric" placeholder="55" value={hrRest} onChange={(e) => setHrRest(e.target.value)} />
                </label>
                <label className="field">
                  <span>FC seuil</span>
                  <input type="number" inputMode="numeric" placeholder={profile.lthrSource === 'activities' && profile.lthr ? String(profile.lthr) : 'calculée'} value={lthr} onChange={(e) => setLthr(e.target.value)} />
                </label>
              </div>
              <div className="grid-2">
                <label className="field">
                  <span>Année de naissance</span>
                  <input type="number" inputMode="numeric" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} />
                </label>
                <label className="field">
                  <span>Sexe</span>
                  <select value={sex} onChange={(e) => setSex(e.target.value as Sex | '')}>
                    <option value="">Non précisé</option>
                    <option value="F">Femme</option>
                    <option value="M">Homme</option>
                  </select>
                  <span className="hint">Ne sert qu’à la pondération du TRIMP (formule de Banister).</span>
                </label>
              </div>
            </Section>
          </>
        )}

        {(FORM_TABS.includes(tab) || dirty) && (
          <div className="savebar" role="status" data-dirty={dirty || undefined}>
            <button className="btn btn-primary" type="submit" disabled={busy || !dirty}>
              Enregistrer
            </button>
            <span className="small muted">{dirty ? 'Modifications non enregistrées.' : (status ?? 'Tout est enregistré.')}</span>
            {replanOffer && !dirty && (
              <button type="button" className="btn btn-secondary" onClick={replan}>
                Recalculer mon plan avec ces réglages
              </button>
            )}
          </div>
        )}
      </form>

      {tab === 'coach-ia' && (
        <div className="stack-lg">
          <AiConsent />
          <ClaudeConnector />
        </div>
      )}

      {tab === 'compte' && <Account />}
    </div>
  );
}

function Account() {
  const { me, logout, deleteAccount } = useReady();
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <Section
      title="Compte"
      intro={
        me.demo
          ? 'Profil de démonstration avec des activités fictives.'
          : 'Connecté à Strava. Tes activités restent 7 jours maximum en cache et ne sont visibles que par toi.'
      }
    >
      <div className="row">
        <button className="btn btn-secondary" onClick={() => logout()}>
          <LogOut size={16} aria-hidden /> Se déconnecter
        </button>
        {confirmDelete ? (
          <>
            <button className="btn btn-danger" onClick={() => deleteAccount()}>
              Supprimer mon compte et mes données
            </button>
            <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
              Annuler
            </button>
          </>
        ) : (
          <button className="btn btn-ghost" onClick={() => setConfirmDelete(true)}>
            Supprimer mon compte
          </button>
        )}
      </div>
      <CompatibleWithStrava />
      <p className="small faint">Foulée n’est ni développé, ni sponsorisé, ni approuvé par Strava.</p>
    </Section>
  );
}

function AiConsent() {
  const { saved, profile, saveProfile, aiStatus } = useReady();
  const [busy, setBusy] = useState(false);
  const on = aiAllowed(saved);
  if (!aiStatus.enabled) return null;
  return (
    <Section
      title="Coach IA"
      intro="Il ajuste ton plan à la création, fait un bilan chaque semaine et répond depuis la page Plan (« Modifier avec le coach »)."
    >
      <label className="switch">
        <input
          type="checkbox"
          checked={on}
          disabled={busy}
          onChange={async (e) => {
            setBusy(true);
            await saveProfile({ ...(saved ?? { level: profile.level, sport: profile.sport }), aiActivities: e.target.checked });
            setBusy(false);
          }}
        />
        <span>
          <b>Laisser le coach IA analyser mes activités Strava</b>
          <br />
          <span className="small muted">
            À la création du plan puis chaque semaine, un résumé de tes 12 dernières semaines (volumes, FC, tours de tes séances, meilleurs efforts, dénivelé) et
            tes ressentis sont envoyés à Claude, l’IA d’Anthropic, pour affiner ton plan. Activé par défaut ; décoche-le et seul l’algorithme travaille. Strava
            n’autorise pas ce partage avec une IA : l’administrateur de Foulée a fait ce choix, et tu restes libre de le refuser.
          </span>
        </span>
      </label>
    </Section>
  );
}

const PROMPTS = [
  'Analyse mes ressentis des 3 dernières semaines dans Foulée et ajuste ma semaine prochaine si besoin. Explique tes choix dans une note.',
  'J’ai un match de handball décalé au jeudi cette semaine : réorganise mes séances dans Foulée sans mettre deux jours durs d’affilée.',
  'Crée-moi dans Foulée une séance de côtes adaptée à mon niveau pour mercredi, 1 h maximum.',
];

function ClaudeConnector() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    api<{ token: string | null }>('/mcp-token').then((r) => setToken(r.token));
  }, []);
  const url = token ? `${location.origin}/mcp/${token}` : '';
  const copy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Section
      title="Ton propre Claude"
      intro="Facultatif. Avec un abonnement Claude, tu peux y brancher Foulée : Claude lit ton plan, ton profil déclaré et tes ressentis, peut modifier tes séances et te laisser des notes. Il ne voit jamais tes données Strava par ce biais."
    >
      {token === undefined ? (
        <div className="skeleton" style={{ height: 42 }} />
      ) : token ? (
        <>
          <div className="row">
            <input type="text" readOnly value={url} aria-label="URL du connecteur" onFocus={(e) => e.target.select()} style={{ flex: 1, minWidth: 0 }} />
            <button className="btn btn-secondary" onClick={() => copy(url, 'url')}>
              {copied === 'url' ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />} Copier
            </button>
          </div>
          <ol className="howto small muted">
            <li>Dans Claude : Réglages, Connecteurs, « Ajouter un connecteur personnalisé ».</li>
            <li>Colle cette URL, nomme-le « Foulée ». Garde-la secrète : elle donne accès à ton plan.</li>
            <li>Dans une conversation, active le connecteur, puis demande par exemple :</li>
          </ol>
          <ul className="list prompts">
            {PROMPTS.map((p, i) => (
              <li key={p}>
                <span>{p}</span>
                <button className="btn btn-ghost icon" aria-label="Copier la demande" onClick={() => copy(p, `p${i}`)}>
                  {copied === `p${i}` ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </li>
            ))}
          </ul>
          <div className="row">
            <button
              className="btn btn-ghost"
              onClick={async () => {
                await api('/mcp-token', { method: 'DELETE' });
                setToken(null);
              }}
            >
              Révoquer l’accès
            </button>
            <button className="btn btn-ghost" onClick={async () => setToken((await api<{ token: string }>('/mcp-token', { method: 'POST' })).token)}>
              Générer une nouvelle URL
            </button>
          </div>
        </>
      ) : (
        <div className="row">
          <button className="btn btn-primary" onClick={async () => setToken((await api<{ token: string }>('/mcp-token', { method: 'POST' })).token)}>
            Créer mon connecteur Claude
          </button>
        </div>
      )}
    </Section>
  );
}
