import { CountTaskGroupsInternalResponse } from '@cadenway/contracts/validators/internal/task-service';
import { describe, expect, it } from 'vitest';

import { toTaskGroupPage } from './task-group-page.mapper.js';

describe('the page of the groups of a list', () => {
  it('maps a page to a body the contract validates, with what the tasks are grouped by', () => {
    const body = toTaskGroupPage(
      {
        grouping: 'status',
        items: [
          { value: 'todo', count: 12 },
          { value: 'progress', count: 0 },
        ],
        next: { value: 'progress', count: 0 },
        total: 12,
      },
      'cursor-of-the-next-page',
    );

    expect(CountTaskGroupsInternalResponse.parse(body)).toEqual(body);
    expect(body).toEqual({
      groupBy: 'status',
      items: [
        { value: 'todo', count: 12 },
        { value: 'progress', count: 0 },
      ],
      nextCursor: 'cursor-of-the-next-page',
      total: 12,
    });
  });

  it('keeps the none group of the assignees', () => {
    const body = toTaskGroupPage(
      { grouping: 'assignee', items: [{ value: 'none', count: 0 }], next: null, total: 0 },
      null,
    );

    expect(body.items).toEqual([{ value: 'none', count: 0 }]);
    expect(body.nextCursor).toBeNull();
  });
});
