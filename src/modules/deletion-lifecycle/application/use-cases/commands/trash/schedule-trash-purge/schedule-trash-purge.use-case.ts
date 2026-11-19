import { DeletionStepError } from '../../../../models/deletion/deletion-step-error.model.js';
import type { TrashPurgeScheduleStore } from '../../../../models/transactions/trash-purge-schedule-store.model.js';
import type { OrganizationsWithTrash } from '../../../../ports/outbound/tasks/trash/organizations-with-trash.port.js';
import type { TrashPurgeScheduleUnitOfWork } from '../../../../ports/outbound/transactions/trash/trash-purge-schedule-unit-of-work.port.js';
import type { ScheduleTrashPurgeInput } from './schedule-trash-purge.input.js';
import type { ScheduleTrashPurgeOutput } from './schedule-trash-purge.output.js';

/**
 * Constant PAGE_SIZE
 *
 * @description
 * How many organizations one page reads and one system transaction enqueues a job for: one read of
 * ids, then one insert per organization, in a transaction that stays short.
 *
 * @type {number}
 */
const PAGE_SIZE: number = 1_000;

/**
 * Class ScheduleTrashPurge
 *
 * @description
 * The work of the daily `task.schedule-trash-purge` job (03:00 UTC, "erased for good 30 days after
 * its deletion, by a daily job in bounded batches" of `openapi/public/trash.yaml`). Page after page
 * of 1,000, by id:
 *
 * 1. the organizations holding an entry due or handed over (`ListOrganizationsWithTrashToPurge` of
 *    tasks, in a read-only system transaction of its own), ids only: the only read of the deletion
 *    jobs that crosses organizations;
 * 2. one `task.purge-trash` job per organization, in the envelope of that organization, with the
 *    occurrence key `scheduled:<job id of the schedule>`, in one system transaction of
 *    `TrashPurgeScheduleUnitOfWork`, which inserts job rows only.
 *
 * The table of the entries is the source of truth, not the queue: a missed occurrence leaves the
 * entries for the next one, and an attempt run again enqueues nothing for the organizations its
 * first attempt enqueued, while their jobs are kept. It stops after a page shorter than 1,000 and
 * reads no page once the signal of its attempt aborted. A failed read or enqueue rejects with a
 * `DeletionStepError` of the step `schedule`, with the pages enqueued before it; those stay
 * enqueued.
 */
export class ScheduleTrashPurge {
  // #region Properties
  /** The organizations with trash to erase. */
  private readonly organizations: OrganizationsWithTrash;

  /** The system transaction of the enqueue of each page. */
  private readonly unitOfWork: TrashPurgeScheduleUnitOfWork;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the read of the organizations and the unit of work of the enqueue.
   *
   * @param {OrganizationsWithTrash} organizations - The organizations with trash to erase.
   * @param {TrashPurgeScheduleUnitOfWork} unitOfWork - The system transaction of each page.
   * @constructor
   */
  public constructor(
    organizations: OrganizationsWithTrash,
    unitOfWork: TrashPurgeScheduleUnitOfWork,
  ) {
    this.organizations = organizations;
    this.unitOfWork = unitOfWork;
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Enqueues the purge of every organization with an entry due or handed over, page after page.
   *
   * @param {ScheduleTrashPurgeInput} input - The id of the scheduled job and the signal of its
   * attempt.
   * @returns {Promise<ScheduleTrashPurgeOutput>} What it enqueued.
   * @throws {DeletionStepError} Of the step `schedule`, when a read or an enqueue fails: the pages
   * before stay enqueued, and the retry of the job enqueues the others.
   * @throws {Error} The reason of the signal once it aborted, as it is.
   */
  public async execute(input: ScheduleTrashPurgeInput): Promise<ScheduleTrashPurgeOutput> {
    const occurrenceKey: string = `scheduled:${input.jobId}`;
    let organizations: number = 0;
    let enqueued: number = 0;
    let pages: number = 0;
    let after: string | null = null;
    for (;;) {
      input.signal?.throwIfAborted();
      const from: string | null = after;
      const committed: number = pages;
      const page: readonly string[] = await this.schedule(committed, () =>
        this.organizations.page(from, PAGE_SIZE),
      );
      pages += 1;
      if (page.length > 0) {
        enqueued += await this.schedule(committed, () =>
          this.unitOfWork.run(async (store: TrashPurgeScheduleStore): Promise<number> => {
            let inserted: number = 0;
            for (const organizationId of page) {
              const added: boolean = await store.purges.enqueue(
                organizationId.toLowerCase(),
                occurrenceKey,
              );
              inserted += added ? 1 : 0;
            }
            return inserted;
          }),
        );
        organizations += page.length;
      }
      const last: string | undefined = page.at(-1);
      if (page.length < PAGE_SIZE || last === undefined) {
        return { organizations, enqueued, pages };
      }
      after = last;
    }
  }

  /**
   * Method schedule
   *
   * @description
   * Runs one read or one enqueue of the schedule, and turns its failure into a `DeletionStepError`
   * of the step `schedule` with the pages handled before it.
   *
   * @param {number} pages - The pages handled before.
   * @param {() => Promise<TResult>} run - The read or the transaction.
   * @returns {Promise<TResult>} What it resolved with.
   * @throws {DeletionStepError} When it fails.
   */
  private async schedule<TResult>(pages: number, run: () => Promise<TResult>): Promise<TResult> {
    try {
      return await run();
    } catch (error: unknown) {
      throw new DeletionStepError('schedule', pages, error);
    }
  }
  // #endregion
}
