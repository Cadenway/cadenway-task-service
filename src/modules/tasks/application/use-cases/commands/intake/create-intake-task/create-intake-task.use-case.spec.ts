import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAMILLE,
  InMemorySpaceDirectory,
  InMemoryTasks,
  NOW,
  PRODUIT,
  SPRINT_14,
  STRANGER,
  atelierNordMembers,
  placedSpace,
} from '../../../tasks.fixture.js';
import type { IntakeTaskPlacement } from '../../../../ports/outbound/spaces/intake/intake-task-placement.port.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { CreateIntakeTaskInput } from './create-intake-task.input.js';
import { CreateIntakeTask } from './create-intake-task.use-case.js';

const input: CreateIntakeTaskInput = {
  organizationId: ATELIER_NORD,
  listId: SPRINT_14,
  name: 'A request',
  description: 'Details',
  status: 'todo',
  priority: 'moyenne',
  dueDate: null,
  assigneeId: CAMILLE,
};

function setup(destination: Awaited<ReturnType<IntakeTaskPlacement['lock']>>) {
  const tasks = new InMemoryTasks();
  const spaces = new InMemorySpaceDirectory();
  const placement: IntakeTaskPlacement = { lock: () => Promise.resolve(destination) };
  return {
    tasks,
    useCase: new CreateIntakeTask(tasks, atelierNordMembers(), placement, spaces),
  };
}

describe('CreateIntakeTask', () => {
  it('records the ordinary task, creation activity and outbox with the service actor', async () => {
    const { tasks, useCase } = setup({ spaceId: PRODUIT, statuses: placedSpace().statuses });
    const result = await useCase.execute(input);
    expect(result.taskKey).toBe('CAD-496');
    expect(tasks.stored(result.taskId)).toMatchObject({
      organizationId: ATELIER_NORD,
      listId: SPRINT_14,
      assigneeIds: [CAMILLE],
      createdBy: { type: 'system', id: 'task-service' },
    });
    expect(tasks.entriesOf(result.taskId)).toEqual([
      expect.objectContaining({
        occurredAt: NOW,
        actor: { type: 'system', id: 'task-service' },
        change: { kind: 'create' },
      }),
    ]);
    expect(tasks.events).toEqual([
      expect.objectContaining({ kind: 'created', actor: { type: 'system', id: 'task-service' } }),
      expect.objectContaining({
        kind: 'assigned',
        assigneeId: CAMILLE,
        actor: { type: 'system', id: 'task-service' },
      }),
    ]);
  });

  it('refuses a destination lost before its lock without writing or emitting', async () => {
    const { tasks, useCase } = setup(null);
    await expect(useCase.execute(input)).rejects.toMatchObject({
      refusal: { reason: 'list-not-found' },
    });
    expect(tasks.events).toEqual([]);
  });

  it('rechecks membership and rejects an ineligible assignee before writing', async () => {
    const { tasks, useCase } = setup({ spaceId: PRODUIT, statuses: placedSpace().statuses });
    await expect(useCase.execute({ ...input, assigneeId: STRANGER })).rejects.toMatchObject({
      refusal: { reason: 'assignee-invalid' },
    });
    expect(tasks.events).toEqual([]);
  });

  it.each([
    new TaskRefusal({ reason: 'list-not-found' }),
    new TaskRefusal({ reason: 'status-hidden', status: 'backlog' }),
    new TaskRefusal({ reason: 'cancel-reason-required' }),
    new TaskRefusal({ reason: 'assignee-invalid', userIds: [STRANGER] }),
  ])('reports an unavailable publication for %s without its details', (error) => {
    expect(CreateIntakeTask.refusalOf(error)).toBe('unavailable');
  });

  it('preserves other failures for the caller', () => {
    expect(
      CreateIntakeTask.refusalOf(new TaskRefusal({ reason: 'space-not-found' })),
    ).toBeUndefined();
    expect(CreateIntakeTask.refusalOf(new Error('Database failed.'))).toBeUndefined();
  });
});
