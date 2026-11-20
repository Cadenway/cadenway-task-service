import type { AccessRequestsStore } from '../../../../models/transactions/access-requests-store.model.js';
import type { AccessRequestsUnitOfWork } from '../../../../ports/outbound/transactions/access-request/access-requests-unit-of-work.port.js';
import type { DropTargetAccessRequestsInput } from './drop-target-access-requests.input.js';
import type { DropTargetAccessRequestsOutput } from './drop-target-access-requests.output.js';

/**
 * Constant MAX_TASK_IDS
 *
 * @description
 * The most tasks one call drops the requests of: one statement with one array parameter, whatever
 * the count. The jobs of deletion-lifecycle give larger sets in chunks of this size (an entry holds
 * the archived subtasks of its root, which the product does not limit), so more is a defect of the
 * caller.
 *
 * @type {number}
 */
const MAX_TASK_IDS: number = 2_000;

/**
 * Class DropTargetAccessRequests
 *
 * @description
 * Drops the pending access requests of a deleted target ("The pending requests of a target that is
 * deleted ... are dropped" of `openapi/public/access.yaml`; `deleteListInternal` and
 * `deleteSpaceInternal` of `openapi/internal/task-service.yaml`), for the jobs of the
 * deletion-lifecycle module: the task requests of the tasks a job moved to the trash (or found in
 * the trash or erased), the list requests of a deleted list, the space requests of a deleted space
 * and the list requests of its lists.
 * The job decides on the locked rows that the target is still deleted. One statement in the tenant transaction of the caller, which `run` joins (or its own),
 * without event: the contract defines none for a dropped request.
 *
 * Only pending requests go. An answered request stays, with the history the requester was answered
 * with, until the requester leaves the organization. An approval or a refusal that holds a pending
 * request makes the statement wait for it, then the request is no longer pending and stays. Until
 * the job drops them, the requests of a target in the trash are already hidden: the target is no
 * longer found, so nobody reads or answers them. A call once nothing is left deletes nothing: the
 * operation is idempotent.
 */
export class DropTargetAccessRequests {
  // #region Properties
  /**
   * Property unitOfWork
   *
   * @description
   * The tenant transaction of the call, joined to the one of its caller.
   *
   * @type {AccessRequestsUnitOfWork}
   * @readonly
   */
  private readonly unitOfWork: AccessRequestsUnitOfWork;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the transaction port of the module.
   *
   * @param {AccessRequestsUnitOfWork} unitOfWork - The tenant transaction.
   * @constructor
   */
  public constructor(unitOfWork: AccessRequestsUnitOfWork) {
    this.unitOfWork = unitOfWork;
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Deletes the pending requests of the target.
   *
   * @param {DropTargetAccessRequestsInput} input - The organization and the deleted target, whose
   * ids the caller validated.
   * @returns {Promise<DropTargetAccessRequestsOutput>} How many requests were deleted.
   * @throws {Error} When more than 2,000 tasks are given (a defect of the caller), before any
   * statement; when the database fails, a lock or statement timeout included: the transaction rolls
   * back.
   */
  public async execute(
    input: DropTargetAccessRequestsInput,
  ): Promise<DropTargetAccessRequestsOutput> {
    if (input.target.kind === 'tasks' && input.target.taskIds.length > MAX_TASK_IDS) {
      throw new Error(
        `The requests of at most ${String(MAX_TASK_IDS)} tasks are dropped at once, ${String(input.target.taskIds.length)} were given.`,
      );
    }
    const dropped: number = await this.unitOfWork.run(
      (store: AccessRequestsStore): Promise<number> =>
        store.requests.deletePendingOf(input.organizationId, input.target),
    );
    return { dropped };
  }
  // #endregion
}
