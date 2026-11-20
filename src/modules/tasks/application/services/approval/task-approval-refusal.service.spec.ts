import { describe, expect, it } from 'vitest';

import { TaskRefusal } from '../../models/task/task-refusal.model.js';
import { TaskApprovalTaskRefusal } from '../../models/approval/task-approval-task-refusal.model.js';
import { taskApprovalRefusal } from './task-approval-refusal.service.js';

describe('taskApprovalRefusal', () => {
  it.each([
    [{ reason: 'organization-not-found' }, {}],
    [
      { reason: 'role-insufficient', role: 'view' },
      { role: 'view', requiredRole: 'edit' },
    ],
    [{ reason: 'task-archived', key: 'CAD-482' }, { key: 'CAD-482' }],
    [{ reason: 'version-mismatch', version: 12 }, { version: 12 }],
    [{ reason: 'status-hidden', status: 'progress' }, { status: 'progress' }],
    [{ reason: 'recurrence-already-spawned' }, {}],
  ] as const)('preserves the portable refusal for %j', (reason, details) => {
    const converted = taskApprovalRefusal(new TaskRefusal(reason));
    expect(converted).toBeInstanceOf(TaskApprovalTaskRefusal);
    expect(converted).toMatchObject({ reason: reason.reason, details });
  });

  it('leaves approval and unexpected errors intact', () => {
    const error = new Error('approval rejected');
    expect(taskApprovalRefusal(error)).toBe(error);
  });

  it('serializes an authorized trash entry before crossing the module boundary', () => {
    const converted = taskApprovalRefusal(
      new TaskRefusal({
        reason: 'task-trashed',
        key: 'CAD-482',
        name: 'Task',
        entryId: 'entry',
        rootKey: 'CAD-482',
        trashedAt: new Date('2026-11-01T10:00:00.000Z'),
        trashedBy: { type: 'user', id: 'actor' },
        purgeAt: new Date('2026-12-01T10:00:00.000Z'),
      }),
    );
    expect(converted).toMatchObject({
      reason: 'task-trashed',
      details: {
        key: 'CAD-482',
        trashedAt: '2026-11-01T10:00:00.000Z',
        purgeAt: '2026-12-01T10:00:00.000Z',
        trashedBy: { type: 'user', id: 'actor' },
      },
    });
  });
});
