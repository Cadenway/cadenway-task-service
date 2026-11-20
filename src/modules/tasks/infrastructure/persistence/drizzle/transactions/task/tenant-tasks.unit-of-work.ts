import type {
  TenantTransactionRunner,
  TransactionOptions,
  TransactionScope,
} from '@cadenway/nest-common/database';
import type { JobProducer } from '@cadenway/nest-jobs/runtime';
import type { OutboxRelay, OutboxWriter } from '@cadenway/nest-messaging/outbox';

import type { ReadOptions } from '../../../../../application/models/transactions/read-options.model.js';
import type { TasksStore } from '../../../../../application/models/transactions/tasks-store.model.js';
import type { IntakeContactCleanup } from '../../../../../application/ports/outbound/intake/trash/intake-contact-cleanup.port.js';
import type { TasksUnitOfWork } from '../../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { PostgresqlTransactionClock } from '../../../../adapters/postgresql/transaction-clock.adapter.js';
import { JobsTrashJobs } from '../../../../jobs/pg-boss/trash/jobs-trash-jobs.adapter.js';
import { OutboxTaskEvents } from '../../../../messaging/outbox/task/outbox-task-events.adapter.js';
import { DrizzleActivityRepository } from '../../repositories/activity/drizzle-activity.repository.js';
import { DrizzleArchiveReader } from '../../repositories/archive/drizzle-archive-reader.repository.js';
import { DrizzleAssignedTaskReader } from '../../repositories/assignee/drizzle-assigned-task-reader.repository.js';
import { DrizzleTaskCounter } from '../../repositories/count/drizzle-task-counter.repository.js';
import { DrizzleCustomFieldRepository } from '../../repositories/custom-field/drizzle-custom-field.repository.js';
import { DrizzleLabelReader } from '../../repositories/label/drizzle-label-reader.repository.js';
import { DrizzleTaskQueryReader } from '../../repositories/query/drizzle-task-query-reader.repository.js';
import { DrizzleTaskReader } from '../../repositories/task/drizzle-task-reader.repository.js';
import { DrizzleTaskCopiesRepository } from '../../repositories/task/drizzle-task-copies.repository.js';
import { DrizzleTaskRepository } from '../../repositories/task/drizzle-task.repository.js';
import { DrizzleTaskTimeRepository } from '../../repositories/time/drizzle-task-time.repository.js';
import { DrizzleTrashEntryRepository } from '../../repositories/trash/drizzle-trash-entry.repository.js';
import { DrizzleWatcherOverrideRepository } from '../../repositories/watcher/drizzle-watcher-override.repository.js';
import { DrizzleTaskDependencyRepository } from '../../repositories/dependency/drizzle-task-dependency.repository.js';

/** Rolls back only the attempt's work, keeping the caller's outer tenant transaction intact. */
async function withTaskSavepoint<TResult>(
  transaction: TransactionScope,
  work: () => Promise<TResult>,
): Promise<TResult> {
  await transaction.client.query('SAVEPOINT task_write_preflight');
  try {
    const result = await work();
    await transaction.client.query('RELEASE SAVEPOINT task_write_preflight');
    return result;
  } catch (error: unknown) {
    await transaction.client.query('ROLLBACK TO SAVEPOINT task_write_preflight');
    await transaction.client.query('RELEASE SAVEPOINT task_write_preflight');
    throw error;
  }
}

/**
 * Class TenantTasksUnitOfWork
 *
 * @description
 * `TasksUnitOfWork` on the tenant transaction runner: the work runs in the organization context
 * of the caller, and row-level security limits it to that organization. A route marked
 * `@Idempotent()` runs in the transaction a kit interceptor opened: `run` joins it. A batch of the
 * clean-up job of a removed member opens its own. The store of each run is bound to that run's transaction, the clock
 * included (the instant of the transaction is read once per run). The events appended go to the
 * outbox of the same transaction, and the jobs the trash enqueues (`JobsTrashJobs` on the
 * `JobProducer` of the kit) are inserted in it too, so they commit with the change or not at all.
 *
 * Once a run that appended events resolves, the relay is woken so they leave now instead of at
 * its next poll. A run joined to an outer transaction resolves before that one commits: the pass
 * it wakes does not see the rows yet, and the next poll publishes them.
 *
 * `runReadOnly` passes the options of the kit's runner (`readOnly`, and `repeatable read` for a
 * snapshot). The operations of organization-members and spaces a read calls run without options,
 * so they join that transaction: the kit only refuses a join that asks for more than the running
 * transaction gives (a stronger isolation, or read-only access over a read-write one).
 */
export class TenantTasksUnitOfWork implements TasksUnitOfWork {
  // #region Properties
  /**
   * Property runner
   *
   * @description
   * The tenant transaction runner of the kit.
   *
   * @type {TenantTransactionRunner}
   * @readonly
   */
  private readonly runner: TenantTransactionRunner;

