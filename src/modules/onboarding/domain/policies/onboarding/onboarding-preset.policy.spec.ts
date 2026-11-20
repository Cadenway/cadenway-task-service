import { describe, expect, it } from 'vitest';

import { getOnboardingPreset } from './onboarding-preset.policy.js';

describe('getOnboardingPreset', () => {
  it.each([
    [
      'dev',
      ['Backlog', 'Sprint 1', 'Bugs'],
      [
        'Définir le périmètre du premier sprint',
        'Configurer l’intégration continue',
        'Corriger le bug de connexion',
      ],
    ],
    [
      'mkt',
      ['Calendrier éditorial', 'Campagnes'],
      [
        'Planifier les articles de décembre',
        'Préparer la campagne de rentrée',
        'Mettre à jour la page tarifs',
      ],
    ],
    [
      'agency',
      ['Projets clients', 'Demandes'],
      [
        'Lancer le projet Studio Pixel',
        'Valider le devis Lumen',
        'Envoyer le compte rendu de réunion',
      ],
    ],
  ] as const)(
    'returns the exact %s lists and example tasks in creation order',
    (key, lists, tasks) => {
      const preset = getOnboardingPreset(key);
      expect(preset.listNames).toEqual(lists);
      expect(preset.examples.map((task) => task.name)).toEqual(tasks);
      expect(preset.examples.map((task) => task.listIndex)).toEqual([0, 0, key === 'dev' ? 2 : 0]);
      expect(preset.examples.map((task) => task.status)).toEqual(['progress', 'todo', 'todo']);
      expect(preset.examples.map((task) => task.priority)).toEqual([
        'moyenne',
        'moyenne',
        'moyenne',
      ]);
    },
  );

  it('creates a single ordinary first list and no example using the blank preset', () => {
    expect(getOnboardingPreset('blank')).toMatchObject({
      listNames: ['Première liste'],
      examples: [],
    });
  });

  it('labels the names and descriptions as the mockup does', () => {
    const preset = getOnboardingPreset('dev');
    expect(preset.spaceDescription).toBe('Backlog, sprint et bugs, avec revue de code.');
    expect(preset.examples[0]?.description).toBe(
      'Tâche d’exemple du modèle « Développement logiciel ».',
    );
  });
});
