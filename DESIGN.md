---
name: Foulée
description: Coach running et trail entre amis, mis en page comme un spécimen typographique sur grille visible.
colors:
  paper: "#ffffff"
  grid: "#dde1ea"
  ink: "#111111"
  ink-2: "#3d4350"
  ink-3: "#5b6170"
  red: "#ff3d00"
  red-deep: "#c42e00"
  on-red: "#ffffff"
  red-wash: "#eef0f4"
  bar: "#111111"
  on-bar: "#ffffff"
  on-bar-2: "#b9bec9"
  hatch: "#b9bec9"
  i-rest: "#9aa3b2"
  i-easy: "#2a78d6"
  i-mod: "#1baf7a"
  i-thr: "#eda100"
  i-hard: "#ff3d00"
  i-max: "#6250d6"
  c-forme: "#2a78d6"
  c-fatigue: "#eb6834"
  s-good: "#0ca30c"
  s-neutral: "#8c93a3"
  s-warn: "#fab219"
  s-bad: "#d03b3b"
  ai: "#6250d6"
typography:
  display:
    fontFamily: "'Big Shoulders Display Variable', 'Big Shoulders Display', 'Arial Narrow', sans-serif"
    fontSize: "clamp(140px, 17vw, 264px)"
    fontWeight: 900
    lineHeight: 0.78
    letterSpacing: "-0.015em"
    fontFeature: "tnum"
  display-page:
    fontFamily: "'Big Shoulders Display Variable', 'Big Shoulders Display', 'Arial Narrow', sans-serif"
    fontSize: "clamp(96px, 10vw, 144px)"
    fontWeight: 900
    lineHeight: 0.78
    letterSpacing: "-0.015em"
    fontFeature: "tnum"
  metric:
    fontFamily: "'Big Shoulders Display Variable', 'Big Shoulders Display', 'Arial Narrow', sans-serif"
    fontSize: "72px"
    fontWeight: 900
    lineHeight: 0.9
    fontFeature: "tnum"
  headline:
    fontFamily: "'Big Shoulders Display Variable', 'Big Shoulders Display', 'Arial Narrow', sans-serif"
    fontSize: "56px"
    fontWeight: 900
    lineHeight: 1
  title:
    fontFamily: "'Big Shoulders Display Variable', 'Big Shoulders Display', 'Arial Narrow', sans-serif"
    fontSize: "32px"
    fontWeight: 800
    lineHeight: 1
  title-sm:
    fontFamily: "'Big Shoulders Display Variable', 'Big Shoulders Display', 'Arial Narrow', sans-serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1
  numeral:
    fontFamily: "'Big Shoulders Display Variable', 'Big Shoulders Display', 'Arial Narrow', sans-serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1.1
    fontFeature: "tnum"
  body:
    fontFamily: "'Work Sans Variable', 'Work Sans', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Work Sans Variable', 'Work Sans', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.3
  tnum:
    fontFamily: "'Work Sans Variable', 'Work Sans', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    fontFeature: "tnum"
rounded:
  none: "0px"
spacing:
  xs: "8px"
  sm: "16px"
  cell: "24px"
  md: "32px"
  lg: "48px"
  bar: "72px"
  tab: "64px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "0 18px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.red}"
    textColor: "{colors.on-red}"
  button-accent:
    backgroundColor: "{colors.red}"
    textColor: "{colors.on-red}"
    rounded: "{rounded.none}"
    padding: "0 18px"
    height: "44px"
  button-accent-hover:
    backgroundColor: "{colors.red-deep}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0 18px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  button-ghost:
    textColor: "{colors.ink-2}"
    padding: "0 10px"
    height: "44px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "8px 12px"
    height: "44px"
  appbar:
    backgroundColor: "{colors.bar}"
    textColor: "{colors.on-bar-2}"
    height: "{spacing.bar}"
    padding: "0 48px"
  appbar-tab-active:
    textColor: "{colors.on-bar}"
  chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    height: "36px"
  week-cell:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    height: "144px"
    padding: "8px"
  week-cell-today:
    backgroundColor: "{colors.red}"
    textColor: "{colors.on-red}"
  key-plane:
    backgroundColor: "{colors.red}"
    textColor: "{colors.on-red}"
    typography: "{typography.numeral}"
    padding: "10px 14px"
  tag-key:
    backgroundColor: "{colors.red}"
    textColor: "{colors.on-red}"
    padding: "1px 7px"
