import { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import { SpaceStatusRequiredError } from '../../../../../domain/errors/space/space-status-required.error.js';
import { SpaceVisibilityForbiddenError } from '../../../../../domain/errors/space/space-visibility-forbidden.error.js';
import {
  canEdit,
  canManageSpace,
} from '../../../../../domain/policies/access/access-role.policy.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { SpaceUpdate } from '../../../../../domain/value-objects/space/space-update.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import type { CheckedLock } from '../../../../models/access/checked-lock.model.js';
import type { ViewerAccess } from '../../../../models/access/viewer-access.model.js';
import type { SpaceRefusalReason } from '../../../../models/space/space-refusal-reason.model.js';
import { SpaceRefusal } from '../../../../models/space/space-refusal.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpaceTemplateSources } from '../../../../ports/outbound/library/space/space-template-sources.port.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { AccessResolver } from '../../../../services/access/access-resolver.service.js';
import { CheckedLocker } from '../../../../services/access/checked-locker.service.js';
import { OwnerGrantsRemover } from '../../../../services/access/owner-grants-remover.service.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { SpaceViewBuilder } from '../../../../services/space/space-view-builder.service.js';
import type { UpdateSpaceInput } from './update-space.input.js';
import type { UpdateSpaceOutput } from './update-space.output.js';

/**
 * Class UpdateSpace
 *
 * @description
 * Changes a space the actor has `edit` on (`PATCH /internal/v1/spaces/{spaceId}`). The actor is
 * checked on the space read without lock first, then the space is locked until the end of the
 * transaction, so two changes of one space apply one after the other, and the actor is checked
 * again on the locked row when it changed meanwhile (`CheckedLocker`).
 * Refusals, in this order: a space the actor does not see answers `space-not-found`; one they see
 * without `edit` on it `role-insufficient` with their role there (`null` through some of its lists
 * only); an `If-Match` that does not name the stored version `version-mismatch` with it; then the
 * domain decides what changes and who may change it (`Space.update`): a change of the visibility
 * by an actor who does not manage the space answers `visibility-forbidden`, a hidden `todo` or
 * `done` `status-required`. A new prefix is claimed for the space, which answers `prefix-taken`
 * when another space uses or used it (the throw rolls everything back). A patch that changes
 * nothing writes nothing, appends no event and answers the stored version. A change writes the
 * space (its version grows) and appends `space.updated.v1` in the same transaction. The answer
 * carries `callerRole: 'edit'`, the role the change was made with (a change can only remove it,
 * when a space is made private), and whether the actor manages the space after the change. Rules:
 * "Access", "Who changes what", "Prefixes and keys" and "Statuses" of `openapi/public/spaces.yaml`.
 */
export class UpdateSpace {
  // #region Properties
  /**
   * Property unitOfWork
   *
   * @description
   * The tenant transaction of the use case.
   *
   * @type {SpacesUnitOfWork}
   * @readonly
   */
  private readonly unitOfWork: SpacesUnitOfWork;

  /**
   * Property viewers
   *
   * @description
   * Resolves the acting member.
   *
   * @type {ViewerResolver}
   * @readonly
   */
  private readonly viewers: ViewerResolver;

  /**
   * Property members
   *
   * @description
   * The copy of the memberships, to tell whether the owner of a space made private is still a
   * member, and who owns the organization.
   *
   * @type {MemberDirectory}
   * @readonly
   */
  private readonly members: MemberDirectory;

  /**
   * Property access
   *
   * @description
   * Decides what the actor reaches of the space.
   *
   * @type {AccessResolver}
   * @readonly
   */
  private readonly access: AccessResolver;

  /**
   * Property ownerGrants
   *
   * @description
   * Removes the grants of the owner of the organization on a space handed over to them.
   *
   * @type {OwnerGrantsRemover}
   * @readonly
   */
  private readonly ownerGrants: OwnerGrantsRemover;

  /**
   * Property views
   *
   * @description
   * Adds the next key to the space.
   *
   * @type {SpaceViewBuilder}
   * @readonly
   */
  private readonly views: SpaceViewBuilder;

  /**
   * Property locker
   *
   * @description
   * Checks the actor before the lock, and again on a row that changed.
   *
   * @type {CheckedLocker}
   * @readonly
   */
  private readonly locker: CheckedLocker;
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
   * @param {SpaceTemplateSources} templateSources - Template provenance for a visibility increase.
   * @constructor
   */
  public constructor(
    unitOfWork: SpacesUnitOfWork,
    members: MemberDirectory,
    private readonly templateSources: SpaceTemplateSources,
  ) {
    this.unitOfWork = unitOfWork;
    this.viewers = new ViewerResolver(members);
    this.members = members;
    this.access = new AccessResolver();
    this.ownerGrants = new OwnerGrantsRemover();
    this.views = new SpaceViewBuilder();
    this.locker = new CheckedLocker();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Applies the patch.
   *
   * @param {UpdateSpaceInput} input - The actor, the space, the versions `If-Match` accepts (`null`
   * when absent) and the patch.
   * @returns {Promise<UpdateSpaceOutput>} The space after the change, with its next key.
   * @throws {SpaceRefusal} `organization-not-found`, `space-not-found`, `role-insufficient`,
   * `version-mismatch`, `visibility-forbidden`, `status-required` or `prefix-taken`.
   * @throws {InvalidSpaceError} When the domain refuses a value the API layer let through.
   */
  public async execute(input: UpdateSpaceInput): Promise<UpdateSpaceOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<UpdateSpaceOutput> => {
      const viewer: Viewer = await this.viewers.resolve(
        input.organizationId,
        input.actorUserId,
        true,
      );
      const checked: CheckedLock<Space, SpaceRefusalReason> = await this.locker.space(
        store,
        input.organizationId,
        input.spaceId,
        'update',
        async (space: Space): Promise<SpaceRefusalReason | null> => {
          const access: ViewerAccess = await this.access.resolve(
            store.grants,
            viewer,
            space.snapshot,
            null,
          );
          if (!access.seesSpace) {
            return { reason: 'space-not-found' };
          }
          return canEdit(access.spaceRole)
            ? null
            : { reason: 'role-insufficient', role: access.spaceRole };
        },
      );
      if (checked.outcome === 'unknown') {
        throw new SpaceRefusal({ reason: 'space-not-found' });
      }
      if (checked.outcome === 'refused') {
        throw new SpaceRefusal(checked.refusal);
      }
      const stored: Space = checked.locked;
      const storedVersion: number = stored.snapshot.version;
      if (input.expectedVersions !== null && !input.expectedVersions.includes(storedVersion)) {
        throw new SpaceRefusal({ reason: 'version-mismatch', version: storedVersion });
      }
      const { space, changed }: SpaceUpdate = await this.keepVisible(
        this.applyPatch(stored, input, viewer),
        input.organizationId,
      );
      if (changed.includes('visibility') && space.snapshot.visibility === 'organization') {
        await this.requireShareableTemplates(store, input.organizationId, space.snapshot.id);
      }
      if (changed.length > 0) {
        if (changed.includes('prefix')) {
          const claimed: boolean = await store.prefixes.claim(
            input.organizationId,
            space.snapshot.prefix,
            space.snapshot.id,
          );
          if (!claimed) {
            throw new SpaceRefusal({ reason: 'prefix-taken', prefix: space.snapshot.prefix });
          }
        }
        const actor: EventActor = { type: 'user', id: input.actorUserId };
        await store.spaces.update(space);
        await store.events.spaceUpdated(space, changed, actor);
        if (changed.includes('ownerUserId')) {
          await this.ownerGrants.remove(
            store,
            space.snapshot.ownerUserId,
            [{ space, formerOwnerUserId: stored.snapshot.ownerUserId }],
            actor,
          );
        }
      }
      return this.views.buildOne(store.prefixes, input.organizationId, space.snapshot, {
        callerRole: 'edit',
        callerCanManage: canManageSpace(space.snapshot, viewer),
      });
    });
  }

  /** Keeps the source lists stable between the library audit and publication of the space. */
  private async requireShareableTemplates(
    store: SpacesStore,
    organizationId: string,
    spaceId: string,
  ): Promise<void> {
    const sourceIds: string[] = [];
    for (const listId of await this.templateSources.execute(organizationId, spaceId)) {
      if (listId === null) {
        throw new SpaceRefusal({ reason: 'visibility-forbidden' });
      }
      sourceIds.push(listId);
    }
    if (sourceIds.length === 0) return;
    const lists = await store.lists.lockMany(organizationId, sourceIds, 'share');
    if (
      lists.length !== sourceIds.length ||
      lists.some(
        ({ snapshot }) =>
          snapshot.spaceId !== spaceId ||
          snapshot.deletedAt !== null ||
          snapshot.archivedAt !== null ||
          !snapshot.organizationAccess,
      )
    ) {
      throw new SpaceRefusal({ reason: 'visibility-forbidden' });
    }
  }

  /**
   * Method keepVisible
   *
   * @description
   * A space of the whole organization may keep a former member as owner; made private, it would be
   * seen by nobody. Its owner then becomes the owner of the organization, in the same change, as
   * when the owner of a private space leaves (`changed` gains `ownerUserId`). Refused with
   * `visibility-forbidden` while the copy does not hold the owner of the organization.
   *
   * @param {SpaceUpdate} update - The space after the patch.
   * @param {string} organizationId - The organization of the transaction.
   * @returns {Promise<SpaceUpdate>} The change to write.
   * @throws {SpaceRefusal} `visibility-forbidden` when nobody could see the private space.
   */
  private async keepVisible(update: SpaceUpdate, organizationId: string): Promise<SpaceUpdate> {
    const { space, changed } = update;
    if (!changed.includes('visibility') || space.snapshot.visibility !== 'private') {
      return update;
    }
    if ((await this.members.roleOf(organizationId, space.snapshot.ownerUserId)) !== null) {
      return update;
    }
    const ownerUserId: string | null = await this.members.ownerOf(organizationId);
    if (ownerUserId === null) {
      throw new SpaceRefusal({ reason: 'visibility-forbidden' });
    }
    const handed: SpaceUpdate = space.handOver(ownerUserId);
    // One change, one next version: the patch already took it.
    return {
      space: Space.restore({ ...handed.space.snapshot, version: space.snapshot.version }),
      changed: [...changed, ...handed.changed.filter((field) => !changed.includes(field))],
    };
  }

  /**
   * Method applyPatch
   *
   * @description
   * Calls the domain and maps its refusals to those of the use case.
   *
   * @param {Space} stored - The locked space.
   * @param {UpdateSpaceInput} input - The request.
   * @param {Viewer} viewer - The acting member.
   * @returns {SpaceUpdate} The space after the patch and what changed.
   * @throws {SpaceRefusal} `visibility-forbidden` or `status-required`.
   */
  private applyPatch(stored: Space, input: UpdateSpaceInput, viewer: Viewer): SpaceUpdate {
    try {
      return stored.update(input.patch, viewer);
    } catch (error: unknown) {
      if (error instanceof SpaceVisibilityForbiddenError) {
        throw new SpaceRefusal({ reason: 'visibility-forbidden' });
      }
      if (error instanceof SpaceStatusRequiredError) {
        throw new SpaceRefusal({ reason: 'status-required', status: error.status });
      }
      throw error;
    }
  }
  // #endregion
}
