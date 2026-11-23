import type { TaskKey } from '../../../domain/value-objects/task/task-key.value-object.js';
import type { TasksStore } from './tasks-store.model.js';

/** Read-only view of the tenant-bound task repositories. */
export interface ReadonlyTasksStore {
  // #region Properties
  /** Existing task lookup and hierarchy reads. */
  readonly tasks: Pick<
    TasksStore['tasks'],
    'levelOf' | 'subtreeOf' | 'childCount' | 'listsWithTasks' | 'listsWithUntrashedTasks'
  > & {
    /** Finds a task without taking a row lock. */
    findByKey(
      organizationId: string,
      key: TaskKey,
      lock: false,
    ): ReturnType<TasksStore['tasks']['findByKey']>;
  };

  /** Field definitions and stored values. */
  readonly customFields: Pick<
    TasksStore['customFields'],
    'activeDefinitions' | 'hasNegativeValues' | 'valuesForTasks' | 'valuesForTaskPage'
  >;

  /** Work log and status history reads. */
  readonly time: Pick<
    TasksStore['time'],
    'observationTime' | 'find' | 'page' | 'totals' | 'statusHistoryPage'
  >;

  /** Source snapshots for task copies. */
  readonly copies: Pick<TasksStore['copies'], 'listSources'>;

  /** Historical authorization scope for mutation receipts. */
  readonly bulkReceipts: Pick<TasksStore['bulkReceipts'], 'find'>;

  /** Task projection reads. */
  readonly reader: TasksStore['reader'];

  /** Watcher subscription reads. */
  readonly watcherOverrides: Pick<TasksStore['watcherOverrides'], 'list'>;

  /** Task activity reads. */
  readonly activity: Pick<
    TasksStore['activity'],
    'latestOfKind' | 'pageOfTask' | 'countOfTask' | 'pageOfList' | 'countOfList'
  >;

  /** Filtered task projections. */
  readonly queries: TasksStore['queries'];

  /** Task counters. */
  readonly counter: TasksStore['counter'];

  /** Dependency edge reads. */
  readonly dependencies: Pick<
    TasksStore['dependencies'],
    'findEdge' | 'inspect' | 'get' | 'page' | 'candidates'
  >;

  /** Assigned task reads. */
  readonly assigned: TasksStore['assigned'];

  /** Label reads. */
  readonly labels: TasksStore['labels'];

  /** Archive reads. */
  readonly archives: TasksStore['archives'];

  /** Trash entry reads. */
  readonly trash: Pick<TasksStore['trash'], 'find' | 'pageOfLists' | 'countOfLists'>;

  /** The instant of the transaction. */
  readonly clock: TasksStore['clock'];
  // #endregion
}
