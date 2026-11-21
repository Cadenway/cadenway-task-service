import { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import { canEdit } from '../../../../../domain/policies/access/access-role.policy.js';
import { copiedListName } from '../../../../../domain/policies/list/list-name.policy.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import { toVisibleList } from '../../../../mappers/list/visible-list.mapper.js';
import type { ViewerAccess } from '../../../../models/access/viewer-access.model.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import { SpaceRefusal } from '../../../../models/space/space-refusal.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { AccessResolver } from '../../../../services/access/access-resolver.service.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import type { CreateListOutput } from '../create-list/create-list.output.js';
import type { CreateList } from '../create-list/create-list.use-case.js';
import type { CreateListCopyInput } from './create-list-copy.input.js';
import type { CreateListCopyOutput } from './create-list-copy.output.js';

/** Reuses ordinary list creation in the caller's transaction, with the source look and switch. */
export class CreateListCopy {
  // #region Properties
  /** Resolves the invoking member in the tenant transaction. */
  private readonly viewers: ViewerResolver;
  private readonly access = new AccessResolver();
  // #endregion

  // #region Constructor
  /** Uses the ordinary create-list operation and access rules. */
  public constructor(
    private readonly unitOfWork: SpacesUnitOfWork,
    private readonly members: MemberDirectory,
    private readonly create: CreateList,
  ) {
    this.viewers = new ViewerResolver(members);
  }
  // #endregion

  // #region Methods
  /** Creates a live list with the source appearance, switch and usable access for its creator. */
  public async execute(input: CreateListCopyInput): Promise<CreateListCopyOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<CreateListCopyOutput> => {
      const { organizationId, actorUserId, sourceListId } = input;
      const viewer: Viewer = await this.viewers.resolve(organizationId, actorUserId, true);
      const membership = await this.members.grantMembershipOf(organizationId, actorUserId, true);
      const initial: TaskList | null = await store.lists.find(organizationId, sourceListId);
      const space: Space | null =
        initial === null
          ? null
          : await store.spaces.lockShared(organizationId, initial.snapshot.spaceId);
      const source: TaskList | null =
        space === null ? null : await store.lists.lockShared(organizationId, sourceListId);
      if (space === null || source?.snapshot.spaceId !== space.snapshot.id) {
        throw new SpaceRefusal({ reason: 'list-not-found' });
      }
      const permission: ViewerAccess = await this.access.resolve(
        store.grants,
        viewer,
        space.snapshot,
        source.snapshot,
      );
      if (permission.listRole === null) {
        throw new SpaceRefusal({ reason: 'list-not-found' });
      }
      if (!canEdit(permission.listRole) || !canEdit(permission.spaceRole)) {
        throw new SpaceRefusal({
          reason: 'role-insufficient',
          role: canEdit(permission.listRole) ? permission.spaceRole : permission.listRole,
        });
      }
      const { spaceId, name, icon, color, organizationAccess } = source.snapshot;
      const result: CreateListOutput = await this.create.execute({
        organizationId,
        actorUserId,
        spaceId,
        name: copiedListName(name),
        color,
        icon,
        organizationAccess,
        sprint: null,
      });
      const inherited: ViewerAccess = await this.access.resolve(
        store.grants,
        viewer,
        space.snapshot,
        result.list,
      );
      if (canEdit(inherited.listRole)) {
        return toVisibleList(result.list, 'edit');
      }
      const editable: TaskList = await this.keepCreatorAccess(
        store,
        TaskList.restore(result.list),
        actorUserId,
        membership?.memberId ?? null,
      );
      return toVisibleList(editable.snapshot, 'edit');
    });
  }

  /** Grants only the invoking source editor when the ordinary copy's inherited role lacks edit. */
  private async keepCreatorAccess(
    store: SpacesStore,
    list: TaskList,
    userId: string,
    memberId: string | null,
  ): Promise<TaskList> {
    const { id: listId, organizationId, spaceId } = list.snapshot;
    const actor: EventActor = { type: 'user', id: userId };
    if (memberId === null) {
      throw new SpaceRefusal({ reason: 'organization-not-found' });
    }
    await store.grants.put(
      organizationId,
      { kind: 'list', listId, spaceId },
      userId,
      'edit',
      actor,
      memberId,
    );
    const changed: TaskList = list.recordAccessChange();
    await store.lists.update(changed);
    await store.events.listAccessChanged(
      changed,
      [{ userId, role: 'edit' }],
      ['grants'],
      [userId],
      actor,
    );
    return changed;
  }
  // #endregion
}
