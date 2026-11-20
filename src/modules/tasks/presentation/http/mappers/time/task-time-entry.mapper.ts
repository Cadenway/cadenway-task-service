import type { TaskTimeEntry } from '@cadenway/contracts/types/internal/task-service';

import type { TaskTimeEntryView } from '../../../../application/projections/time/task-time-entry-view.projection.js';

/** Maps a work log without exposing its internal task identifier. */
export function toTaskTimeEntry(entry: TaskTimeEntryView): TaskTimeEntry {
  return {
    id: entry.id,
    taskKey: entry.taskKey,
    authorUserId: entry.authorUserId,
    minutes: entry.minutes,
    workDate: entry.workDate,
    note: entry.note,
    createdAt: entry.createdAt.toISOString(),
  };
}
