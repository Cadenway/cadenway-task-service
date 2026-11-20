import { describe, expect, it } from 'vitest';

import { GoalError } from '../../../../application/models/goal/goal-error.model.js';
import { answerGoal } from './goal.problem.js';

describe('goal problem mapping', () => {
  it('reports the exact effective role and current version without other data', async () => {
    await expect(
      answerGoal(() =>
        Promise.reject(new GoalError({ reason: 'role-insufficient', role: 'view' })),
      ),
    ).rejects.toMatchObject({
      problem: {
        status: 403,
        code: 'access.role-insufficient',
        details: { role: 'view', requiredRole: 'edit' },
      },
    });
    await expect(
      answerGoal(() => Promise.reject(new GoalError({ reason: 'version-mismatch', version: 12 }))),
    ).rejects.toMatchObject({
      problem: { status: 412, code: 'request.version-mismatch', details: { version: 12 } },
    });
  });
});
