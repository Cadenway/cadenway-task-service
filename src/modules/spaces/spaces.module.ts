import { Idempotent } from '@cadenway/nest-common/database';
import { Module } from '@nestjs/common';

import { OrganizationMembersModule } from '../organization-members/organization-members.module.js';
import { memberDirectoryProvider } from './composition/providers/adapters/membership/member-directory.provider.js';
import { spacesUnitOfWorkProvider } from './composition/providers/adapters/space/spaces-unit-of-work.provider.js';
import { trashWritesProvider } from './composition/providers/adapters/trash/trash-writes.provider.js';
import { checkListAccessProvider } from './composition/providers/use-cases/access/check-list-access.provider.js';
import { findAccessTargetProvider } from './composition/providers/use-cases/access/find-access-target.provider.js';
import { grantRequestedAccessProvider } from './composition/providers/use-cases/access/grant-requested-access.provider.js';
import { listListGrantsProvider } from './composition/providers/use-cases/access/list-list-grants.provider.js';
import { listManagedAccessTargetsProvider } from './composition/providers/use-cases/access/list-managed-access-targets.provider.js';
import { listSpaceGrantsProvider } from './composition/providers/use-cases/access/list-space-grants.provider.js';
import { removeListGrantProvider } from './composition/providers/use-cases/access/remove-list-grant.provider.js';
import { removeMemberGrantsProvider } from './composition/providers/use-cases/access/remove-member-grants.provider.js';
import { removeSpaceGrantProvider } from './composition/providers/use-cases/access/remove-space-grant.provider.js';
import { setListGrantProvider } from './composition/providers/use-cases/access/set-list-grant.provider.js';
import { setSpaceGrantProvider } from './composition/providers/use-cases/access/set-space-grant.provider.js';
import { archiveListProvider } from './composition/providers/use-cases/list/archive-list.provider.js';
import { createListProvider } from './composition/providers/use-cases/list/create-list.provider.js';
import { createListCopyProvider } from './composition/providers/use-cases/list/create-list-copy.provider.js';
import { CreateListCopy } from './public/list/create-list-copy.js';
import { deleteListProvider } from './composition/providers/use-cases/list/delete-list.provider.js';
import { findTrashListProvider } from './composition/providers/use-cases/list/find-trash-list.provider.js';
import { findVisibleListProvider } from './composition/providers/use-cases/list/find-visible-list.provider.js';
import { findVisibleListsProvider } from './composition/providers/use-cases/list/find-visible-lists.provider.js';
import { findVisibleSpaceListsProvider } from './composition/providers/use-cases/list/find-visible-space-lists.provider.js';
import { getListProvider } from './composition/providers/use-cases/list/get-list.provider.js';
import { holdListProvider } from './composition/providers/use-cases/list/hold-list.provider.js';
import { lockDeletedListProvider } from './composition/providers/use-cases/list/lock-deleted-list.provider.js';
import { lockTrashListsProvider } from './composition/providers/use-cases/list/lock-trash-lists.provider.js';
import { listArchivedListsProvider } from './composition/providers/use-cases/list/list-archived-lists.provider.js';
import { listCurrentSprintsProvider } from './composition/providers/use-cases/list/list-current-sprints.provider.js';
import { listDeletedSpaceListsProvider } from './composition/providers/use-cases/list/list-deleted-space-lists.provider.js';
import { listListsProvider } from './composition/providers/use-cases/list/list-lists.provider.js';
import { listSidebarListsProvider } from './composition/providers/use-cases/list/list-sidebar-lists.provider.js';
import { listTrashListsProvider } from './composition/providers/use-cases/list/list-trash-lists.provider.js';
import { listVisibleListIdsProvider } from './composition/providers/use-cases/list/list-visible-list-ids.provider.js';
import { purgeDeletedListProvider } from './composition/providers/use-cases/list/purge-deleted-list.provider.js';
import { restoreArchivedListProvider } from './composition/providers/use-cases/list/restore-archived-list.provider.js';
import { restoreDeletedListProvider } from './composition/providers/use-cases/list/restore-deleted-list.provider.js';
import { unarchiveListProvider } from './composition/providers/use-cases/list/unarchive-list.provider.js';
import { updateListProvider } from './composition/providers/use-cases/list/update-list.provider.js';
import { allocateTaskKeysProvider } from './composition/providers/use-cases/space/allocate-task-keys.provider.js';
import { createSpaceProvider } from './composition/providers/use-cases/space/create-space.provider.js';
import { deleteSpaceProvider } from './composition/providers/use-cases/space/delete-space.provider.js';
import { getSpaceProvider } from './composition/providers/use-cases/space/get-space.provider.js';
import { handOverAwaitingSpacesProvider } from './composition/providers/use-cases/space/hand-over-awaiting-spaces.provider.js';
import { handOverPrivateSpacesProvider } from './composition/providers/use-cases/space/hand-over-private-spaces.provider.js';
import { listSpacesProvider } from './composition/providers/use-cases/space/list-spaces.provider.js';
import { purgeDeletedSpaceProvider } from './composition/providers/use-cases/space/purge-deleted-space.provider.js';
import { updateSpaceProvider } from './composition/providers/use-cases/space/update-space.provider.js';
import { ListAccessController } from './presentation/http/controllers/access/list-access.controller.js';
import { ListGrantsController } from './presentation/http/controllers/access/list-grants.controller.js';
import { SpaceGrantsController } from './presentation/http/controllers/access/space-grants.controller.js';
import { ListsController } from './presentation/http/controllers/list/lists.controller.js';
import { SpaceListsController } from './presentation/http/controllers/list/space-lists.controller.js';
import { SpacesController } from './presentation/http/controllers/space/spaces.controller.js';
import { FindAccessTarget } from './public/access/find-access-target.js';
import { GrantRequestedAccess } from './public/access/grant-requested-access.js';
import { ListManagedAccessTargets } from './public/access/list-managed-access-targets.js';
import { RemoveMemberGrants } from './public/access/remove-member-grants.js';
import { FindTrashList } from './public/list/find-trash-list.js';
import { FindVisibleList } from './public/list/find-visible-list.js';
import { FindVisibleLists } from './public/list/find-visible-lists.js';
import { FindVisibleSpaceLists } from './public/list/find-visible-space-lists.js';
import { HoldList } from './public/list/hold-list.js';
import { LockDeletedList } from './public/list/lock-deleted-list.js';
import { LockTrashLists } from './public/list/lock-trash-lists.js';
import { ListArchivedLists } from './public/list/list-archived-lists.js';
import { ListCurrentSprints } from './public/list/list-current-sprints.js';
import { ListDeletedSpaceLists } from './public/list/list-deleted-space-lists.js';
import { ListSidebarLists } from './public/list/list-sidebar-lists.js';
import { ListTrashLists } from './public/list/list-trash-lists.js';
import { ListVisibleListIds } from './public/list/list-visible-list-ids.js';
import { PurgeDeletedList } from './public/list/purge-deleted-list.js';
import { RestoreArchivedList } from './public/list/restore-archived-list.js';
import { RestoreDeletedList } from './public/list/restore-deleted-list.js';
import { AllocateTaskKeys } from './public/space/allocate-task-keys.js';
import { HandOverAwaitingSpaces } from './public/space/hand-over-awaiting-spaces.js';
import { HandOverPrivateSpaces } from './public/space/hand-over-private-spaces.js';
import { PurgeDeletedSpace } from './public/space/purge-deleted-space.js';

