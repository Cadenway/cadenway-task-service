import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import { announcesChanges } from '../../../../../domain/policies/list/list-state.policy.js';
import type { SpaceUpdate } from '../../../../../domain/value-objects/space/space-update.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { OwnerGrantsRemover } from '../../../../services/access/owner-grants-remover.service.js';
import type { HandOverPrivateSpacesInput } from './hand-over-private-spaces.input.js';
import type { HandOverPrivateSpacesOutput } from './hand-over-private-spaces.output.js';

/**
 * Constant HAND_OVER_BATCH_SIZE
 *
 * @description
 * How many private spaces one batch locks and hands over, in one tenant transaction: each costs
 * one update and, when handed over, one outbox append, and one reading finds the grants the owner
 * of the organization held on the batch (usually none), so a full batch is about 200 round trips,
 * far under the 10 s statement timeout of the application role, and a request waits for a space
 * of a batch at most its 5 s lock timeout.
 *
 * @type {number}
 */
const HAND_OVER_BATCH_SIZE: number = 100;

/**
 * Constant SYSTEM_ACTOR
 *
 * @description
 * The actor of the handover: nobody acts through the API, task-service itself changes the owner
 * (`Actor` of `asyncapi/task-service.yaml`).
 *
 * @type {EventActor}
 */
const SYSTEM_ACTOR: EventActor = { type: 'system', id: 'task-service' };

/**
 * Class HandOverPrivateSpaces
 *
 * @description
 * One batch of the passing of the private spaces a member owned to the owner of the organization
 * once the member left it ("Members" of `openapi/internal/task-service.yaml`: reaction to
 * `member.removed.v1`). The clean-up job of member-lifecycle calls it in the organization context
 * of the job, after the removal committed, until it answers `none-left` or `member-again`; each
 * call runs in one tenant transaction, which `run` opens:
 *
 * 1. it locks up to 100 private spaces still owned by the former member and not awaiting an owner,
 *    in the order of their creation, `FOR NO KEY UPDATE`;
 * 2. then it reads the copy of the memberships: when the copy holds the account as a member again,
 *    it changes nothing (`member-again`), so a person who joined again keeps their spaces;
 * 3. otherwise it gives each space to the owner of the organization (`Space.handOver`) and appends
 *    `space.updated.v1` (field `ownerUserId`, actor `{ type: 'system', id: 'task-service' }`); while
 *    the copy does not hold that owner, it marks the spaces awaiting one, seen by nobody, without
 *    event, and `HandOverAwaitingSpaces` gives them to the owner once the copy learns it; a deleted
 *    space (a tombstone) is handed over all the same, without event until it comes back;
 * 4. a grant the owner of the organization held on a space handed over to them, or on one of its
 *    lists, is removed with its access event (`OwnerGrantsRemover`): an owner holds no grant.
 *
 * The spaces of a batch, their versions and their events commit together, or the batch rolls back
 * alone. A handed-over or awaiting space leaves the filter of step 1, so the next call goes on with
 * the next spaces, and a call once none is left changes nothing: the handover is idempotent. Until
 * the job reaches a space, the space stays owned by a person who is no longer a member, so nobody
 * sees it (fail closed). The removal itself hands nothing over (decision revised again by the
 * coordinating session in PR 2 of P3a).
 */
export class HandOverPrivateSpaces {
  // #region Properties
  /**
   * Property unitOfWork
   *
   * @description
   * The tenant transaction of each batch.
   *
   * @type {SpacesUnitOfWork}
   * @readonly
   */
  private readonly unitOfWork: SpacesUnitOfWork;

  /**
   * Property members
   *
   * @description
   * The copy of the memberships, which knows the owner of the organization.
   *
   * @type {MemberDirectory}
   * @readonly
   */
  private readonly members: MemberDirectory;

  /**
   * Property ownerGrants
   *
   * @description
   * Removes the grants of the owner of the organization on the spaces handed over to them.
   *
   * @type {OwnerGrantsRemover}
   * @readonly
   */
  private readonly ownerGrants: OwnerGrantsRemover;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the transaction port and the directory of the members.
   *
   * @param {SpacesUnitOfWork} unitOfWork - The tenant transaction.
   * @param {MemberDirectory} members - The copy of the memberships.
   * @constructor
   */
  public constructor(unitOfWork: SpacesUnitOfWork, members: MemberDirectory) {
    this.unitOfWork = unitOfWork;
    this.members = members;
    this.ownerGrants = new OwnerGrantsRemover();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Hands one batch of the private spaces of the former member over to the owner of the
   * organization, or marks it awaiting one.
   *
   * @param {HandOverPrivateSpacesInput} input - The organization and the member who left.
   * @returns {Promise<HandOverPrivateSpacesOutput>} What the batch did.
   * @throws {Error} When the database fails, a lock or statement timeout included: the batch rolls
   * back alone, and the job retries it.
   */
  public async execute(input: HandOverPrivateSpacesInput): Promise<HandOverPrivateSpacesOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<HandOverPrivateSpacesOutput> => {
      const spaces: Space[] = await store.spaces.lockPrivateOwnedBy(
        input.organizationId,
        input.formerOwnerUserId,
        HAND_OVER_BATCH_SIZE,
      );
      if (spaces.length === 0) {
        return { outcome: 'none-left' };
      }
      // Read after the lock, so that a re-join committed before it is seen. The removal of an old
      // membership may also come after the same person joined again under a new one.
      if ((await this.members.roleOf(input.organizationId, input.formerOwnerUserId)) !== null) {
        return { outcome: 'member-again' };
      }
      const ownerUserId: string | null = await this.members.ownerOf(input.organizationId);
      if (ownerUserId === null) {
        // Not a failure: the spaces fail closed (seen by nobody) and pass to the owner as soon as
        // the copy learns it (HandOverAwaitingSpaces).
        for (const stored of spaces) {
          await store.spaces.update(stored.awaitOwner());
        }
        return { outcome: 'handed-over', handedOver: 0, awaitingOwner: spaces.length };
      }
      // The copy names the former member the owner of the organization: it still holds them, and
      // no space would leave the filter, so the job stops as for a re-join.
      if (ownerUserId === input.formerOwnerUserId) {
        return { outcome: 'member-again' };
      }
      const handed: { readonly space: Space; readonly formerOwnerUserId: string }[] = [];
      for (const stored of spaces) {
        const { space, changed }: SpaceUpdate = stored.handOver(ownerUserId);
        if (changed.length > 0) {
          await store.spaces.update(space);
          // A tombstone changes owner all the same, and emits nothing until it comes back.
          if (announcesChanges(space.snapshot)) {
            await store.events.spaceUpdated(space, changed, SYSTEM_ACTOR);
          }
          handed.push({ space, formerOwnerUserId: input.formerOwnerUserId });
        }
      }
      await this.ownerGrants.remove(store, ownerUserId, handed, SYSTEM_ACTOR);
      return { outcome: 'handed-over', handedOver: handed.length, awaitingOwner: 0 };
    });
  }
  // #endregion
}
