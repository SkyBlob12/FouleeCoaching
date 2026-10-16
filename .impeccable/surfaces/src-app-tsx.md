---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/pages"]
---

# Foulée — application web (toutes les pages connectées)

Scope : l'application connectée (Aujourd'hui, Plan, Nouveau plan, Séance, Sur mesure, Forme, Parcours, Profil) et l'écran de connexion. Mode : Operate. Usage : web en priorité (desktop 1280–1600), responsive jusqu'au téléphone.

Audience et tâche : coureurs amateurs route et trail, groupe d'amis. Savoir quoi courir aujourd'hui et à quelle allure, lire sa semaine, comprendre l'analyse de l'IA, ajuster.

## Direction contract

THESIS: Le plan s'affiche comme un spécimen typographique de Crouwel : une grille de 24 px visible construit toute la page, le chiffre qui compte est monumental et bâti sur cette grille, la séance clé est un aplat rouge. Refuse le tableau de bord SaaS en cartes arrondies, ombres et gros chiffre plus petit libellé, ainsi que l'ancienne carte IGN.

OWN-WORLD: Fond blanc pur traversé d'une grille de construction #DDE1EA (24 px), encre #111111, barre d'app noire, un seul aplat saturé #FF3D00 réservé à la séance du jour / clé et au graphe en cours. Filets d'1 px noirs, rayons 0, aucune ombre, aucun dégradé. Big Shoulders Display (condensée, monumentale) pour chiffres et titres, Work Sans pour l'interface.

STORY: En une seconde, la durée et le nom de la séance du jour ; puis les étapes avec allures et FC ; puis la semaine en 7 cellules ; puis la forme et l'analyse du coach IA, avec des courbes là où l'évolution compte.

FIRST VIEWPORT: Barre noire 72 px (logo à gauche, onglets avec soulignement rouge, profil à droite). Colonne gauche 744 px : date et contexte, durée du jour en 264 px sur la grille, profil d'intensité en barres pleines, bandeau rouge de 4 mesures, tableau des étapes. Colonne droite : titre de semaine, 7 cellules de 144 px (jour du jour en aplat rouge, autres sports hachurés), forme et VMA avec courbes, analyse du coach.

FORM: Challenger « crouwel-grid-specimen », retenu par l'utilisateur à la place du tirage (Fiche technique, candidat 7). seed:fcf5e183e28595e7. Ajout demandé par l'utilisateur : graphiques et courbes dès que l'évolution ou la répartition est l'information.

SIGNATURE: Les chiffres-clés sont posés sur la grille visible et alignés à ses cellules ; les graphes (forme, volume, profils) sont tracés sur la même grille, si bien que la grille est à la fois décor et axe de mesure.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
