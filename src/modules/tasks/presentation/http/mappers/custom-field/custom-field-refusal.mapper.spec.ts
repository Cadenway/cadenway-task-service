import { describe, expect, it } from 'vitest';
import { CustomFieldRefusal } from '../../../../application/models/custom-field/custom-field-refusal.model.js';
import { TaskRefusal } from '../../../../application/models/task/task-refusal.model.js';
import { answerCustomFieldRefusals } from './custom-field-refusal.mapper.js';

describe('custom field refusals', () => {
  it.each([
    ['manage-forbidden', 403, 'space.manage-forbidden'],
    ['not-found', 404, 'custom-field.not-found'],
    ['limit-reached', 422, 'custom-field.limit-reached'],
    ['position-invalid', 422, 'custom-field.position-invalid'],
    ['sprint-points-invalid', 422, 'custom-field.sprint-points-invalid'],
  ] as const)('maps %s to its contract response', async (reason, status, code) => {
    await expect(
      answerCustomFieldRefusals(() => Promise.reject(new CustomFieldRefusal(reason))),
    ).rejects.toMatchObject({ problem: { status, code } });
  });

  it('includes the current version when the field has changed', async () => {
    await expect(
      answerCustomFieldRefusals(() =>
        Promise.reject(new CustomFieldRefusal('version-mismatch', 4)),
      ),
    ).rejects.toMatchObject({
      problem: { status: 412, code: 'request.version-mismatch', details: { version: 4 } },
    });
  });

  it('maps shared visibility refusals through the task problem mapper', async () => {
    await expect(
      answerCustomFieldRefusals(() =>
        Promise.reject(new TaskRefusal({ reason: 'space-not-found' })),
      ),
    ).rejects.toMatchObject({ problem: { status: 404, code: 'space.not-found' } });
  });
});
