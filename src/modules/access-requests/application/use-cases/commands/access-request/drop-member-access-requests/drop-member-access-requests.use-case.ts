import type { MemberRole } from '../../../../../domain/value-objects/member/member-role.value-object.js';
import type { AccessRequestsStore } from '../../../../models/transactions/access-requests-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { AccessRequestsUnitOfWork } from '../../../../ports/outbound/transactions/access-request/access-requests-unit-of-work.port.js';
import type { DropMemberAccessRequestsInput } from './drop-member-access-requests.input.js';
import type { DropMemberAccessRequestsOutput } from './drop-member-access-requests.output.js';

/**
 * Constant DROP_BATCH_SIZE
 *
 * @description
 * How many pending requests one batch locks and deletes, in one tenant transaction: one locking
 * read, one read of the copy and two deletes, whatever the size, so a batch stays far under the
 * 10 s statement timeout of the application role.
 *
 * @type {number}
 */
const DROP_BATCH_SIZE: number = 500;

/**
 * Class DropMemberAccessRequests
 *
 * @description
 * One batch of the dropping of the pending requests of a member who left the organization ("The
 * pending requests ... of a person who leaves the organization, are dropped" of
 * `openapi/public/access.yaml`; "Members" of `openapi/internal/task-service.yaml`). The clean-up job
 * of member-lifecycle calls it in the organization context of the job, after the removal committed,
 * until it answers `none-left` or `member-again`; each call runs in one tenant transaction, which
 * `run` opens:
 *
 * 1. it locks up to 500 pending requests of the account, in id order, `FOR UPDATE`, so that an
 *    approval or a refusal running meanwhile is serialized with it;
 * 2. then it reads the copy of the memberships without lock: when the copy holds the account as a
 *    member again, it changes nothing (`member-again`) and the job stops for good;
 * 3. otherwise it deletes the locked requests and the attempts of the account (they only count
 *    towards its hourly limit), and answers `dropped`, or `none-left` when no request was locked.
 *
 * Answered requests are kept: they are history, the approvals among them gave grants that the
 * clean-up removes on its own. No event: the contract defines none for a dropped request. A dropped
 * request leaves the filter of step 1, so the next call goes on with the next ones, and a call once
 * none is left changes nothing: the batch is idempotent.
 */
export class DropMemberAccessRequests {
  // #region Properties
  /**
   * Property unitOfWork
   *
   * @description
   * The tenant transaction of each batch.
   *
   * @type {AccessRequestsUnitOfWork}
   * @readonly
   */
  private readonly unitOfWork: AccessRequestsUnitOfWork;

  /**
   * Property members
   *
   * @description
   * The copy of the memberships.
   *
   * @type {MemberDirectory}
   * @readonly
   */
  private readonly members: MemberDirectory;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the transaction port and the directory of the members.
   *
   * @param {AccessRequestsUnitOfWork} unitOfWork - The tenant transaction.
   * @param {MemberDirectory} members - The copy of the memberships.
   * @constructor
   */
  public constructor(unitOfWork: AccessRequestsUnitOfWork, members: MemberDirectory) {
    this.unitOfWork = unitOfWork;
    this.members = members;
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Drops one batch of the pending requests of the former member.
   *
   * @param {DropMemberAccessRequestsInput} input - The organization and the member who left.
   * @returns {Promise<DropMemberAccessRequestsOutput>} What the batch did.
   * @throws {Error} When the database fails, a lock or statement timeout included: the batch rolls
   * back alone, and the job retries it.
   */
  public async execute(
    input: DropMemberAccessRequestsInput,
  ): Promise<DropMemberAccessRequestsOutput> {
    return this.unitOfWork.run(
      async (store: AccessRequestsStore): Promise<DropMemberAccessRequestsOutput> => {
        const ids: readonly string[] = await store.requests.lockPendingOf(
          input.organizationId,
          input.userId,
          DROP_BATCH_SIZE,
        );
        // Read after the lock, so that a re-join committed before it is seen.
        const role: MemberRole | null = await this.members.roleOf(
          input.organizationId,
          input.userId,
        );
        if (role !== null) {
          return { outcome: 'member-again' };
        }
        await store.attempts.deleteAll(input.organizationId, input.userId);
        if (ids.length === 0) {
          return { outcome: 'none-left' };
        }
        const dropped: number = await store.requests.deleteRequests(input.organizationId, ids);
        return { outcome: 'dropped', dropped };
      },
    );
  }
  // #endregion
}
