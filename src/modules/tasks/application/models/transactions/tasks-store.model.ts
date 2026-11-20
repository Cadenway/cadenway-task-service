import type { WatcherOverrideRepository } from '../../ports/outbound/persistence/watcher/watcher-override-repository.port.js';
import type { TrashJobs } from '../../ports/outbound/jobs/trash/trash-jobs.port.js';
import type { TaskEvents } from '../../ports/outbound/messaging/task/task-events.port.js';
import type { ActivityRepository } from '../../ports/outbound/persistence/activity/activity-repository.port.js';
import type { ArchiveReader } from '../../ports/outbound/persistence/archive/archive-reader.port.js';
import type { AssignedTaskReader } from '../../ports/outbound/persistence/assignee/assigned-task-reader.port.js';
import type { TaskCounter } from '../../ports/outbound/persistence/count/task-counter.port.js';
import type { CustomFieldRepository } from '../../ports/outbound/persistence/custom-field/custom-field-repository.port.js';
import type { TaskDependencyRepository } from '../../ports/outbound/persistence/dependency/task-dependency-repository.port.js';
import type { LabelReader } from '../../ports/outbound/persistence/label/label-reader.port.js';
import type { TaskQueryReader } from '../../ports/outbound/persistence/query/task-query-reader.port.js';
import type { TaskReader } from '../../ports/outbound/persistence/task/task-reader.port.js';
import type { TaskCopies } from '../../ports/outbound/persistence/task/task-copies.port.js';
import type { TaskRepository } from '../../ports/outbound/persistence/task/task-repository.port.js';
import type { TrashEntryRepository } from '../../ports/outbound/persistence/trash/trash-entry-repository.port.js';
import type { TransactionClock } from '../../ports/outbound/time/transaction/transaction-clock.port.js';
import type { TaskTimeRepository } from '../../ports/outbound/persistence/time/task-time-repository.port.js';

/**
 * Interface TasksStore
 *
 * @description
 * The repositories, the reader, the events, the jobs and the clock of the tasks module, all bound
 * to the tenant transaction of one unit of work: what they write commits together, or not at all.
 */
export interface TasksStore {
  // #region Methods
  /** Runs a preflight under a savepoint, releasing the attempt's locks on failure. */
  savepoint<TResult>(work: () => Promise<TResult>): Promise<TResult>;
  // #endregion

  // #region Properties
  /** The tasks with their assignees, labels and checklist. */
  readonly tasks: TaskRepository;

  /** Custom field definitions and sparse task values in this transaction. */
  readonly customFields: CustomFieldRepository;

  /** The task work logs and status history. */
  readonly time: TaskTimeRepository;

  /** The bounded source snapshots and initial checklists of task copies. */
  readonly copies: TaskCopies;

  /** The read side: counts, pages of subtasks and task references. */
  readonly reader: TaskReader;

  /** Explicit watcher subscriptions. */
  readonly watcherOverrides: WatcherOverrideRepository;

  /** The activity entries. */
  readonly activity: ActivityRepository;

  /** The filtered reads of the tasks of a list: pages, totals and groups. */
  readonly queries: TaskQueryReader;

  /** The counters of the lists and of the tasks of an account. */
  readonly counter: TaskCounter;

  /** Directed links between tasks in this tenant. */
  readonly dependencies: TaskDependencyRepository;

  /** The tasks assigned to an account. */
  readonly assigned: AssignedTaskReader;

  /** The labels of the tasks. */
  readonly labels: LabelReader;

  /** The reads of the page "Archives". */
  readonly archives: ArchiveReader;

  /** The trash entries. */
  readonly trash: TrashEntryRepository;

  /** The outbox of the transaction. */
  readonly events: TaskEvents;

  /** The jobs the trash enqueues in the transaction. */
  readonly jobs: TrashJobs;

  /** The instant of the transaction. */
  readonly clock: TransactionClock;
  // #endregion
}
