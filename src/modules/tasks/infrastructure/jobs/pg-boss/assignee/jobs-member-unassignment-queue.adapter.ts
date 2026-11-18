import type { TransactionScope } from '@cadenway/nest-common/database';
import type { JobEnqueueResult, JobProducer } from '@cadenway/nest-jobs/runtime';

import { UNASSIGN_REMOVED_MEMBER_QUEUE } from '../../../../../../config/job-queues.js';
import type { MemberUnassignmentQueue } from '../../../../application/ports/outbound/jobs/assignee/member-unassignment-queue.port.js';

/**
 * Interface UnassignmentJobPayload
 *
 * @description
 * The stored payload of an unassignment job: the account only. The organization travels in the
 * envelope of the kit, from the transaction that enqueued it. A stored format: fields are only
 * ever added.
 */
interface UnassignmentJobPayload {
  // #region Properties
  /** The account of the member who left. */
  readonly userId: string;
  // #endregion
}

/**
 * Class JobsMemberUnassignmentQueue
 *
 * @description
 * `MemberUnassignmentQueue` on the `task.unassign-removed-member` queue of `@cadenway/nest-jobs`,
 * bound to the tenant transaction of a unit of work: the job row is inserted through the
 * connection of that transaction, so it exists if and only if the transaction commits. The
 * occurrence key is the membership and its version after the removal (`<memberId>:<version>`),
 * which the kit scopes to the organization of the transaction: a redelivered or requeued removal
 * enqueues nothing more, while the removal of a later membership of the same account, which has
 * its own member id and can reach the same version, is a new occurrence.
 */
export class JobsMemberUnassignmentQueue implements MemberUnassignmentQueue {
  // #region Properties
  /**
   * Property transaction
   *
   * @description
   * The tenant transaction of the unit of work.
   *
   * @type {TransactionScope}
   * @readonly
   */
  private readonly transaction: TransactionScope;

  /**
   * Property jobs
   *
   * @description
   * The producer of `@cadenway/nest-jobs`.
   *
   * @type {JobProducer}
   * @readonly
   */
  private readonly jobs: JobProducer;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Binds the queue to a transaction.
   *
   * @param {TransactionScope} transaction - The tenant transaction of the unit of work.
   * @param {JobProducer} jobs - The producer of `@cadenway/nest-jobs`.
   * @constructor
   */
  public constructor(transaction: TransactionScope, jobs: JobProducer) {
    this.transaction = transaction;
    this.jobs = jobs;
  }
  // #endregion

  // #region Methods
  /**
   * Method enqueue
   *
   * @description
   * Enqueues the unassignment of one removal once per membership and version.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The account of the member who left.
   * @param {string} memberId - The membership that ended.
   * @param {number} membershipVersion - Its version after the removal.
   * @returns {Promise<boolean>} `true` when a job was inserted, `false` for a duplicate.
   * @throws {Error} When the organization is not the one of the transaction: the job would run in
   * the wrong tenant.
   */
  public async enqueue(
    organizationId: string,
    userId: string,
    memberId: string,
    membershipVersion: number,
  ): Promise<boolean> {
    if (this.transaction.organizationId !== organizationId) {
      throw new Error('The unassignment job names another organization than its transaction.');
    }
    const payload: UnassignmentJobPayload = { userId };
    const result: JobEnqueueResult = await this.jobs.enqueue(
      this.transaction,
      UNASSIGN_REMOVED_MEMBER_QUEUE,
      payload,
      { occurrenceKey: `${memberId}:${String(membershipVersion)}` },
    );
    return !result.duplicate;
  }
  // #endregion
}