  /**
   * Property outbox
   *
   * @description
   * The outbox writer of the kit.
   *
   * @type {OutboxWriter}
   * @readonly
   */
  private readonly outbox: OutboxWriter;

  /**
   * Property relay
   *
   * @description
   * The outbox relay, woken after a run that appended events.
   *
   * @type {OutboxRelay}
   * @readonly
   */
  private readonly relay: OutboxRelay;

  /**
   * Property jobs
   *
   * @description
   * The job producer of the kit, bound to the transaction of each run.
   *
   * @type {JobProducer}
   * @readonly
   */
  private readonly jobs: JobProducer;

  /** Removes intake contacts in the active task transaction. */
  private readonly intakeContacts: IntakeContactCleanup;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the runner, the outbox writer, the relay and the job producer of the kit.
   *
   * @param {TenantTransactionRunner} runner - The tenant transaction runner.
   * @param {OutboxWriter} outbox - The outbox writer.
   * @param {OutboxRelay} relay - The outbox relay.
   * @param {JobProducer} jobs - The job producer.
   * @param {IntakeContactCleanup} intakeContacts - The transactional contact cleanup.
   * @constructor
   */
  public constructor(
    runner: TenantTransactionRunner,
    outbox: OutboxWriter,
    relay: OutboxRelay,
    jobs: JobProducer,
    intakeContacts: IntakeContactCleanup,
  ) {
    this.runner = runner;
    this.outbox = outbox;
    this.relay = relay;
    this.jobs = jobs;
    this.intakeContacts = intakeContacts;
  }
  // #endregion

  // #region Methods
  /**
   * Method run
   *
   * @description
   * Runs `work` in the tenant transaction of the current organization context, joining the
   * transaction of the caller when there is one, with a store bound to it.
   *
   * @param {(store: TasksStore) => Promise<TResult>} work - The unit of work.
   * @returns {Promise<TResult>} What the work resolved with.
   */
  public async run<TResult>(work: (store: TasksStore) => Promise<TResult>): Promise<TResult> {
    return this.execute(work, {});
  }

  /**
   * Method runReadOnly
   *
   * @description
   * Runs `work` in a read-only tenant transaction, `REPEATABLE READ` when a snapshot is asked,
   * joining the transaction of the caller when there is one and it provides as much.
   *
   * @param {(store: TasksStore) => Promise<TResult>} work - The read.
   * @param {ReadOptions} [options] - How the run sees the database.
   * @returns {Promise<TResult>} What the work resolved with.
   */
  public async runReadOnly<TResult>(
    work: (store: TasksStore) => Promise<TResult>,
    options: ReadOptions = {},
  ): Promise<TResult> {
    return this.execute(
      work,
      options.snapshot === true
        ? { readOnly: true, isolationLevel: 'repeatable read' }
        : { readOnly: true },
    );
  }

  /**
   * Method execute
   *
   * @description
   * Runs `work` through the kit's runner with the requirements of the transaction, then wakes the
   * relay when the run appended events.
   *
   * @param {(store: TasksStore) => Promise<TResult>} work - The unit of work.
   * @param {TransactionOptions} options - Isolation and read-only requirements.
   * @returns {Promise<TResult>} What the work resolved with.
   */
  private async execute<TResult>(
    work: (store: TasksStore) => Promise<TResult>,
    options: TransactionOptions,
  ): Promise<TResult> {
    const appends: { count: number } = { count: 0 };
    const result: TResult = await this.runner.run(
      (transaction: TransactionScope): Promise<TResult> =>
        work({
          savepoint: (attempt) => withTaskSavepoint(transaction, attempt),
          intakeContacts: this.intakeContacts,
          tasks: new DrizzleTaskRepository(transaction.db),
          customFields: new DrizzleCustomFieldRepository(transaction.db),
          time: new DrizzleTaskTimeRepository(transaction.db),
          copies: new DrizzleTaskCopiesRepository(transaction.db),
          watcherOverrides: new DrizzleWatcherOverrideRepository(transaction.db),
          reader: new DrizzleTaskReader(transaction.db),
          activity: new DrizzleActivityRepository(transaction.db),
          queries: new DrizzleTaskQueryReader(transaction.db),
          counter: new DrizzleTaskCounter(transaction.db),
          assigned: new DrizzleAssignedTaskReader(transaction.db),
          labels: new DrizzleLabelReader(transaction.db),
          archives: new DrizzleArchiveReader(transaction.db),
          trash: new DrizzleTrashEntryRepository(transaction.db),
          dependencies: new DrizzleTaskDependencyRepository(transaction.db),
          jobs: new JobsTrashJobs(transaction, this.jobs),

          events: new OutboxTaskEvents(transaction, this.outbox, (): void => {
            appends.count += 1;
          }),
          clock: new PostgresqlTransactionClock(transaction.db),
        }),
      options,
    );
    if (appends.count > 0) {
      this.relay.wake();
    }
    return result;
  }
  // #endregion
}
