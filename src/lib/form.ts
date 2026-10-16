import { acwr, formState, type FitnessPoint, type FormState } from '@engine';

export const FORM_TEXT: Record<FormState, { title: string; text: string }> = {
  fresh: { title: 'Frais', text: 'Bon moment pour une séance clé ou une course.' },
  optimal: { title: 'Charge maîtrisée', text: 'Tu progresses sans t’épuiser. Continue comme ça.' },
  tired: { title: 'Fatigue marquée', text: 'Normal en bloc de charge. Respecte vraiment les footings faciles.' },
  overreaching: { title: 'Surcharge', text: 'Allège les deux prochains jours : footing court ou repos.' },
  detraining: { title: 'Peu de charge récente', text: 'Reprends progressivement, sans rattraper le temps perdu.' },
};

/** Teinte d'état, toujours affichée avec son libellé (FORM_TEXT). */
export const FORM_COLOR: Record<FormState, string> = {
  fresh: 'var(--s-good)',
  optimal: 'var(--s-neutral)',
  tired: 'var(--s-warn)',
  overreaching: 'var(--s-bad)',
  detraining: 'var(--i-rest)',
};

export function readForm(p: FitnessPoint | undefined) {
  if (!p) return undefined;
  const ratio = acwr(p);
  return { state: formState(p), ratio, rampWarning: ratio !== undefined && ratio > 1.5 };
}
