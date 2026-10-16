# Foulée

Coach running & trail pour un petit groupe d'amis : plans périodisés, séances sur mesure, suivi de forme et prédiction sur parcours GPX. 100 % gratuit (Cloudflare Workers + D1), sans nom de domaine (`*.workers.dev`).

## Ce que fait le moteur (`shared/engine`)

| Brique | Méthode | Inspiré de |
|---|---|---|
| Niveau | VDOT (équations Daniels-Gilbert) = moyenne des 10 dernières mesures de moins de 4 mois (extrêmes écartés dès 6 mesures). Une mesure par sortie de plus de 20 min avec cardio (%FC de réserve ≈ %VO2 de réserve, Swain), par course, et pour la course et le test VMA déclarés. VO2 max forcée prioritaire. | Jack Daniels, estimation VO2max Firstbeat/Garmin |
| Progression | Niveau recalculé après chaque mesure sur les 6 mois d'historique Strava : courbe, comparaison il y a 3 mois / 1 mois / aujourd'hui (VO2 max, VMA, allures, 10 km, FC seuil). Rien n'est stocké : tout est recalculé à la synchro. | |
| Allures | E / M / T / I / R + allures 5 km–marathon | *Daniels' Running Formula* |
| Zones FC | 5 zones sur la FC seuil. FC seuil = FC prévue à l'allure seuil sur la droite FC/vitesse des 10 dernières mesures (si elle est fiable), sinon tirée de la FC max | Joe Friel |
| Charge | TRIMP de Banister ramené à « 100 = 1 h au seuil », ou allure ajustée au D+ à défaut de FC | TrainingPeaks hrTSS / rTSS |
| Forme | CTL 42 j, ATL 7 j, TSB, ratio aigu/chronique (indicatif) | Banister, PMC TrainingPeaks, Strava Forme & Fraîcheur |
| Plan | Foncier → Développement → Spécifique → Affûtage, cycles 3+1, +6 à 10 %/sem, 80/20, plafonds Daniels (T ≤ 10 %, I ≤ 8 % du volume) | Daniels, Pfitzinger, Seiler |
| Adaptation | Les allures sont recalculées à l'affichage depuis le VDOT courant : quand ta forme change, toutes les séances suivent | Runna |
| Trail | km-effort (km + D+/100), catégories UTMB, allure ajustée à la pente, côtes longues, descente, enchaînements J1/J2 | ITRA/UTMB, Minetti 2002, GAP Strava |
| Parcours | GPX → profil lissé, distance équivalent plat, temps de passage aux points nommés, extension Riegel au-delà du marathon | |
| Autres sports | Séances récurrentes (handball, vélo…) : jours intenses bloqués, charge comptée (≈ 100 pts pour 1 h 30 de hand), volume de course réduit (jusqu'à −25 %), pas de séance dure la veille ou le lendemain, sortie longue en endurance pure si elle suit un match, une séance de qualité en moins si 2 séances intenses par semaine | Logique de charge globale (TrainingPeaks) |
| Renforcement | 0 à 2 séances par semaine selon la phase (force générale, puis force + pliométrie, puis entretien), le niveau et les zones fragiles (exercices de prévention ciblés), placées hors sport intense, hors sortie longue et jamais la veille d'une séance clé | Campus Coach |
| VMA | VMA « demi-Cooper » (6 min), allures affichées en % VMA, test VMA au début du bloc de développement (et en semaine 1 si le niveau est mal connu) | Campus Coach, clubs FFA |
| Plan qui écoute | Ressenti après chaque séance (1 à 5, douleur, commentaire). Qualité jugée facile 2 fois sur 3 : allures +1,5 %. Jugée trop dure : −1,5 %. Séances manquées ou fatigue : volume reconduit, voire −10 %. Douleur : 3 jours sans intensité et −30 %. Les semaines à venir sont recalculées en gardant les phases. | Campus Coach, Runna |

Tests : `npm test`.

## Données Strava

- Les activités et leurs détails (tours, meilleurs efforts) ne sont gardés que **7 jours** en cache, avec une purge quotidienne par cron.
- Elles ne sont visibles que par leur propriétaire.
- La suppression du compte révoque l'accès Strava.
- ⚠️ **Exception assumée** : pour les utilisateurs qui l'acceptent dans leur profil, un résumé de leurs activités est envoyé à Claude pour affiner le plan. C'est contraire au contrat de l'API Strava, avec un risque de révocation de l'app.

Ce que l'athlète saisit lui-même (course de référence, FC, plans) est stocké sans limite.

## Lancer en local

```bash
npm install
npx wrangler d1 migrations apply runningcoach --local
# .dev.vars : SESSION_SECRET=<aléatoire>, DEMO_MODE=1, STRAVA_CLIENT_ID=, STRAVA_CLIENT_SECRET=
npm run dev   # http://localhost:5173, bouton « profil de démo »
```

## Déployer (gratuit)

1. Crée un compte Cloudflare, puis `npx wrangler login`.
2. `npx wrangler d1 create runningcoach`, puis colle le `database_id` obtenu dans `wrangler.jsonc`.
3. `npm run db:migrate:remote`
4. `npm run deploy` : note l'URL `https://runningcoach.<ton-sous-domaine>.workers.dev`.
5. Sur https://www.strava.com/settings/api, crée l'application. **Authorization Callback Domain** = `runningcoach.<ton-sous-domaine>.workers.dev`.
6. Ajoute les secrets, puis redéploie :
   ```bash
   npx wrangler secret put STRAVA_CLIENT_ID
   npx wrangler secret put STRAVA_CLIENT_SECRET
   npx wrangler secret put SESSION_SECRET   # chaîne aléatoire longue
   npm run deploy
   ```
7. Une app Strava démarre à 1 athlète. Passe à 10 depuis les réglages développeur Strava pour inviter tes amis.

Avant d'ouvrir à d'autres, remplace le bouton « Se connecter avec Strava » par l'image officielle des [guidelines Strava](https://developers.strava.com/guidelines/).

## IA intégrée au plan (Claude)

L'IA ne remplace pas l'algorithme : elle ajuste ses réglages et retouche le plan, et le moteur reste garant des règles de sécurité.

1. **À la création du plan** (`POST /api/ai/tune`) : l'algorithme génère un plan. L'analyse chiffrée des 12 dernières semaines est envoyée à Claude avec le contexte de l'athlète. Cette analyse est calculée par `shared/engine/analysis.ts` : volumes, D+, répartition des intensités, efficacité cardio, meilleurs efforts, tours des séances de qualité, vitesse en montée. Claude renvoie, en JSON structuré, des réglages bornés par `clampTuning` : VDOT, volume de départ et de pic, sortie longue, nombre de séances dures, cycle 2+1 ou 3+1, accent. L'algorithme régénère alors le plan. Les décisions et les alertes de Claude sont affichées.
2. **Chaque semaine** (`POST /api/ai/review`) : Claude compare le prévu, le réalisé (Strava, tours compris) et les ressentis, puis propose 0 à 4 retouches pour la semaine suivante, ainsi qu'un éventuel ajustement des allures. Chaque retouche est validée avant d'être appliquée : format de séance, dates, pas de jours durs consécutifs, séances d'autres sports intouchables. Un instantané permet d'annuler en un clic.
3. **Discussion avec le coach** (`POST /api/ai/chat`, bouton « Modifier avec le coach » sur la page Plan) : l'athlète écrit ce qui change (« je ne peux pas courir mardi », « je suis malade ») et Claude modifie le plan avec les outils du connecteur (lecture, déplacement, remplacement, suppression), chaque séance étant validée par le moteur. La réponse arrive en flux (NDJSON), les modifications sont listées et la dernière série s'annule en un clic (instantané `ai_runs`). Claude voit le plan, le profil déclaré et les ressentis ; les sorties Strava récentes seulement si l'accord IA est actif. Historique par plan dans `plan_chat` (migration `0005`), 30 messages par personne et par jour (`CHAT_DAILY_LIMIT` dans `worker/planChat.ts`).

- **Actif par défaut** : l'IA travaille pour tous les utilisateurs, sauf ceux qui ont décoché « Laisser le coach IA analyser mes activités Strava » dans leur profil. Pour eux, seul l'algorithme travaille. ⚠️ Envoyer des données Strava à une IA est contraire au contrat de l'API Strava : c'est un choix assumé de l'administrateur.
- **Modèle** : `CLAUDE_MODEL` dans `wrangler.jsonc` (Claude Sonnet 5.5 par défaut), secret `ANTHROPIC_API_KEY`, sorties structurées (Zod), cache de prompt, repli automatique en cas de refus.
- **Coût** : environ 0,03 à 0,05 $ par analyse. 10 analyses par personne et par jour maximum (`DAILY_LIMIT` dans `worker/coach.ts`).

## Brancher son propre Claude (facultatif)

Profil, puis « Coach IA avec ton Claude », puis « Créer mon connecteur » : tu obtiens une URL personnelle `https://…/mcp/<jeton>`. Dans Claude : Réglages, Connecteurs, « Ajouter un connecteur personnalisé », colle l'URL.

Claude dispose de 7 outils :
- lire le contexte (profil déclaré, plan, séances à venir) ;
- lire les séances et les ressentis ;
- créer, remplacer, déplacer ou supprimer une séance (les séances sont validées par le moteur) ;
- laisser une note affichée sur « Aujourd'hui ».

Il ne reçoit **aucune donnée Strava**, ni brute ni dérivée : le VDOT n'est partagé que s'il vient d'une course ou d'un test que tu as déclaré. Pour l'historique, active en parallèle le connecteur Strava officiel. L'URL est révocable à tout moment.

## Envoyer une séance sur la montre

Sur une séance, clique « Copier pour intervals.icu » et colle le texte dans le constructeur de séances d'intervals.icu (gratuit). intervals.icu la synchronise avec Garmin, Coros, Suunto et Wahoo. Le plan complet s'exporte aussi en `.ics` vers n'importe quel agenda.

## Design

Direction « Grille Crouwel » choisie via le processus impeccable : grille de construction visible, chiffres monumentaux, aplat rouge pour « maintenant » et couleurs de zones validées pour le daltonisme (`.impeccable/surfaces/src-app-tsx.md`, `PRODUCT.md`). Skills de design installés dans `.claude/skills` : `impeccable` et `frontend-design`.
