import { ProblemException } from '@cadenway/nest-common';
import { describe, expect, it } from 'vitest';

import { SpaceRefusal } from '../../../../application/models/space/space-refusal.model.js';
import type { SpaceRefusalReason } from '../../../../application/models/space/space-refusal-reason.model.js';
import { answerRefusals } from './space-refusal.problem.js';

describe('answerRefusals', () => {
  const answers: readonly (readonly [SpaceRefusalReason, number, string, unknown])[] = [
    [{ reason: 'organization-not-found' }, 404, 'organization.not-found', undefined],
    [{ reason: 'role-forbidden' }, 403, 'organization.role-forbidden', undefined],
    [{ reason: 'space-not-found' }, 404, 'space.not-found', undefined],
    [{ reason: 'list-not-found' }, 404, 'list.not-found', undefined],
    [{ reason: 'prefix-taken', prefix: 'CAD' }, 409, 'space.prefix-taken', { prefix: 'CAD' }],
    [{ reason: 'visibility-forbidden' }, 403, 'space.visibility-forbidden', undefined],
    [
      { reason: 'status-required', status: 'todo' },
      422,
      'space.status-required',
      { status: 'todo' },
    ],
    [{ reason: 'sprint-dates-invalid' }, 422, 'list.sprint-dates-invalid', undefined],
    [{ reason: 'version-mismatch', version: 13 }, 412, 'request.version-mismatch', { version: 13 }],
    [
      { reason: 'role-insufficient', role: 'view' },
      403,
      'access.role-insufficient',
      { role: 'view', requiredRole: 'edit' },
    ],
    [
      { reason: 'role-insufficient', role: null },
      403,
      'access.role-insufficient',
      { role: null, requiredRole: 'edit' },
    ],
    [{ reason: 'manage-forbidden' }, 403, 'space.manage-forbidden', undefined],
    [
      { reason: 'grantee-invalid', userId: '019a6f00-1b2c-7d3e-8f4a-5b6c7d8e9f41' },
      422,
      'access.grantee-invalid',
      { userId: '019a6f00-1b2c-7d3e-8f4a-5b6c7d8e9f41' },
    ],
    [{ reason: 'guest-space-forbidden' }, 422, 'access.guest-space-forbidden', undefined],
    [{ reason: 'owner-unchangeable' }, 422, 'access.owner-unchangeable', undefined],
    [{ reason: 'grant-limit-reached' }, 422, 'access.grant-limit-reached', undefined],
  ];

  it.each(answers)(
    'answers the refusal %j with the status, the code and the details of the contract',
    async (refusal, status, code, details) => {
      const thrown: unknown = await answerRefusals(() =>
        Promise.reject(new SpaceRefusal(refusal)),
      ).catch((error: unknown) => error);

      expect(thrown).toBeInstanceOf(ProblemException);
      if (!(thrown instanceof ProblemException)) {
        return;
      }
      expect(thrown.problem.status).toBe(status);
      expect(thrown.problem.code).toBe(code);
      expect(thrown.problem.details).toEqual(details);
    },
  );

  it('lets any other error through to the filter of the kit', async () => {
    const failure: Error = new Error('unexpected');

    await expect(answerRefusals(() => Promise.reject(failure))).rejects.toBe(failure);
  });

  it('returns what the use case resolved with', async () => {
    await expect(answerRefusals(() => Promise.resolve(7))).resolves.toBe(7);
  });
});
