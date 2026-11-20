import { describe, expect, it, vi } from 'vitest';

import {
  ATELIER_NORD,
  CAD_482,
  CAMILLE,
  HUGO,
  InMemorySpaceDirectory,
  InMemoryTasks,
  atelierNordMembers,
  taskState,
} from '../../../tasks.fixture.js';
import type { ChangeTaskApprovalOutput } from './change-task-approval.output.js';
import { TaskApprovalTaskRefusal } from '../../../../models/approval/task-approval-task-refusal.model.js';
import { ChangeTaskApproval } from './change-task-approval.use-case.js';

const input = {
  organizationId: ATELIER_NORD,
  actorUserId: CAMILLE,
  taskKey: 'CAD-482',
  expectedVersions: [12],
  reviewerUserIds: [HUGO],
};

interface ChangeTaskApprovalOperation<TResult> {
  // #region Methods
  /** Discovers the reviewers before and after task locking. */
  discoverReviewerIds(taskId: string): Promise<readonly string[]>;

  /** Determines the approval and task effects. */
  decide(context: ChangeTaskApprovalOutput): Promise<{
    readonly changed: boolean;
    readonly status: 'progress' | 'done' | null;
    readonly finish: (context: ChangeTaskApprovalOutput) => Promise<TResult>;
  }>;
  // #endregion
}

describe('ChangeTaskApproval', () => {
  it('advances one version and emits the approval change without changing status', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState()] });
    const useCase = new ChangeTaskApproval(
      tasks,
      atelierNordMembers(),
      new InMemorySpaceDirectory(),
    );
    const finish = vi.fn((context: { readonly version: number }) =>
      Promise.resolve(context.version),
    );
    const operation: ChangeTaskApprovalOperation<number> = {
      discoverReviewerIds: () => Promise.resolve([HUGO]),
      decide: (context) => {
        expect(context.eligibleReviewerIds).toContain(HUGO);
        return Promise.resolve({ changed: true, status: null, finish });
      },
    };
    expect(await useCase.execute(input, operation)).toBe(13);
    expect(tasks.stored(CAD_482).version).toBe(13);
    expect(tasks.events).toMatchObject([{ kind: 'updated', changed: ['approvals'], version: 13 }]);
    expect(finish).toHaveBeenCalledOnce();
  });

  it('adds the approval fact to a status update at one task version', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState()] });
    const useCase = new ChangeTaskApproval(
      tasks,
      atelierNordMembers(),
      new InMemorySpaceDirectory(),
    );
    const operation: ChangeTaskApprovalOperation<number> = {
      discoverReviewerIds: () => Promise.resolve([]),
      decide: () =>
        Promise.resolve({
          changed: true,
          status: 'done',
          finish: (context) => Promise.resolve(context.version),
        }),
    };
    expect(await useCase.execute(input, operation)).toBe(13);
    expect(tasks.events).toMatchObject([
      { kind: 'updated', changed: ['status', 'approvals'], version: 13 },
      { kind: 'statusChanged', version: 13 },
    ]);
  });

  it('checks If-Match on a no-op and keeps version and events when no vote changes', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState()] });
    const useCase = new ChangeTaskApproval(
      tasks,
      atelierNordMembers(),
      new InMemorySpaceDirectory(),
    );
    const operation: ChangeTaskApprovalOperation<number> = {
      discoverReviewerIds: () => Promise.resolve([]),
      decide: () =>
        Promise.resolve({
          changed: false,
          status: null,
          finish: (context) => Promise.resolve(context.version),
        }),
    };
    const error: unknown = await useCase
      .execute({ ...input, expectedVersions: [11] }, operation)
      .catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(TaskApprovalTaskRefusal);
    expect(ChangeTaskApproval.taskRefusalOf(error)).toEqual({
      reason: 'version-mismatch',
      details: { version: 12 },
    });
    expect(ChangeTaskApproval.taskRefusalOf(new Error('unrelated'))).toBeNull();
    expect(await useCase.execute(input, operation)).toBe(12);
    expect(tasks.events).toEqual([]);
  });

  it('rolls back the version and outbox when the approval operation fails', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState()] });
    const useCase = new ChangeTaskApproval(
      tasks,
      atelierNordMembers(),
      new InMemorySpaceDirectory(),
    );
    const operation: ChangeTaskApprovalOperation<void> = {
      discoverReviewerIds: () => Promise.resolve([]),
      decide: () =>
        Promise.resolve({
          changed: true,
          status: 'progress',
          finish: () => Promise.reject(new Error('Approval persistence failed')),
        }),
    };
    await expect(useCase.execute(input, operation)).rejects.toThrow('Approval persistence failed');
    expect(tasks.stored(CAD_482).version).toBe(12);
    expect(tasks.events).toEqual([]);
  });
});
