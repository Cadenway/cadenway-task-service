import type { ActivityEntry } from '@cadenway/contracts/types/internal/task-service';

import type { ActivityEntryView } from '../../../../application/projections/activity/activity-entry-view.projection.js';
import { toTaskRef } from '../task/task-reference.mapper.js';

/**
 * Function toActivityEntry
 *
 * @description
 * Maps an entry of the activity log to the `ActivityEntry` of `openapi/internal/task-service.yaml`:
 * the actor as `{ type, id }`, the task as a reference (key, name and status as they are now), the
 * list the task was in when the change was made, and exactly the member of the kind: `status`,
 * `priority`, `dueDate` or `assignee`, none for a creation. `occurredAt` is the instant of the last
 * of the changes an entry merged.
 *
 * @param {ActivityEntryView} view - The entry.
 * @returns {ActivityEntry} The entry of the contract.
 */
export function toActivityEntry(view: ActivityEntryView): ActivityEntry {
  const entry: ActivityEntry = {
    id: view.id,
    occurredAt: view.occurredAt.toISOString(),
    kind: view.kind,
    actor: {
      type: view.actor.type,
      id: view.actor.id,
      ...(view.actor.provider === undefined ? {} : { provider: view.actor.provider }),
    },
    task: toTaskRef(view.task),
    listId: view.listId,
  };
  switch (view.change.kind) {
    case 'create':
      return entry;
    case 'comment':
      return {
        ...entry,
        commentId: view.change.commentId,
        commentExcerpt: view.change.commentExcerpt,
      };
    case 'status':
      return { ...entry, status: { from: view.change.status.from, to: view.change.status.to } };
    case 'priority':
      return {
        ...entry,
        priority: { from: view.change.priority.from, to: view.change.priority.to },
      };
    case 'due':
      return {
        ...entry,
        dueDate: { from: view.change.dueDate.from, to: view.change.dueDate.to },
      };
    case 'assign':
      return {
        ...entry,
        assignee: {
          userId: view.change.assignee.userId,
          added: view.change.assignee.added,
        },
      };
  }
}
