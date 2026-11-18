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
