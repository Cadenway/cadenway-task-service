import { describe, expect, it, vi } from 'vitest';

import {
  ATELIER_NORD,
  CAMILLE,
  HUGO,
  LEA,
  InMemoryTasks,
  atelierNordMembers,
  sprint14SharedWith,
  taskState,
} from '../../../tasks.fixture.js';
import { ReadTaskApproval } from './read-task-approval.use-case.js';

describe('ReadTaskApproval', () => {
  it('filters former editors and reads task and roster inside the same snapshot', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState()] });
    const useCase = new ReadTaskApproval(
      tasks,
      atelierNordMembers([LEA]),
      sprint14SharedWith({ [CAMILLE]: 'edit', [HUGO]: 'edit', [LEA]: 'edit' }),
    );
    const read = vi.fn((context: { readonly eligibleReviewerIds: readonly string[] }) =>
      Promise.resolve(context.eligibleReviewerIds),
    );
    const result = await useCase.execute(
      { organizationId: ATELIER_NORD, actorUserId: CAMILLE, taskKey: 'CAD-482' },
      { discoverReviewerIds: () => Promise.resolve([HUGO, LEA]), read },
    );
    expect(result).toEqual([HUGO]);
    expect(read).toHaveBeenCalledOnce();
  });
});
