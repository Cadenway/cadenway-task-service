import { describe, expect, it, vi } from 'vitest';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { CheckTaskAccess } from '../check-task-access/check-task-access.use-case.js';
import type { FindTaskReference } from '../find-task-reference/find-task-reference.use-case.js';
import { ResolveCommentTask } from './resolve-comment-task.use-case.js';

/** Actor and task for a comment read. */
const input = { organizationId: 'atelier-nord', actorUserId: 'camille', taskKey: 'CAD-482' };

describe('resolve comment task', () => {
  it('does not resolve the identity of an invisible task', async () => {
    const access = {
      execute: vi.fn().mockRejectedValue(new TaskRefusal({ reason: 'task-not-found' })),
    };
    const reference = { execute: vi.fn() };
    const useCase = new ResolveCommentTask(
      access as unknown as CheckTaskAccess,
      reference as unknown as FindTaskReference,
    );
    expect(await useCase.execute(input)).toEqual({ outcome: 'task-not-found' });
    expect(reference.execute).not.toHaveBeenCalled();
  });

  it('returns the task identity only after access succeeds', async () => {
    const access = { execute: vi.fn().mockResolvedValue({}) };
    const reference = { execute: vi.fn().mockResolvedValue({ id: 'task' }) };
    const useCase = new ResolveCommentTask(
      access as unknown as CheckTaskAccess,
      reference as unknown as FindTaskReference,
    );
    expect(await useCase.execute(input)).toEqual({ outcome: 'found', taskId: 'task' });
    expect(reference.execute).toHaveBeenCalledWith({
      organizationId: 'atelier-nord',
      taskKey: 'CAD-482',
    });
  });
});
