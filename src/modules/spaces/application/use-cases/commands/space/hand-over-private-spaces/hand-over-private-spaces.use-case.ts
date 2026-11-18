import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { SpaceUpdate } from '../../../../../domain/value-objects/space/space-update.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import type { HandOverPrivateSpacesInput } from './hand-over-private-spaces.input.js';

/**
 * Constant SYSTEM_ACTOR
 *
 * @description
 * The actor of the handover: nobody acts through the API, task-service itself changes the owner
 * (`Actor` of `asyncapi/task-service.yaml`).
 */
const SYSTEM_ACTOR: EventActor = { type: 'system', id: 'task-service' };

/**
 * Class HandOverPrivateSpaces
 *
 * @description
 * Passes the private spaces a member owned to the owner of the organization when the member leaves
 * it ("Members" of `openapi/internal/task-service.yaml`: reaction to `member.removed.v1`). Each
 * space is locked, changed (`Space.handOver`) and written, and `space.updated.v1` (field
 * `ownerUserId`, actor `{ type: 'system', id: 'task-service' }`) is appended, all in the tenant
 * transaction of the event, which the deduplicator of the caller opened and `run` joins: the
 * handover and its events commit together, or the event is redelivered. Idempotent: once the
 * spaces have passed, the former member owns none and a second run finds nothing. It hands nothing
 * over while the copy still holds the account as a member, under another membership of the same
 * person (a removal of an old membership that arrives after a new join). When the former member owns
 * no private space it returns without asking for the owner of the organization; when it owns some
 * and the copy does not hold the owner yet, it throws, so the event is redelivered on its schedule
 * rather than leaving the spaces with an owner who is gone.
 */
export class HandOverPrivateSpaces {
  // #region Properties
  /**
   * Property unitOfWork
   *
   * @description
   * The tenant transaction of the event.
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
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Hands the private spaces of the former member over to the owner of the organization.
   *
   * @param {HandOverPrivateSpacesInput} input - The organization and the member who left.
   * @returns {Promise<void>} Resolves once handed over, or at once when there is nothing to hand.
   * @throws {Error} When the owner of the organization is not known yet.
   */
  public async execute(input: HandOverPrivateSpacesInput): Promise<void> {
    await this.unitOfWork.run(async (store: SpacesStore): Promise<void> => {
      // The removal of an old membership may reach the copy after the same person joined again
      // under a new one: the account is still a member, and its spaces stay its own.
      if ((await this.members.roleOf(input.organizationId, input.formerOwnerUserId)) !== null) {
        return;
      }
      const spaces: Space[] = await store.spaces.lockPrivateOwnedBy(
        input.organizationId,
        input.formerOwnerUserId,
      );
      // Nothing to hand over: the removal must not wait for an owner it does not need.
      if (spaces.length === 0) {
        return;
      }
      const ownerUserId: string | null = await this.members.ownerOf(input.organizationId);
      if (ownerUserId === null) {
        throw new Error('The owner of the organization is not known yet.');
      }
      if (ownerUserId === input.formerOwnerUserId) {
        return;
      }
      for (const stored of spaces) {
        const { space, changed }: SpaceUpdate = stored.handOver(ownerUserId);
        if (changed.length > 0) {
          await store.spaces.update(space);
          await store.events.spaceUpdated(space, changed, SYSTEM_ACTOR);
        }
      }
    });
  }
  // #endregion
}
