import { describe, expect, it } from 'vitest';

import { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import { ATELIER_NORD, InMemoryTasks, PRODUIT, taskState } from '../../use-cases/tasks.fixture.js';
import { TaskCustomFieldValues } from './task-custom-field-values.service.js';

describe('TaskCustomFieldValues', () => {
  it('loads moved tasks from many spaces in bounded pages before clearing any values', async () => {
    const unit = new InMemoryTasks();
    const pages: (readonly { taskId: string; spaceId: string; listId: string }[])[] = [];
    const clears: (readonly string[])[] = [];
    const tasks = Array.from({ length: 501 }, (_, index) =>
      Task.restore(
        taskState({
          id: `019a7000-0000-7000-8000-${String(index).padStart(12, '0')}`,
          spaceId: `019a7000-0000-7000-8001-${String(index % 100).padStart(12, '0')}`,
        }),
      ),
    );
    const stationary = Task.restore(taskState({ spaceId: PRODUIT }));

    await unit.run(async (store) => {
      const service = new TaskCustomFieldValues();
      const adapted = {
        ...store,
        customFields: {
          ...store.customFields,
          valuesForTaskPage: (
            organizationId: string,
            batch: readonly { taskId: string; spaceId: string; listId: string }[],
          ) => {
            expect(organizationId).toBe(ATELIER_NORD);
            expect(clears).toEqual([]);
            pages.push(batch);
            const first = batch[0];
            return Promise.resolve(
              first === undefined ? [] : [{ taskId: first.taskId, fieldId: 'field', value: 0 }],
            );
          },
          clearTasks: (_organizationId: string, ids: readonly string[]) => {
            clears.push(ids);
            return Promise.resolve();
          },
        },
      };

      const marked = await service.movedWithValues(adapted, [...tasks, stationary], PRODUIT);
      await service.clearMoved(adapted, [...tasks, stationary], PRODUIT);

      expect(pages.map((page) => page.length)).toEqual([500, 1]);
      expect(pages[0]?.[0]).toEqual({
        taskId: tasks[0]?.snapshot.id,
        spaceId: tasks[0]?.snapshot.spaceId,
        listId: tasks[0]?.snapshot.listId,
      });
      expect(marked).toEqual(new Set([tasks[0]?.snapshot.id, tasks[500]?.snapshot.id]));
      expect(clears.map((ids) => ids.length)).toEqual([500, 1]);
    });
  });
});