/**
 * Function markIdempotent
 *
 * @description
 * Marks a creation route `@Idempotent()`, so that the `Idempotency-Key` interceptor of
 * `DatabaseModule` (`idempotency: true` in `AppModule`) records its answer with the key for 24 hours
 * and replays it ("Creations" of `openapi/internal/task-service.yaml`). The decorator of the kit
 * lives in `@cadenway/nest-common/database`, an adapter entry the strict layout keeps out of
 * `presentation/`; the composition root applies it to the handler instead, the same metadata the
 * decorator would set.
 *
 * @param {object} prototype - The prototype of the controller.
 * @param {string} method - The name of its creation handler.
 * @throws {Error} When the controller has no such handler: the module does not load.
 */
function markIdempotent(prototype: object, method: string): void {
  const descriptor: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(
    prototype,
    method,
  );
  if (descriptor === undefined) {
    throw new Error(`The controller has no handler ${method} to mark idempotent.`);
  }
  Idempotent()(prototype, method, descriptor);
}

markIdempotent(SpacesController.prototype, 'create');
markIdempotent(SpaceListsController.prototype, 'create');

/**
 * Class SpacesModule
 *
 * @description
 * Composition root of the spaces, their statuses, their task key prefixes, their lists and
 * sprints (P3a), their grants, the archives of their lists and their deletion (P3b-1). The use
 * cases run on one tenant unit of work that appends their events to the outbox and enqueues the
 * job of a deletion in the same transaction, and read the roles and the owner from
 * `OrganizationMembersModule` through the `MemberDirectory` port, never from the `role` claim of
 * the internal token (decision 4 of the P3a plan). It exports, for the member-lifecycle module,
 * `HandOverPrivateSpaces` and `RemoveMemberGrants`, which the clean-up job runs batch after batch
 * once a member left the organization, and `HandOverAwaitingSpaces`, which it runs when the copy
 * learns the owner; for the tasks module `FindVisibleList`, `FindVisibleLists`,
 * `FindVisibleSpaceLists`, `ListCurrentSprints`, `ListSidebarLists`, `ListVisibleListIds`,
 * `ListArchivedLists`, `RestoreArchivedList`, `AllocateTaskKeys`, and for the trash
 * `ListTrashLists`, `FindTrashList`, `RestoreDeletedList`, `PurgeDeletedList`, `HoldList`,
 * `LockDeletedList` and `LockTrashLists`; for the deletion-lifecycle module
 * `ListDeletedSpaceLists` and `PurgeDeletedSpace`; for the access-requests module
 * `FindAccessTarget`, `ListManagedAccessTargets` and `GrantRequestedAccess`. They run in the
 * transaction of their caller.
 */
