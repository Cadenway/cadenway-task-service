import { DuplicateTaskInternalResponse } from '@cadenway/contracts/validators/internal/task-service';
import { ProblemException, runWithOrganizationContext } from '@cadenway/nest-common';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { TaskView } from '../../../../application/projections/task/task-view.projection.js';
import type { DuplicateTask } from '../../../../application/use-cases/commands/task/duplicate-task/duplicate-task.use-case.js';
import { TaskDuplicateController } from './task-duplicate.controller.js';

const ORGANIZATION = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const CAMILLE = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';

/** A newly copied task returned by the duplication use case. */
const copied: TaskView = {
  id: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01',
  key: 'CAD-495',
  name: 'Connexion (copie)',
  status: 'progress',
  cancelReason: null,
  description: '## Contexte',
  descriptionMentions: [],
  cancelNote: null,
  priority: 'haute',
  assigneeIds: [CAMILLE],
  dueDate: null,
  startDate: null,
  estimateMinutes: null,
  labels: [],
  parentKey: null,
  listId: '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f12',
  spaceId: ORGANIZATION,
  subtaskCounts: { total: 0, closed: 0 },
  checklistCounts: { total: 0, done: 0 },
  completedAt: null,
  createdAt: new Date('2026-11-20T09:00:00.000Z'),
  version: 1,
  checklist: [],
  createdBy: { type: 'user', id: CAMILLE },
  updatedAt: new Date('2026-11-20T09:00:00.000Z'),
  archivedAt: null,
  archivedBy: null,
};

/** Runs a controller call with the verified actor and organization. */
function asCamille<T>(work: () => Promise<T>): Promise<T> {
  return runWithOrganizationContext(
    { organizationId: ORGANIZATION, actor: { type: 'user', id: CAMILLE }, role: null, scopes: [] },
    work,
  );
}

describe('the task duplication controller', () => {
  it('forwards the source precondition and returns the new resource location and ETag', async () => {
    const execute = vi.fn().mockResolvedValue(copied);
    const controller = new TaskDuplicateController({ execute } as unknown as DuplicateTask);
    const setHeader = vi.fn();
    const request = {
      is: () => 'application/json',
      headers: { 'content-length': '2' },
    } as unknown as Request;

    const body = await asCamille(() =>
      controller.duplicate({ taskKey: 'CAD-482' }, {}, '"12"', request, {
        setHeader,
      } as unknown as Response),
    );

    expect(execute).toHaveBeenCalledWith({
      organizationId: ORGANIZATION,
      actorUserId: CAMILLE,
      taskKey: 'CAD-482',
      expectedVersions: [12],
    });
    expect(setHeader).toHaveBeenCalledWith('Location', '/internal/v1/tasks/CAD-495');
    expect(setHeader).toHaveBeenCalledWith('ETag', '"1"');
    expect(DuplicateTaskInternalResponse.safeParse(body).success).toBe(true);
    expect(body).not.toHaveProperty('id');
  });

  it('refuses a declared zero-byte body before running the use case', async () => {
    const execute = vi.fn();
    const controller = new TaskDuplicateController({ execute } as unknown as DuplicateTask);
    const request = {
      is: () => 'application/json',
      headers: { 'content-length': '0' },
    } as unknown as Request;
    await expect(
      asCamille(() =>
        controller.duplicate({ taskKey: 'CAD-482' }, {}, undefined, request, {} as Response),
      ),
    ).rejects.toBeInstanceOf(ProblemException);
    expect(execute).not.toHaveBeenCalled();
  });
});
