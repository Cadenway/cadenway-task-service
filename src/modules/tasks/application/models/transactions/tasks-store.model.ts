import type { TaskEvents } from '../../ports/outbound/messaging/task/task-events.port.js';
import type { ActivityRepository } from '../../ports/outbound/persistence/activity/activity-repository.port.js';
import type { AssignedTaskReader } from '../../ports/outbound/persistence/assignee/assigned-task-reader.port.js';
import type { TaskCounter } from '../../ports/outbound/persistence/count/task-counter.port.js';
import type { LabelReader } from '../../ports/outbound/persistence/label/label-reader.port.js';
import type { TaskQueryReader } from '../../ports/outbound/persistence/query/task-query-reader.port.js';
import type { TaskReader } from '../../ports/outbound/persistence/task/task-reader.port.js';
import type { TaskRepository } from '../../ports/outbound/persistence/task/task-repository.port.js';
import type { TransactionClock } from '../../ports/outbound/time/transaction/transaction-clock.port.js';

/**
 * Interface TasksStore
 *
 * @description
 * The repositories, the reader, the events and the clock of the tasks module, all bound to the
 * tenant transaction of one unit of work: what they write commits together, or not at all.
 */
export interface TasksStore {
  // #region Properties
  /** The tasks with their assignees, labels and checklist. */
  readonly tasks: TaskRepository;

  /** The read side: counts, pages of subtasks and task references. */
  readonly reader: TaskReader;

  /** The activity entries. */
  readonly activity: ActivityRepository;

  /** The filtered reads of the tasks of a list: pages, totals and groups. */
  readonly queries: TaskQueryReader;

  /** The counters of the lists and of the tasks of an account. */
  readonly counter: TaskCounter;

  /** The tasks assigned to an account. */
  readonly assigned: AssignedTaskReader;

  /** The labels of the tasks. */
  readonly labels: LabelReader;

  /** The outbox of the transaction. */
  readonly events: TaskEvents;

  /** The instant of the transaction. */
  readonly clock: TransactionClock;
  // #endregion
}
