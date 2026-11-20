import { describe, expect, it } from 'vitest';

import { requireEditable } from '../../../../application/services/view/saved-view-access.service.js';
import { answerSavedViewRefusals } from './saved-view.problem.js';

describe('saved-view write refusals', () => {
  it.each(['view', 'comment'] as const)(
    'reports the role %s and the required edit role',
    async (role) => {
      await expect(
        answerSavedViewRefusals(() => {
          requireEditable({
            role,
            archivedAt: null,
            spaceId: '019a7000-0000-7000-8000-000000000002',
          });
          return Promise.resolve();
        }),
      ).rejects.toMatchObject({
        problem: {
          status: 403,
          code: 'access.role-insufficient',
          details: { role, requiredRole: 'edit' },
        },
      });
    },
  );
});
