import { describe, expect, it } from 'vitest';

import { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import type { EventActor } from '../../models/actor/event-actor.model.js';
import { CAMILLE, HUGO, INES, InMemoryTasks, taskState } from '../../use-cases/tasks.fixture.js';
import type { RecordedEvent } from '../../use-cases/tasks.fixture.js';
import { TaskAnnouncer } from './task-announcer.service.js';

const actor: EventActor = { type: 'user', id: CAMILLE };

/**
 * Announces what a function does to CAD-482 and returns the events appended.
 *
 * @param announce - The call to the announcer, given the store events.
 * @returns The events, in order.
 */
async function eventsOf(
  announce: (events: Parameters<Parameters<InMemoryTasks['run']>[0]>[0]['events']) => Promise<void>,
): Promise<RecordedEvent[]> {
  const tasks = new InMemoryTasks();
  await tasks.run((store) => announce(store.events));
  return tasks.events;
}

describe('TaskAnnouncer: the events of a change follow the order of the contract', () => {
  it('announces a creation as task.created.v1 then one task.assigned.v1 per assignee', async () => {
    const task = Task.restore(taskState({ version: 1, assigneeIds: [CAMILLE, INES] }));

    const events = await eventsOf((out) => new TaskAnnouncer().created(out, task, actor));

    expect(events.map((event) => event.kind)).toEqual(['created', 'assigned', 'assigned']);
  });

  it('announces a change as task.updated.v1, then task.status-changed.v1, then task.assigned.v1', async () => {
    const before = Task.restore(taskState());
    const update = {
      task: Task.restore(
        taskState({ version: 13, status: 'review', assigneeIds: [CAMILLE, INES, HUGO] }),
      ),
      changed: ['status', 'assigneeIds'] as const,
    };

    const events = await eventsOf((out) =>
      new TaskAnnouncer().changed(out, before, update, actor, [CAMILLE, HUGO]),
    );

    expect(events).toEqual([
      { kind: 'updated', key: 'CAD-482', version: 13, changed: ['status', 'assigneeIds'], actor },
      {
        kind: 'statusChanged',
        key: 'CAD-482',
        version: 13,
        previousStatus: 'progress',
        actor,
        watcherIds: [CAMILLE, HUGO],
      },
      { kind: 'assigned', key: 'CAD-482', version: 13, assigneeId: HUGO, actor },
    ]);
  });

  it('announces no task.assigned.v1 for a removal', async () => {
    const before = Task.restore(taskState());
    const update = {
      task: Task.restore(taskState({ version: 13, assigneeIds: [CAMILLE] })),
      changed: ['assigneeIds'] as const,
    };

    const events = await eventsOf((out) => new TaskAnnouncer().changed(out, before, update, actor));

    expect(events.map((event) => event.kind)).toEqual(['updated']);
  });

  it('announces nothing for an update that changed nothing', async () => {
    const task = Task.restore(taskState());

    const events = await eventsOf((out) =>
      new TaskAnnouncer().changed(out, task, { task, changed: [] }, actor),
    );

    expect(events).toEqual([]);
  });
});
