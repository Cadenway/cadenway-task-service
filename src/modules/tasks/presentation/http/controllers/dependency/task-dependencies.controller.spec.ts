import { runWithOrganizationContext } from '@cadenway/nest-common';
import { CreateTaskDependencyInternalResponse } from '@cadenway/contracts/validators/internal/task-service';
import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { TaskSummaryView } from '../../../../application/projections/task/task-summary.projection.js';
import type { CreateTaskDependency } from '../../../../application/use-cases/commands/dependency/create-task-dependency/create-task-dependency.use-case.js';
import type { DeleteTaskDependency } from '../../../../application/use-cases/commands/dependency/delete-task-dependency/delete-task-dependency.use-case.js';
import type { GetTaskDependency } from '../../../../application/use-cases/queries/dependency/get-task-dependency/get-task-dependency.use-case.js';
import type { ListDependencyCandidates } from '../../../../application/use-cases/queries/dependency/list-dependency-candidates/list-dependency-candidates.use-case.js';
import type { ListTaskDependencies } from '../../../../application/use-cases/queries/dependency/list-task-dependencies/list-task-dependencies.use-case.js';
import { TaskDependenciesController } from './task-dependencies.controller.js';

const ORGANIZATION = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const CAMILLE = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';
const DEPENDENCY = '019a7007-8b9c-7d0e-8f1a-2b3c4d5e6f01';

/** One visible task summary from the application's read model. */
const task: TaskSummaryView = {
  id: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01',
  key: 'CAD-482',
  name: 'Refondre la connexion',
  status: 'progress',
  cancelReason: null,
  priority: 'haute',
  assigneeIds: [CAMILLE],
  dueDate: null,
  startDate: null,
  estimateMinutes: null,
  labels: [],
  parentKey: null,
  listId: '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f12',
  spaceId: '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01',
  subtaskCounts: { total: 0, closed: 0 },
  checklistCounts: { total: 0, done: 0 },
  completedAt: null,
  createdAt: new Date('2026-11-03T09:00:00.000Z'),
  version: 12,
};

/** Executes an HTTP mapping in the caller's verified organization context. */
function asCamille<T>(work: () => Promise<T>): Promise<T> {
  return runWithOrganizationContext(
    { organizationId: ORGANIZATION, actor: { type: 'user', id: CAMILLE }, role: null, scopes: [] },
    work,
  );
}

describe('the dependency controller', () => {
  it('returns the created edge and anchor ETag without exposing internal task ids', async () => {
    const execute = vi.fn().mockResolvedValue({
      dependency: { id: DEPENDENCY, blocker: task, blocked: { ...task, key: 'CAD-483' } },
      version: 13,
    });
    const controller = new TaskDependenciesController(
      { execute } as unknown as CreateTaskDependency,
      {} as DeleteTaskDependency,
      {} as GetTaskDependency,
      {} as ListTaskDependencies,
      {} as ListDependencyCandidates,
    );
    const setHeader = vi.fn();
    const result = await asCamille(() =>
      controller.create(
        { taskKey: 'CAD-482' },
        { otherTaskKey: 'CAD-483', direction: 'blocks' },
        '"12"',
        { setHeader } as unknown as Response,
      ),
    );

    expect(execute).toHaveBeenCalledWith({
      organizationId: ORGANIZATION,
      actorUserId: CAMILLE,
      taskKey: 'CAD-482',
      otherTaskKey: 'CAD-483',
      direction: 'blocks',
      expectedVersions: [12],
    });
    expect(setHeader).toHaveBeenCalledWith(
      'Location',
      `/internal/v1/tasks/CAD-482/dependencies/${DEPENDENCY}`,
    );
    expect(setHeader).toHaveBeenCalledWith('ETag', '"13"');
    expect(result.blocker.key).toBe('CAD-482');
    expect(result.blocked.key).toBe('CAD-483');
    expect(CreateTaskDependencyInternalResponse.safeParse(result).success).toBe(true);
    expect(result.blocker).not.toHaveProperty('id');
    expect(result.blocked).not.toHaveProperty('id');
  });

  it('returns the anchor ETag after deleting an edge', async () => {
    const execute = vi.fn().mockResolvedValue({ version: 14 });
    const controller = new TaskDependenciesController(
      {} as CreateTaskDependency,
      { execute } as unknown as DeleteTaskDependency,
      {} as GetTaskDependency,
      {} as ListTaskDependencies,
      {} as ListDependencyCandidates,
    );
    const setHeader = vi.fn();
    await asCamille(() =>
      controller.remove({ taskKey: 'CAD-482', dependencyId: DEPENDENCY.toUpperCase() }, '"13"', {
        setHeader,
      } as unknown as Response),
    );

    expect(execute).toHaveBeenCalledWith({
      organizationId: ORGANIZATION,
      actorUserId: CAMILLE,
      taskKey: 'CAD-482',
      dependencyId: DEPENDENCY,
      expectedVersions: [13],
    });
    expect(setHeader).toHaveBeenCalledWith('ETag', '"14"');
  });
});
