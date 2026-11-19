import { ProblemException } from '@cadenway/nest-common';
import { describe, expect, it } from 'vitest';

import { TaskRefusal } from '../../../../application/models/task/task-refusal.model.js';
import type { TaskRefusalReason } from '../../../../application/models/task/task-refusal-reason.model.js';
import { answerRefusals } from './task-refusal.problem.js';

describe('answerRefusals', () => {
  const user: string = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01';

  const answers: readonly (readonly [TaskRefusalReason, number, string, unknown])[] = [
    [{ reason: 'organization-not-found' }, 404, 'organization.not-found', undefined],
    [{ reason: 'task-not-found' }, 404, 'task.not-found', undefined],
    [{ reason: 'list-not-found' }, 404, 'list.not-found', undefined],
    [{ reason: 'space-not-found' }, 404, 'space.not-found', undefined],
    [{ reason: 'user-not-found' }, 404, 'user.not-found', undefined],
    [{ reason: 'checklist-item-not-found' }, 404, 'checklist-item.not-found', undefined],
    [
      { reason: 'role-insufficient', role: 'view' },
      403,
      'access.role-insufficient',
      { role: 'view', requiredRole: 'edit' },
    ],
    [
      { reason: 'role-insufficient', role: 'comment' },
      403,
      'access.role-insufficient',
      { role: 'comment', requiredRole: 'edit' },
    ],
    [{ reason: 'task-archived', key: 'CAD-430' }, 409, 'task.archived', { key: 'CAD-430' }],
    [
      {
        reason: 'task-trashed',
        key: 'CAD-452',
        name: 'Ancien écran de connexion',
        entryId: '019a7006-7a8b-7c9d-8e0f-1a2b3c4d5e01',
        rootKey: 'CAD-452',
        trashedAt: new Date('2026-11-06T16:20:00.000Z'),
        trashedBy: { type: 'user', id: user },
        purgeAt: new Date('2026-12-06T16:20:00.000Z'),
      },
      404,
      'task.trashed',
      {
        key: 'CAD-452',
        name: 'Ancien écran de connexion',
        entryId: '019a7006-7a8b-7c9d-8e0f-1a2b3c4d5e01',
        rootKey: 'CAD-452',
        trashedAt: '2026-11-06T16:20:00.000Z',
        trashedBy: { type: 'user', id: user },
        purgeAt: '2026-12-06T16:20:00.000Z',
      },
    ],
    [{ reason: 'trash-entry-not-found' }, 404, 'trash-entry.not-found', undefined],
    [{ reason: 'version-mismatch', version: 13 }, 412, 'request.version-mismatch', { version: 13 }],
    [
      { reason: 'status-hidden', status: 'review' },
      422,
      'task.status-hidden',
      { status: 'review' },
    ],
    [{ reason: 'cancel-reason-required' }, 422, 'task.cancel-reason-required', undefined],
    [{ reason: 'cancel-reason-unexpected' }, 422, 'task.cancel-reason-unexpected', undefined],
    [
      { reason: 'assignee-invalid', userIds: [user] },
      422,
      'task.assignee-invalid',
      { userIds: [user] },
    ],
    [{ reason: 'assignee-limit-reached' }, 422, 'task.assignee-limit-reached', undefined],
    [{ reason: 'label-limit-reached' }, 422, 'task.label-limit-reached', undefined],
    [{ reason: 'checklist-limit-reached' }, 422, 'task.checklist-limit-reached', undefined],
    [{ reason: 'start-date-invalid' }, 422, 'task.start-date-invalid', undefined],
    [{ reason: 'list-invalid' }, 422, 'task.list-invalid', undefined],
    [
      { reason: 'parent-invalid', parentKey: 'CAD-481' },
      422,
      'task.parent-invalid',
      { parentKey: 'CAD-481' },
    ],
    [{ reason: 'subtask-depth-exceeded' }, 422, 'task.subtask-depth-exceeded', undefined],
    [{ reason: 'subtask-limit-reached' }, 422, 'task.subtask-limit-reached', undefined],
  ];

  it('covers the twenty-three reasons of a refusal', () => {
    expect(new Set(answers.map(([refusal]) => refusal.reason)).size).toBe(23);
  });

  it.each(answers)(
    'answers the refusal %j with the status, the code and the details of the contract',
    async (refusal, status, code, details) => {
      const thrown: unknown = await answerRefusals(() =>
        Promise.reject(new TaskRefusal(refusal)),
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