@Module({
  imports: [OrganizationMembersModule],
  controllers: [
    SpacesController,
    SpaceListsController,
    ListsController,
    SpaceGrantsController,
    ListGrantsController,
    ListAccessController,
  ],
  providers: [
    spacesUnitOfWorkProvider,
    memberDirectoryProvider,
    trashWritesProvider,
    createSpaceProvider,
    listSpacesProvider,
    getSpaceProvider,
    updateSpaceProvider,
    deleteSpaceProvider,
    handOverPrivateSpacesProvider,
    handOverAwaitingSpacesProvider,
    createListProvider,
    createListCopyProvider,
    listListsProvider,
    getListProvider,
    updateListProvider,
    archiveListProvider,
    unarchiveListProvider,
    deleteListProvider,
    findVisibleListProvider,
    findVisibleListsProvider,
    findVisibleSpaceListsProvider,
    listCurrentSprintsProvider,
    listSidebarListsProvider,
    listVisibleListIdsProvider,
    listArchivedListsProvider,
    restoreArchivedListProvider,
    listTrashListsProvider,
    findTrashListProvider,
    restoreDeletedListProvider,
    purgeDeletedListProvider,
    holdListProvider,
    lockDeletedListProvider,
    lockTrashListsProvider,
    listDeletedSpaceListsProvider,
    purgeDeletedSpaceProvider,
    allocateTaskKeysProvider,
    listSpaceGrantsProvider,
    setSpaceGrantProvider,
    removeSpaceGrantProvider,
    listListGrantsProvider,
    setListGrantProvider,
    removeListGrantProvider,
    checkListAccessProvider,
    findAccessTargetProvider,
    listManagedAccessTargetsProvider,
    grantRequestedAccessProvider,
    removeMemberGrantsProvider,
  ],
  exports: [
    CreateListCopy,
    HandOverPrivateSpaces,
    HandOverAwaitingSpaces,
    RemoveMemberGrants,
    FindVisibleList,
    FindVisibleLists,
    FindVisibleSpaceLists,
    ListCurrentSprints,
    ListSidebarLists,
    ListVisibleListIds,
    ListArchivedLists,
    RestoreArchivedList,
    ListTrashLists,
    FindTrashList,
    RestoreDeletedList,
    PurgeDeletedList,
    HoldList,
    LockDeletedList,
    LockTrashLists,
    ListDeletedSpaceLists,
    PurgeDeletedSpace,
    AllocateTaskKeys,
    FindAccessTarget,
    ListManagedAccessTargets,
    GrantRequestedAccess,
  ],
})
export class SpacesModule {}
