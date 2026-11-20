import type { OnboardingPresetKey } from '../../value-objects/onboarding/onboarding-preset-key.value-object.js';
import type { OnboardingPreset } from '../../value-objects/onboarding/onboarding-preset.value-object.js';

const presets = {
  dev: {
    label: 'Développement logiciel',
    description: 'Backlog, sprint et bugs, avec revue de code.',
    listNames: ['Backlog', 'Sprint 1', 'Bugs'],
    taskNames: [
      'Définir le périmètre du premier sprint',
      'Configurer l’intégration continue',
      'Corriger le bug de connexion',
    ],
  },
  mkt: {
    label: 'Marketing',
    description: 'Calendrier éditorial et campagnes.',
    listNames: ['Calendrier éditorial', 'Campagnes'],
    taskNames: [
      'Planifier les articles de décembre',
      'Préparer la campagne de rentrée',
      'Mettre à jour la page tarifs',
    ],
  },
  agency: {
    label: 'Agence et clients',
    description: 'Un projet par client, demandes centralisées.',
    listNames: ['Projets clients', 'Demandes'],
    taskNames: [
      'Lancer le projet Studio Pixel',
      'Valider le devis Lumen',
      'Envoyer le compte rendu de réunion',
    ],
  },
  blank: {
    label: 'Partir de zéro',
    description: 'Une seule liste vide, à vous de jouer.',
    listNames: ['Première liste'],
    taskNames: [],
  },
} as const satisfies Readonly<
  Record<
    OnboardingPresetKey,
    {
      readonly label: string;
      readonly description: string;
      readonly listNames: OnboardingPreset['listNames'];
      readonly taskNames: readonly string[];
    }
  >
>;

/** Returns the first-launch content defined by the mockup and `POST /v1/me/onboarding/finish`. */
export function getOnboardingPreset(key: OnboardingPresetKey): OnboardingPreset {
  const preset = presets[key];
  return {
    spaceDescription: preset.description,
    listNames: [...preset.listNames],
    examples: preset.taskNames.map((name, index) => ({
      name,
      listIndex: key === 'dev' && index === 2 ? 2 : 0,
      status: index === 0 ? 'progress' : 'todo',
      priority: 'moyenne',
      description: `Tâche d’exemple du modèle « ${preset.label} ».`,
    })),
  };
}
