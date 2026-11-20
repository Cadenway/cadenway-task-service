import { describe, expect, it } from 'vitest';

import { IntakeAccessError } from '../../../../application/models/form/intake-access-error.model.js';
import { IntakeResourceError } from '../../../../application/models/form/intake-resource-error.model.js';
import { IntakeSubmissionError } from '../../../../application/models/form/intake-submission-error.model.js';
import { IntakeFormError } from '../../../../domain/errors/form/intake-form.error.js';
import { answerIntakeRefusals } from './intake.problem.js';

describe('intake refusal mapping', () => {
  it.each([
    [new IntakeFormError({ kind: 'unavailable' }), 404, 'intake-form.not-found'],
    [new IntakeFormError({ kind: 'list-archived' }), 409, 'intake-form.list-archived'],
    [new IntakeSubmissionError('in-progress'), 409, 'idempotency.request-in-progress'],
    [new IntakeSubmissionError('key-reused'), 422, 'idempotency.key-reused'],
    [new IntakeResourceError({ kind: 'task-not-found' }), 404, 'task.not-found'],
    [new IntakeAccessError('view'), 403, 'access.role-insufficient'],
  ])('maps the documented refusal without request contents', async (error, status, code) => {
    await expect(answerIntakeRefusals(() => Promise.reject(error))).rejects.toMatchObject({
      problem: { status, code },
    });
  });

  it('reports the current version on a stale ETag', async () => {
    await expect(
      answerIntakeRefusals(() =>
        Promise.reject(new IntakeFormError({ kind: 'version-mismatch', currentVersion: 4 })),
      ),
    ).rejects.toMatchObject({ problem: { status: 412, details: { version: 4 } } });
  });
});
