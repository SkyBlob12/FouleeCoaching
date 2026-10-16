# Foulée — coach running & trail entre amis

## Produit
Application web gratuite (Cloudflare Workers + D1) qui génère des plans d'entraînement périodisés et des séances sur mesure pour un petit groupe d'amis (≤ 10, limite de l'app Strava). Route et trail, du 5 km à l'ultra.

## Utilisateurs et contexte
- Coureurs amateurs francophones, niveaux mélangés, montres Garmin/Coros/Suunto, comptes Strava.
- Usage principal : sur le téléphone, le matin ou juste avant de sortir (« qu'est-ce que je cours aujourd'hui, à quelle allure ? »), en lumière du jour, parfois dehors. Usage secondaire : sur ordinateur le dimanche soir pour regarder la semaine et ajuster.

## Mode
Operate : appli d'usage. Lisibilité, densité maîtrisée, familiarité. L'ambition passe par la précision des données et un seul geste visuel signature.

## Vérité produit (à ne pas inventer)
- Le moteur est déterministe : VDOT (Daniels), charge TRIMP/hrTSS, CTL/ATL/TSB, allure ajustée à la pente, km-effort.
- L'IA (Claude, clé de l'administrateur) affine le plan généré par l'algorithme et analyse les activités Strava, uniquement pour les utilisateurs qui ont donné leur accord dans leur profil. Décision assumée par l'administrateur, contraire au contrat de l'API Strava (risque de révocation). Le cache Strava reste limité à 7 jours.
- Une donnée Strava n'est visible que par son propriétaire.

## Références visuelles choisies par l'utilisateur
Sport bold (Nike Run Club), data dense (Strava, TrainingPeaks), montagne et trail (UTMB, Salomon). Le rendu précédent (carte IGN, cartes empilées, gros chiffres et petits libellés) a été jugé « IA slop » : c'est l'anti-référence.

## Engagements de marque
- Français, tutoiement, phrases courtes, verbes d'action.
- Pas de gamification criarde, pas de « streaks » culpabilisants.
- Bouton et mention Strava conformes aux règles de la marque Strava.