---

# Design System: Foulée

## Overview

**Creative North Star: "Le spécimen Crouwel"**

Le plan d'entraînement se lit comme une planche de spécimen typographique : une grille de construction de 24 px, visible sur toute la page, porte chaque élément. Le chiffre qui compte (durée du jour, temps prédit, forme) est monumental et posé sur cette grille ; les graphes sont tracés sur ses lignes, si bien que la grille est à la fois décor et axe de mesure. Encre noire, papier blanc, l'aplat rouge pour « maintenant », et des couleurs de zones qui disent l'effort.

L'appli est d'usage (mode Operate) : densité maîtrisée, filets fins, tableaux réglés, phrases courtes en Work Sans. L'ambition visuelle tient en trois gestes seulement : la grille, le chiffre monumental, l'aplat rouge. Rejet confirmé : le tableau de bord SaaS en cartes arrondies avec ombres et « gros chiffre + petit libellé », et l'ancienne carte IGN.

**Key Characteristics:**
- Grille de construction visible (24 px, #DDE1EA) sur fond blanc pur ; les graphes s'y calent.
- Un chiffre monumental par page, en Big Shoulders Display 900.
- Aplat rouge #FF3D00 réservé à « maintenant » : jour, séance clé, semaine en cours.
- Couleurs porteuses de sens, jamais décoratives : zones d'intensité (familières des montres), phases du plan, états de forme, violet du coach IA.
- Filets noirs d'1 px, angles droits, aucune ombre portée.
- Mesures secondaires en une phrase réglée, pas en cellules.

## Colors

Noir et blanc d'imprimerie sur grille gris-bleu, avec un seul rouge qui signale le présent.

### Primary
- **Rouge signal** (red): aplat du jour dans la semaine, bandeau de la séance clé, barre de la semaine en cours, point final des courbes, soulignement de l'onglet actif, focus, sélection de texte, caret. Jamais décoratif.
- **Rouge brique** (red-deep): survol du bouton accent, texte des états d'erreur et du bouton danger (le rouge signal sur blanc sert aux aplats, le rouge brique au texte).

### Neutral
- **Papier** (paper): fond de page sous la grille et fond opaque des boîtes posées dessus.
- **Ligne de construction** (grid): la grille de 24 px peinte sur `body`, les filets doux entre lignes de liste (`--rule-soft`), le fond des barres de progression.
- **Encre** (ink): texte, filets d'1 px (`--rule`), barres de graphe, bouton primaire, cellule sélectionnée, barre d'app (`--bar`).
- **Encre seconde** (ink-2): texte d'appoint, sous-titres, phrases de données.
- **Encre tierce** (ink-3): légendes, graduations d'axe, courbe tiretée (fatigue, D+).
- **Lavis** (red-wash): malgré son nom, un gris très clair : fond de survol des lignes, cellules et étapes actives.
- **Gris barre** (on-bar-2 / hatch): onglets inactifs sur la barre noire ; trait des hachures des jours d'autre sport.

### Rampe d'intensité (zones)
Ordre familier des montres : gris, bleu, vert, ambre, rouge, violet. La couleur suit l'effort, la hauteur aussi (`INTENSITY_HEIGHT`, profil sur 5 lignes de grille : Endurance 0,4, Seuil 0,8, VMA 1). Palette validée (séparation daltonisme, contraste) avec le script du skill dataviz ; en sombre, l'ambre est éclairci (#E8B100) pour rester distinct du rouge.
- **Repos** (i-rest): marche, récupération, renfo et autres sports.
- **Endurance** (i-easy, bleu): footing, sortie longue.
- **Modéré** (i-mod, vert): marathon, semi, allure course, descente.
- **Seuil** (i-thr, ambre): seuil, côtes, 10 km, fartlek.
- **VMA** (i-hard, rouge signal): VMA, 5 km, test, course.
- **Vitesse** (i-max, violet): répétitions.
Utilisée par le profil de séance, les pastilles d'étape, le liseré des cellules de la semaine, la liste du plan et le chiffre monumental de la séance (`TYPE_COLOR`).

### Autres couleurs porteuses de sens
- **Phases** : Foncier bleu, Développement vert, Spécifique ambre, Affûtage violet ; semaine allégée à 45 % d'opacité.
- **Forme / fatigue** : bleu (trait plein, aire légère) et orange (tirets) ; la forme du mode « Aujourd'hui » reprend le bleu.
- **États de forme** (`FORM_COLOR`, toujours avec leur libellé) : Frais vert, Charge maîtrisée gris, Fatigue marquée ambre, Surcharge rouge, Peu de charge gris clair.
- **Coach IA** : violet (filet de tête des blocs IA, panneau de discussion, lavis des réponses).
- **Fait** : vert foncé ; ressenti 1 à 5 : bleu, vert d'eau, vert, ambre, rouge.

### Mode sombre
Sous `prefers-color-scheme: dark` (sauf `data-theme='light'`) : papier #000000, grille #1C2028, surface #0B0C0E, encre et filets #F2F3F5, ink-2 #C3C8D2, ink-3 #9AA1AF, filet doux et hachure #262B35, lavis #161A21, i-rest #4A505C, i-easy #F2F3F5. Le rouge ne change pas.

### Named Rules
**La règle du Seul Aplat.** Le rouge signal ne marque que le présent : aujourd'hui, la séance clé, la semaine en cours, la dernière valeur d'une courbe. Si un écran a deux aplats rouges sans lien avec « maintenant », l'un est de trop.

**La règle de la Couleur qui Dit Quelque Chose.** Une teinte encode une zone, une phase, un état ou le coach IA, jamais une décoration. Un texte reste à l'encre ; c'est la marque colorée à côté qui porte l'identité. Pas de dégradé ; `linear-gradient` ne sert qu'à tracer la grille, les hachures et le squelette de chargement. Toute nouvelle teinte passe le validateur de palette (clair et sombre).

## Typography

**Display Font:** Big Shoulders Display Variable (repli Arial Narrow)
**Body Font:** Work Sans Variable (repli system-ui)

**Character:** Une condensée monumentale de signalétique pour les chiffres et les titres, une grotesque humaniste calme pour tout ce qu'on lit. Le contraste d'échelle (264 px contre 15 px) fait la hiérarchie.

### Hierarchy
- **Display** (900, clamp(140px, 17vw, 264px), 0.78) : la durée de la séance du jour (`.hero-num`), avec son unité en Big Shoulders 800 (40 à 64 px) et le titre de séance en Work Sans 600 20 px.
- **Display de page** (900, clamp(96px, 10vw, 144px)) : le chiffre monumental des autres pages (temps prédit, points de forme) dans `.page-num`. « Repos » prend clamp(96px, 12vw, 180px).
- **Metric** (900, 72 px, 0.9) : un chiffre isolé dans un bloc `.stat` (forme, VMA, efficacité cardio).
- **Headline** (900, 56 px ; 44 px sous 900 px, 1) : titre de page.
- **Title** (800, 32 px) et **Title-sm** (800, 22 px) : titres de section et de boîte.
- **Numeral** (800, 20 à 32 px, chiffres tabulaires) : allures, durées d'étape, numéros de jour (40 px), numéros de semaine (26 px), valeurs du bandeau clé (32 px).
- **Body** (400, 15 px, 1.5) : texte courant, analyse du coach limitée à 70ch.
- **Label** (600, 12,5 à 13 px) : intitulés de champ, en-têtes de tableau, phases, légendes. Pas de capitales forcées.
- **Tnum** (Work Sans, chiffres tabulaires, 12 à 15 px) : tout nombre sous 20 px (graduations, « il y a 8 sem. : 24 », bpm).

### Named Rules
**La règle des 20 pixels.** Big Shoulders Display ne descend jamais sous 20 px. En dessous, un nombre passe en Work Sans avec `font-variant-numeric: tabular-nums` (`.tnum`).

**La règle du Chiffre Monumental.** Chaque page a un seul chiffre en Display ou Display de page. Un deuxième chiffre géant le dévalue.

## Layout

La page est construite sur une cellule de 24 px (`--cell`) peinte sur `body` (deux `linear-gradient` d'1 px, `background-position: -1px -1px`, donc lignes en y = 24k − 1). Marges et écarts en multiples de 8 : 8, 16, 24, 32, 48 px.

- **Desktop** : barre d'app noire collante de 72 px, contenu max 1440 px avec 48 px de marge latérale. À partir de 1100 px, deux colonnes `1.55fr / minmax(320px, 1fr)` séparées de 48 px ; la colonne latérale reste collante sous la barre.
- **Aujourd'hui** : séance (colonne gauche), semaine et forme (colonne droite), puis coach sous la séance. Sur mobile l'ordre reste séance, semaine, coach.
- **Mobile (< 900 px)** : barre de 56 px, marge de 16 px, onglets déplacés en barre fixe basse de 64 px (+ zone sûre), 5 colonnes égales.
- **Points de rupture observés** : 560, 720, 900, 1100 px.

### Named Rules
**La règle Tracé sur Grille.** Un graphe est dessiné sur la grille de la page, pas dans un cadre. `useGridSnap` décale le tracé pour que son haut tombe sur une ligne de fond ; la hauteur du tracé est un multiple entier de 24 px ; chaque ligne de grille vaut un pas rond (1, 2, 2,5, 5, 10…) ; les valeurs sont écrites dans une marge de 48 px à gauche (et à droite pour un second axe), sur fond papier pour masquer la grille sous le chiffre. La légende dit « une ligne de grille = 10 km ».

## Elevation & Depth

Système entièrement plat. La profondeur vient de l'opacité : une boîte est une feuille de papier blanc posée sur la grille (fond `--surface` opaque + filet noir d'1 px), la grille disparaît dessous. `box-shadow` n'existe qu'en `inset`, comme filet : bord supérieur rouge de 3 px de l'onglet actif mobile, bord intérieur rouge d'un champ invalide.

### Named Rules
**La règle de la Feuille Posée.** Pas d'ombre portée, jamais. Pour détacher un élément, on le rend opaque et on l'entoure d'un filet noir.

## Shapes

Angles droits partout (rayon 0, y compris boutons, champs, avatar, interrupteur). Filets d'1 px en encre pour les contours et les séparations de structure, filets doux #DDE1EA entre lignes d'une même liste, filet de 2 px en tête des blocs de texte (analyse du coach, adaptation, notices). Les groupes de choix sont des cellules jointives séparées par des filets verticaux, jamais des pastilles espacées. Les jours d'autre sport sont hachurés horizontalement (1 px sur 6), les jours désactivés aussi (1 px sur 8).

## Components

### Buttons
Rectangles d'encre, francs et compacts.
- **Shape :** angles droits, hauteur minimale 44 px, Work Sans 600 14,5 px.
- **Primaire :** fond encre, texte papier ; au survol, passe au rouge signal.
- **Accent :** fond rouge, survol rouge brique. Réservé à l'action liée au présent.
- **Secondaire :** papier + filet d'encre ; au survol, s'inverse en encre pleine.
- **Fantôme :** texte ink-2, au survol souligné de 2 px rouge.
- **Danger :** papier, filet rouge, texte rouge brique ; survol en aplat rouge.
- **Focus :** contour rouge de 2 px décalé de 2 px (global). Transitions 150 ms `cubic-bezier(0.16, 1, 0.3, 1)`.

### Chips et contrôles segmentés
- **Style :** cellules jointives dans un filet d'encre (`.seg`, `.days`, `.feel`, `.kinds`) ou puces rectangulaires de 36 px.
- **État :** sélection = inversion en encre pleine ; survol = lavis. Dans le ressenti, les notes 4 et 5 sélectionnées passent en rouge.

### Cards / Containers
- **Corner Style :** 0.
- **Background :** papier opaque sur la grille.
- **Shadow Strategy :** aucune (voir Elevation & Depth).
- **Border :** filet d'encre d'1 px.
- **Internal Padding :** 16 px (boîte), 10 à 14 px (lignes de tableau, étapes).

### Inputs / Fields
- **Style :** papier, filet d'encre d'1 px, angle droit, 44 px, 8 × 12 px de padding ; caret rouge.
- **Focus :** contour intérieur rouge de 2 px.
- **Erreur :** filet rouge doublé. **Désactivé :** opacité 0,45.
- **Interrupteur :** carré de 48 × 26 px, curseur carré encre ; activé, fond rouge et curseur blanc.

### Navigation
- **Desktop :** barre noire de 72 px, logo en Big Shoulders 900 30 px, onglets Work Sans 500 en gris barre, onglet actif en blanc souligné de 4 px rouge sur toute la hauteur de la barre.
- **Mobile :** barre basse papier, filet supérieur d'encre, icône + libellé 11 px 600 ; actif en encre avec filet rouge de 3 px en haut.

### Semaine en 7 cellules (signature)
Bande de 7 cellules jointives de 144 px (104 px sur mobile), filet d'encre. Chaque cellule : jour abrégé 12 px, numéro en Big Shoulders 900 40 px, séance et durée en bas, mention « Fait » / « Manqué ». Aujourd'hui en aplat rouge, jour sélectionné cerné d'un contour d'encre intérieur de 2 px, jours d'autre sport hachurés.

### Graphes sur grille (signature)
Profil du plan (barres de volume, semaine en cours en rouge, allégées en i-rest, D+ en tirets ink-3), forme (légende explicative avec valeurs du jour survolé, CTL en trait bleu 3 px sur aire légère, ATL en tirets orange, étiquettes directes en bout de courbe, fraîcheur en barres colorées par état autour d'un axe « reposé / fatigué »), volume sur 12 semaines (dernière semaine en rouge, double axe km / m), courbe de tendance sur 2 lignes de grille avec valeurs de début et de fin écrites. Barres pleines, sans arrondi, ligne de base en encre. Profil de séance : largeur = durée, hauteur et teinte = intensité, ligne de crête en escalier.

### Ligne de données et bandeau clé
- **Ligne de données** (`.dataline`) : les mesures secondaires forment une seule phrase en Work Sans entre deux filets d'encre (« 16,8 km, 635 m de D+, charge 91. »), valeurs en gras 600.
- **Bandeau clé** (`.facts.plane`) : seule exception, réservée à la séance clé du jour : aplat rouge, 2 à 4 cellules séparées par des filets blancs à 40 %, légende 12,5 px au-dessus de la valeur en Big Shoulders 800 32 px.

### Étiquettes
Rectangles de 12 px 600 cernés d'encre. « Fait » en encre pleine, « Manqué » cerné de rouge, « Clé » en aplat rouge.

## Do's and Don'ts

### Do:
- **Do** laisser la grille de 24 px visible partout et poser chaque bloc opaque dessus.
- **Do** caler tout nouveau graphe avec `useGridSnap` : hauteur en multiple de 24 px, une ligne de grille = un pas rond, valeurs dans la marge de 48 px.
- **Do** donner à chaque page un seul chiffre monumental en Big Shoulders 900.
- **Do** écrire les mesures secondaires en une phrase réglée (`.dataline`).
- **Do** réserver le rouge #FF3D00 au présent : jour, séance clé, semaine en cours, dernière valeur.
- **Do** passer tout nombre sous 20 px en Work Sans à chiffres tabulaires (`.tnum`).
- **Do** suivre la rampe de zones gris, bleu, vert, ambre, rouge, violet pour colorer un effort.

### Don't:
- **Don't** arrondir un angle, ni ajouter une ombre portée.
- **Don't** utiliser un filet latéral coloré épais comme accent (bande verticale à gauche d'un bloc ou d'une ligne).
- **Don't** aligner des cellules « libellé + chiffre » pour des mesures secondaires ; la seule grille de cellules chiffrées est le bandeau rouge de la séance clé.
- **Don't** utiliser Big Shoulders Display sous 20 px.
- **Don't** ajouter une teinte décorative ou un dégradé de couleur ; une couleur a toujours un sens et un libellé.
- **Don't** mélanger sur un même tracé des grandeurs d'échelles différentes (l'ancien graphe de forme superposait la charge du jour à ×0,35).
- **Don't** enfermer un graphe dans un cadre à graduations propres, détaché de la grille de la page.
- **Don't** revenir aux cartes empilées arrondies, au gros chiffre sur petit libellé de tableau de bord, ni à la carte IGN.
