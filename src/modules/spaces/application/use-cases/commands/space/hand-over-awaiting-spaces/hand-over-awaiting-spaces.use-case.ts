import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { SpaceUpdate } from '../../../../../domain/value-objects/space/space-update.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import type { HandOverAwaitingSpacesInput } from './hand-over-awaiting-spaces.input.js';

/**
 * Constant SYSTEM_ACTOR
 *
 * @description
 * The actor of the handover: task-service itself changes the owner (`Actor` of
 * `asyncapi/task-service.yaml`).
 *
 * @type {EventActor}
 */
const SYSTEM_ACTOR: EventActor = Object.freeze({ type: 'system', id: 'task-service' });

/**
 * Class HandOverAwaitingSpaces
 *
 * @description
 * Gives the owner of the organization the private spaces that await an owner: their owner left the
 * organization while the copy of the memberships did not hold the owner yet, so the removal
 * committed and the spaces were left seen by nobody (decision of the coordinating session for P3a).
 * Called in the transaction of the member event that made the copy learn the owner, which `run`
 * joins; each space passes with `space.updated.v1` (`changed: ['ownerUserId']`, actor
 * `{ type: 'system', id: 'task-service' }`). Idempotent: a second run finds nothing awaiting.
 */
export class HandOverAwaitingSpaces {
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
   * The copy of the memberships, for the owner of the organization.
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
   * Takes the unit of work and the copy of the memberships.
   *
   * @param {SpacesUnitOfWork} unitOfWork - The tenant transaction of the event.
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
   * Hands every space awaiting an owner over to the owner of the organization.
   *
   * @param {HandOverAwaitingSpacesInput} input - The organization.
   * @returns {Promise<void>} Resolves once handed over, or at once when the copy holds no owner yet
   * or no space awaits one.
   */
  public async execute(input: HandOverAwaitingSpacesInput): Promise<void> {
    await this.unitOfWork.run(async (store: SpacesStore): Promise<void> => {
      const ownerUserId: string | null = await this.members.ownerOf(input.organizationId);
      if (ownerUserId === null) {
        return;
      }
      const spaces: Space[] = await store.spaces.lockAwaitingOwner(input.organizationId);
      for (const stored of spaces) {
        const { space, changed }: SpaceUpdate = stored.handOver(ownerUserId);
        await store.spaces.update(space);
        if (changed.length > 0) {
          await store.events.spaceUpdated(space, changed, SYSTEM_ACTOR);
        }
      }
    });
  }
  // #endregion
}
