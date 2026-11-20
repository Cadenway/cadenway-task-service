# Spaces

## Purpose

The spaces of each organization ("Espaces", P3a), what they hold besides tasks, and who reaches
them (P3b-1):

- a space: name, description, appearance (icon, color), visibility (`organization` or `private`),
  owner, prefix of its task keys, and how it names or hides each of the ten statuses;
- the prefixes the spaces use or used, and the counter of task numbers of each prefix;
- the lists and sprints of a space, in the order of their creation (a restored list goes last),
  with their switch "Accès de l’organisation" (`organizationAccess`) and their archive
  ("Archives", tab "Listes");
- the grants of spaces and lists ("Partager", "Personnes ayant accès"): one role per person,
  `edit`, `comment` or `view`;
- the deletion of spaces and lists ("Supprimer l’espace", "Supprimer la liste", P3b-1 PR 3): their
  tombstones, until the trash of the tasks module erases them with their last entry.

It decides who sees a space or a list, with which role, and who changes what ("Access", "Who sees
a space" and "Who changes what" of `openapi/public/spaces.yaml`, "Grants" of
`openapi/public/access.yaml`), from the copy of the memberships of the organization-members
module, never from the `role` claim of the internal token. Tasks, their counts, the activity log,
the archived tasks, the pages of the archives and the trash (its entries, their restoration and
their erasure) belong to the tasks module; the jobs that move the tasks of a deleted list or space
to the trash and purge it to the deletion-lifecycle module; access requests to the
access-requests module.

## Public entry points

| Entry point                                 | Consumers                                                    |
| ------------------------------------------- | ------------------------------------------------------------ |
| `spaces.module`                             | access-requests, deletion-lifecycle, member-lifecycle, tasks |
| `public/space/hand-over-private-spaces`     | member-lifecycle                                             |
| `public/space/hand-over-awaiting-spaces`    | member-lifecycle                                             |
| `public/space/allocate-task-keys`           | tasks                                                        |
| `public/list/find-visible-list`             | tasks                                                        |
| `public/list/create-list-copy`              | tasks                                                        |
| `public/list/find-list-reader-audience`     | tasks                                                        |
| `public/list/find-visible-lists`            | tasks                                                        |
| `public/list/find-visible-space-lists`      | tasks                                                        |
| `public/list/list-current-sprints`          | tasks                                                        |
| `public/list/list-sidebar-lists`            | tasks                                                        |
| `public/list/list-visible-list-ids`         | tasks                                                        |
| `public/list/list-archived-lists`           | tasks                                                        |
| `public/list/restore-archived-list`         | tasks                                                        |
| `public/list/list-trash-lists`              | tasks                                                        |
| `public/list/find-trash-list`               | tasks                                                        |
| `public/list/restore-deleted-list`          | tasks                                                        |
| `public/list/purge-deleted-list`            | tasks                                                        |
| `public/list/hold-list`                     | tasks                                                        |
| `public/list/lock-deleted-list`             | tasks                                                        |
| `public/list/lock-trash-lists`              | tasks                                                        |
| `public/list/list-deleted-space-lists`      | deletion-lifecycle                                           |
| `public/space/purge-deleted-space`          | deletion-lifecycle                                           |
| `public/access/find-access-target`          | access-requests                                              |
| `public/access/list-managed-access-targets` | access-requests                                              |
| `public/access/grant-requested-access`      | access-requests                                              |
| `public/access/remove-member-grants`        | member-lifecycle                                             |

`SpacesModule` exports these providers; each runs in `SpacesUnitOfWork.run`, which joins the
tenant transaction of its caller, or opens one for the batches of the clean-up job. Inputs carry
the organization and, for the readings, the member and their role as the caller read them from the
copy of the memberships.

- `FindListReaderAudience` returns the access sources of an already authorized task's list.
  It joins the caller's snapshot and reads only the bounded list and space grants. The tasks
  module intersects the result with active memberships to page eligible participant IDs.

- `HandOverPrivateSpaces` (`{ organizationId, formerOwnerUserId }` to `none-left`, `member-again`
  or `{ outcome: 'handed-over', handedOver, awaitingOwner }`): one batch of at most 100 private
  spaces of a member who left, in a transaction of its own; the clean-up job of member-lifecycle
  calls it until `none-left` or `member-again`. `HandOverAwaitingSpaces` (`{ organizationId }`)
  hands the spaces awaiting an owner over once the copy learns it, in the transaction of the event.
- `RemoveMemberGrants` (`{ organizationId, userId }` to `{ outcome: 'none-left' }`,
  `{ outcome: 'member-again' }` or `{ outcome: 'removed', removed }`): one batch of at most 100
  grants of a member who left, in a transaction of its own, which the clean-up job calls until
  `none-left` or `member-again`.
- `AllocateTaskKeys` (`{ organizationId, spaceId, count }`, `count` 1 to 26): the prefix and the
  first of `count` consecutive task numbers.
- Every `VisibleList` carries `organizationAccess`, `callerRole`, `archivedAt` (`Date | null`),
  `archivedBy` (`{ type, id } | null`) and `position` (`Date`, `positionInSpaceOf`: its last
  restoration, else its creation), the key of the order of its space with its id for a caller that
  pages the lists of a space; `position` is not a member of `TaskList` and never leaves the service.
- `FindVisibleList` (`{ organizationId, viewerUserId, viewerRole, listId }`): `{ list, space }`
  (`VisibleList`, `VisibleSpace` with statuses, prefix, `nextKey`, `callerRole` and
  `callerCanManage`), archived lists included, or `null` when the list is unknown or the viewer has
  no role on it.
- `FindVisibleLists` (`{ organizationId, viewerUserId, viewerRole, listIds }`, 100 ids at most,
  more throws, ids that are not UUIDs left out): `{ lists }`, those the viewer has a role on,
  archived ones included, in no particular order.
- `FindVisibleSpaceLists` (`{ …, spaceId }`): `{ lists }`, the live lists of the space the viewer
  has a role on, unpaged, in their order in the space, each with `callerRole`; `null` when the
  viewer does not see the space.
- `ListCurrentSprints` (`{ …, today, limit }`) and `ListSidebarLists` (`{ …, limit }`): the live
  sprints under way and the first live lists in sidebar order the viewer has a role on.
- `ListVisibleListIds` (`{ organizationId, viewerUserId, viewerRole, editOnly? }` to `{ listIds }`): every list
  of the organization the viewer has a role on, archived ones included, in sidebar order (spaces by
  their position in the sidebar, then the lists of each by their position). It replaces
  `ListVisibleSpaceIds`, removed.
- `ListArchivedLists` (`{ organizationId, viewerUserId, viewerRole, after, limit }`, `after` a
  `{ archivedAt, id }` or `null`, to `{ lists, total }`): the archived lists the viewer has a role
  on, `(archivedAt desc, id desc)` after `after`, at most `limit`; `total` counts them all.
- `RestoreArchivedList` (`{ organizationId, actorUserId, viewerRole, listId }` to `{ outcome }`,
  `restored`, `not-archived`, `not-found` or `{ outcome: 'role-insufficient', role }`): restores the
  list of an archived task the tasks module restores, with `edit` on it, and appends
  `list.unarchived.v1` by the actor; every other outcome writes nothing.
- `ListTrashLists` (`{ organizationId, viewerUserId, viewerRole }` to `{ lists }`, each
  `{ list, role }`, `list` a `TrashList` `{ id, spaceId, name, state }`, `state` `deleted` when
  the list or its space is deleted, else `archived` or `active`): every list of the organization,
  live, archived or deleted, in a live or deleted space, on which the viewer has a role as if
  neither were deleted (`listRoleAsIfNotDeletedOf`, "Who" of `openapi/public/trash.yaml`), with
  that role, in no particular order; one statement of lean rows, O(lists of the organization).
  `FindTrashList` (`{ …, listId }` to `{ list, role }` or `null`): the same for one list; `null`
  when unknown, erased, or no role as if not deleted. No lock. The caller applies its own
  threshold of a change to both, so "may restore" is decided in one place.
- `RestoreDeletedList` (`{ organizationId, actorUserId, viewerRole, listId }` to
  `{ outcome: 'restored', listRestored, spaceRestored }`, `not-found` or
  `{ outcome: 'role-insufficient', role }`): needs `edit` as if not deleted, decided on the rows
  read without lock, then again on the locked rows when they changed; brings back a deleted space
  then a deleted list, each with its restored event and the republish of who reaches it (Events
  emitted), by the actor; a live list in a live space writes nothing. A refusal writes nothing.
- `PurgeDeletedList` (`{ organizationId, listId }` to `{ outcome: 'purged', spacePurged }`,
  `not-deleted` or `not-found`): erases a deleted list and its grants, then its deleted space and
  its grants once no list row of it is left, under the locks its callers already hold (its space,
  then the list); the caller guarantees that no task references the list. `PurgeDeletedSpace` (`{ organizationId, spaceId }` to `purged`, `not-deleted`,
  `not-empty` or `not-found`): erases a deleted space without any list row. No event.
- `HoldList` (`{ organizationId, listId }` to `live`, `{ outcome: 'deleted', deletedBy }` or
  `not-found`): holds the list `FOR SHARE` until the commit, deleted or not, no role checked;
  `deleted` when the list or its space is deleted.
- `LockDeletedList` (`{ organizationId, listId }` to `deleted`, `live` or `not-found`): reads the
  list without lock; a live or unknown list answers at once, without any lock; a deleted one is
  locked, its space `FOR NO KEY UPDATE`, then the list `FOR UPDATE` (which waits for the
  `FOR SHARE` of `HoldList`, of a batch of the deletion job and of a creation of a task), then read
  again under the lock (`live` once restored meanwhile, `not-found` once erased). The tasks module
  calls it before it restores an entry of the list, and a batch of the deletion job before it
  erases the tombstone of a list it finds empty. No role, no write.
- `LockTrashLists` (`{ organizationId, listIds, mode: 'hold' | 'erase', viewer }` to
  `{ lists }`, each `{ listId, outcome, role }`, `outcome` `deleted`, `live` or `not-found` as
  read under the lock, one per distinct id in the order first given): locks the lists of trash
  entries, live or deleted, and their spaces, in the one lock order (Transactions): `hold` takes
  both `FOR SHARE` ("Vider la corbeille"), `erase` the spaces `FOR NO KEY UPDATE` and the lists
  `FOR UPDATE` (an erasure, which may then erase a tombstone with `PurgeDeletedList`); `role` is
  the role of `viewer` (`{ userId, role }`, or `null` for the service) as if not deleted, read
  under those locks, `null` without a viewer or a role. O(lists given) for the locks; the role
  of several lists reads the lean rows of the organization, as `ListTrashLists`. No write.
- `ListDeletedSpaceLists` (`{ organizationId, spaceId }` to `{ space, listIds }`): holds the
  space `FOR SHARE` until the commit and reads where it stands (`deleted`, `live` for a space
  restored meanwhile, `gone` for an erased or unknown one), then the deleted lists of the space
  that are not erased, by id, whether the space is still deleted or not (none when `gone`). The
  deletion job drops the requests of the space itself when it is `deleted` or `gone`.
- `FindAccessTarget` (`{ …, target: { kind: 'space', spaceId } | { kind: 'list', listId } }`): the
  target with `spaceName`, `spaceOwnerUserId`, `listName`, `viewerRole` (on the space for a space,
  on the list for a list) and `viewerManages` (`canManageSpace` for a space,
  `canManageListAccess` for a list), seen or not; `null` only when the organization has no such
  space or list, live or archived (a tombstone answers `null`). With `lock: 'share-unless-locked'`
  (the default `none` takes no lock) the reading of the row of the target, the space for a space,
  the list for a list, takes `FOR SHARE SKIP LOCKED`, so that a deletion of it committed first or
  waits for the caller, and a row a writer holds at that instant reads `null` at once instead of
  being waited for. The same statements and locks run whatever the outcome (an unknown target is
  read with the nil UUID in its place, and the grants are always read), and none waits on the
  target, so that neither they nor their time tell anything of the existence of the target.
- `ListManagedAccessTargets` (`{ organizationId, viewerUserId, viewerRole }` to
  `{ spaceIds, listIds }`): the spaces the viewer manages and the lists they have `edit` on.
- `GrantRequestedAccess` (`{ organizationId, actorUserId, actorRole, target, granteeUserId, role }`
  to `{ outcome: 'granted', changed }` or `{ outcome: 'refused', reason }`, `reason` one of
  `not-found`, `manage-forbidden`, `grantee-invalid`, `guest-space-forbidden`,
  `owner-unchangeable`, `grant-limit-reached`): the grant of an approved request. It creates the
  grant, raises a lower one and keeps an equal or higher one (`changed: false`). The caller checks
  that the actor answers requests for the target, and the operation checks it again on the locked
  rows with `actorRole` (`manage-forbidden`, before the rules of the grant); a refusal is
  returned, not thrown, and writes nothing.

## Owned tables

| Table            | Key                                    | Organization scoping                                     |
| ---------------- | -------------------------------------- | -------------------------------------------------------- |
| `spaces`         | `(organization_id, id)`                | `organization_id`, policy of the kit, enabled and forced |
| `space_prefixes` | `(organization_id, prefix)`            | `organization_id`, policy of the kit, enabled and forced |
| `lists`          | `(organization_id, id)`                | `organization_id`, policy of the kit, enabled and forced |
| `space_grants`   | `(organization_id, space_id, user_id)` | `organization_id`, policy of the kit, enabled and forced |
| `list_grants`    | `(organization_id, list_id, user_id)`  | `organization_id`, policy of the kit, enabled and forced |

Created by `migrations/0002_spaces_and_lists.sql`, `migrations/0005_access_grants.sql`
(`lists.organization_access` and the two grant tables), which force the policies by hand, and
`migrations/0006_archives.sql` (the archive columns of `lists`) and `migrations/0007_trash.sql`
(the tombstones; its deploy-time cost is in the tasks `MODULE.md`, the same transaction).
Deploying `0006_archives.sql` holds ACCESS EXCLUSIVE on `lists` from its first `ALTER TABLE` until
the migrator commits, and
scans `lists` under it for its three CHECKs and the build of its partial index: the reads and
writes of lists of the running version wait meanwhile, and fail after the 5 s `lock_timeout` of
the application role. The measured cost, the timeouts and the rollback are in the tasks
`MODULE.md`, since the same transaction takes that lock on `tasks` too.

- `spaces.id` and `lists.id` come from `uuidv7()`; every `created_at` is `timestamptz(3)`, so that
  the position of a page round-trips exactly through the cursor. `statuses` is a `jsonb` of the ten
  keys. `owner_user_id` names an account, without a foreign key. `awaiting_owner` marks a private
  space whose owner left while the copy did not hold the owner of the organization.
- `space_prefixes` holds one row per prefix a space ever took, with `last_number`: a prefix never
  passes to another space, and its numbers never go back. Its `space_id` has no foreign key
  (dropped by `0007_trash.sql`): the prefix rows outlive an erased space, so its prefixes stay
  reserved for good.
- `lists` references its space by `(organization_id, space_id)`; a sprint has both dates (end on or
  after the start) and an optional goal. `organization_access` is `not null default true`, the
  rule of P3a for every list created before the switch existed.
- `space_grants` and `list_grants`: `role` (CHECK `edit`, `comment`, `view`), `created_at` (when
  the person was first given access: the order of the listings and of the access events),
  `granted_at` and `granted_by_type`/`granted_by_id` (when and by whom the current role was given,
  `grantedAt` and `grantedBy`). `list_grants.space_id` copies the space of the list, with a foreign
  key to `spaces`.
- `lists.archived_at` (`timestamptz(3)`, the instant of the transaction of the archive) and
  `archived_by_type`/`archived_by_id` (`archivedBy`, type CHECK `user`, `automation`, `git`,
  `system`, id not empty) are all set or all null (`lists_archived_check`); `restored_at`
  (`timestamptz(3)`) is when the list last came back from the archives, kept by a later archive.
  All nullable, so the running version keeps every list live.
- `spaces.deleted_at` and `lists.deleted_at` (`timestamptz(3)`, the instant of the transaction of
  the deletion) and `deleted_by_type`/`deleted_by_id` (type CHECK as `archived_by_type`, id not
  empty) are all set or all null (`spaces_deleted_check`, `lists_deleted_check`): the tombstone. A
  list deleted with its space takes the instant and the actor of the space.
  `spaces.restored_at` is when the space last came back from the trash; `lists.restored_at` also
  records a return from the trash. All nullable and without index: the conditions read them on
  rows an index already found.
- Indexes: `spaces (organization_id, created_at, id)` for the listing (the spaces of the
  organization; the sidebar order `coalesce(restored_at, created_at)` is sorted, no index orders
  it, an organization holds few spaces), `spaces (organization_id, owner_user_id)` for the
  handover, `lists (organization_id, space_id, created_at, id)` for the lists of a space (sorted
  by `coalesce(restored_at, created_at)` after the read: no index orders that expression, a space
  holds few lists), the partial `lists_organization_archived_index
(organization_id, archived_at, id) where archived_at is not null` for the archives (a bitmap scan of
  the archived lists of the organization, then a sort; plans in Decisions);
  `space_grants_user_index (organization_id, user_id, space_id)` and
  `list_grants_user_index (organization_id, user_id, space_id, list_id)` for the grants of one
  person (the visibility conditions, the clean-up of a member who left), `list_grants_space_index
(organization_id, space_id)` for the check of `list_grants_space_fkey` when a deleted space is
  erased (`migrations/0007_trash.sql`); the primary keys of the
  grant tables serve the grants of one space or list and the grant of one person there. Plans of
  `tests/access.int-spec.ts` (307 spaces, 3,145 lists, 6,202 space grants, 30,149 list grants and 904 accounts in one organization, a member with a role on 1,426 lists, PostgreSQL 18, plans taken as `task_app`), none with a Seq Scan of a grant table:
  - the grants of one person on one space and one list (`FindVisibleList`, the access checks):
    three index lookups, 9 shared buffers, 0.05 ms;
  - the visible lists of a member (`ListVisibleListIds`, `ListManagedAccessTargets`): hash joins of
    the lists and spaces of the organization with the grants of the member (a range of each
    `*_user_index`), 194 buffers, 2.7 ms for 1,426 lists, O(lists of the organization); before the
    left joins on the grant keys replaced the correlated subqueries, 20,687 buffers and 8 ms;
  - the visible lists of a guest: from the grants of the guest (`list_grants_user_index`), 543
    buffers, 0.4 ms for 60 lists, O(grants of the guest);
  - a page of visible spaces: 106 buffers for a member (an ordered walk of
    `spaces_organization_created_index` stopped at the limit), 215 for a guest; the first six
    lists of the sidebar ("Accueil"): 107 buffers; the lists of a space for a viewer: 39 buffers.
    Taken before P3b-1 PR 3, whose sidebar order sorts the visible spaces instead of walking the
    index, and whose spaces of the lists shared with a viewer probe `lists_pkey` per grant to leave
    the tombstones out: measured again by `tests/trash-queries.int-spec.ts` (306 spaces), a page of
    `GET /spaces` sorts the visible spaces in memory, 0.3 to 0.6 ms for an owner, an admin or a member,
    1.7 to 2.0 ms for a guest through the grants of its lists, tombstones included; the trash lists
    (`ListTrashLists`) 2.4 to 2.5 ms for 2,233 to 2,483 lists, 1.8 ms for a guest; the mark of the
    1,000 lists of a deleted space one range of `(organization_id, space_id)`, 4.6 to 7.2 ms;
  - the grants of a space or a list: 3 to 4 buffers; the spaces managed: 127 buffers;
  - the batches of the clean-up: the grants of the account through the two `*_user_index`, 32 and
    63 buffers, the locks of their spaces and lists by primary key, under 0.2 ms each.

## API

`openapi/internal/task-service.yaml` (`@cadenway/contracts` 0.10.0), actor `user`, organization
required. Issuer `api-gateway`:

| Route                                                  | Operation                  |
| ------------------------------------------------------ | -------------------------- |
| `POST /internal/v1/spaces`                             | `createSpaceInternal`      |
| `GET /internal/v1/spaces`                              | `listSpacesInternal`       |
| `GET /internal/v1/spaces/{spaceId}`                    | `getSpaceInternal`         |
| `PATCH /internal/v1/spaces/{spaceId}`                  | `updateSpaceInternal`      |
| `DELETE /internal/v1/spaces/{spaceId}`                 | `deleteSpaceInternal`      |
| `POST /internal/v1/spaces/{spaceId}/lists`             | `createListInternal`       |
| `GET /internal/v1/spaces/{spaceId}/lists`              | `listListsInternal`        |
| `GET /internal/v1/lists/{listId}`                      | `getListInternal`          |
| `PATCH /internal/v1/lists/{listId}`                    | `updateListInternal`       |
| `POST /internal/v1/lists/{listId}/archive`             | `archiveListInternal`      |
| `POST /internal/v1/lists/{listId}/unarchive`           | `unarchiveListInternal`    |
| `DELETE /internal/v1/lists/{listId}`                   | `deleteListInternal`       |
| `GET /internal/v1/spaces/{spaceId}/grants`             | `listSpaceGrantsInternal`  |
| `PUT /internal/v1/spaces/{spaceId}/grants/{userId}`    | `setSpaceGrantInternal`    |
| `DELETE /internal/v1/spaces/{spaceId}/grants/{userId}` | `removeSpaceGrantInternal` |
| `GET /internal/v1/lists/{listId}/grants`               | `listListGrantsInternal`   |
| `PUT /internal/v1/lists/{listId}/grants/{userId}`      | `setListGrantInternal`     |
| `DELETE /internal/v1/lists/{listId}/grants/{userId}`   | `removeListGrantInternal`  |

Issuer `realtime-gateway` only, in a controller of its own: `GET /internal/v1/lists/{listId}/access`
(`checkListAccessInternal`), the role of the actor on a list they see, with `spaceId`, `listId` and
`taskKey: null`; `404 list.not-found` for any other list. Read only, nothing emitted.

- Every `Space` answers `callerRole` and `callerCanManage`, every `TaskList` `organizationAccess`,
  `callerRole`, and always `archivedAt` and `archivedBy` (`null` for a live list).
- `archive` and `unarchive` take the `EmptyRequest` body (an object, its members dropped) and an
  optional `If-Match`, and answer `200` with the `TaskList`, `callerRole: 'edit'`, and `ETag`; an
  archived list archived again, or a live list restored, answers its stored version.
- The two `DELETE` take an optional `If-Match` and answer `204` without a body or `ETag`. While
  `TRASH_WRITES_ENABLED` is off (the default), both answer exactly as a route the service does not
  have: `404 http.not-found`, title `Not Found`, detail `Cannot DELETE <url>` (the URL as
  requested), checked first in the use case, before the membership (after the guard and the
  validation of the path and of `If-Match`).
- `PUT …/grants/{userId}` answers `200` with the `Grant` and `ETag`, the version of the space or the
  list after the change (the same one when the person already held that role); `DELETE` answers
  `204` with `ETag` (the same version when the person held no grant). The `userId` of the path is
  lower-cased. A listing of grants reads every grant of the resource (200 at most) in one
  statement and cuts the page in memory, keyset `(created_at, user_id)` in an opaque cursor bound
  to the resource, `total` on every page.
- The two creations honour `Idempotency-Key` (`@Idempotent()`, applied by `spaces.module.ts`). A
  replay answers the recorded `Location` and `ETag`.
- `GET /internal/v1/spaces/{spaceId}/overview` and `GET /internal/v1/lists/{listId}/counts` are
  served by the tasks module.

## Events emitted

Appended to the outbox in the transaction of the change (`asyncapi/task-service.yaml`):

- `space.created.v1`, `space.updated.v1` (with `changed`), `list.created.v1` (with
  `organizationAccess`), `list.updated.v1` (with `changed`). A space creation emits
  `space.created.v1` then the `list.created.v1` of its "Première liste". A patch that changes
  nothing emits nothing.
- `space.access-changed.v1` (`grants` after the change in the order first given,
  `changedUserIds`) when a grant of a space is given, changed or removed;
  `list.access-changed.v1` (`organizationAccess`, `grants`, `changed`, `changedUserIds`) with
  `changed: ['grants']` for a grant of a list, `changed: ['organizationAccess']` and no
  `changedUserIds` for the switch. A `PATCH` of a list that changes its content and its switch
  emits `list.updated.v1` then `list.access-changed.v1` with the ONE version it took.
- `list.archived.v1` and `list.unarchived.v1` (the whole list with `organizationAccess`) for an
  archive and a restoration, by the actor; `RestoreArchivedList` appends its `list.unarchived.v1`
  before the task events of its caller. An archive or a restoration that changes nothing emits
  nothing. The `occurredAt` the outbox takes from `now()` is the stored `archived_at`.
- `space.deleted.v1` (`spaceId`, the version after the deletion) for a deleted space and all its
  lists, none of which emits `list.deleted.v1` nor takes a version; `list.deleted.v1` (`listId`,
  `spaceId`, version) for a list deleted on its own; both by the actor, `occurredAt` the stored
  `deleted_at`. `space.restored.v1` (the whole space, as `space.updated.v1` without `changed`)
  then `list.restored.v1` (the whole list with `organizationAccess`) when `RestoreDeletedList`
  brings them back, by the member who restores the entry, before the task events of its caller,
  each followed at the version it took by the republish of who reaches it:
  `space.access-republished.v1` with every grant of the space (`changedUserIds` every person who holds
  one), `list.access-changed.v1` with the switch and every grant of the list
  (`changed: ['grants', 'organizationAccess']`, `changedUserIds: []`); the order is
  `space.restored.v1`, `space.access-republished.v1`, `list.restored.v1`, `list.access-changed.v1`.
  The space snapshot is emitted even when its grants and `changedUserIds` are empty. List restore also emits its access snapshot when `changedUserIds` is empty.
  An erasure emits nothing. The handover of a deleted space changes its owner and its version
  without `space.updated.v1` until it comes back (the whole space, which would bring it back in a
  consumer that dropped it at `space.deleted.v1`); the clean-up of a member who left appends the
  access event of every grant it removes on a tombstone, as on a live space or list, the removed
  person in `changedUserIds`.
- The handovers emit `space.updated.v1` (`changed: ['ownerUserId']`) and the clean-up of a member's
  grants the access events, both with the actor `{ type: 'system', id: 'task-service' }`; a
  space left awaiting an owner emits nothing until its handover. An approved access request emits
  the access event with the approver as actor.

## Events consumed

None directly; member-lifecycle calls `HandOverPrivateSpaces` and `RemoveMemberGrants` batch after
batch after a `member.removed.v1`, and `HandOverAwaitingSpaces` on the join or role change that
gives an organization its owner.

## Invariants

- An actor the copy of the memberships does not hold answers `404 organization.not-found`; a guest
  creates no space (`403 organization.role-forbidden`).
- The role of a member on a space (`spaceRoleOf`) is the highest of `edit` as its owner, `edit` for
  a space `organization` (never for a guest), and the grant of the space (nothing while the person
  is a guest). The role on a list (`listRoleOf`) is the highest of the grant of the list (guests
  included) and, for a member who is not a guest, `edit` as owner of the space, `edit` in a space
  `organization` while the switch of the list is on, and the grant of the space. Nobody has a role
  in a space awaiting an owner. A member sees a space with a role on it, or through a grant of one
  of its lists (`callerRole: null`, those lists only). What the actor does not see answers `404`
  and is left out of every collection; the owner and the admins of the organization see neither a
  private space nor a list whose switch is off unless it is shared with them.
- Every write of a space or a list checks the actor on the rows read without lock first, then
  locks them and checks again on the locked rows when they changed (`CheckedLocker`): what the
  actor does not see, or may not change, answers at once, whatever another transaction holds.
- While `TRASH_WRITES_ENABLED` is off, no tombstone is created (`TrashWrites`): the deletions of a
  list and of a space answer as an unknown route; every other route, the trash and the erasure of
  what exists stay served.
- Refusal order of every write: unknown or not seen `404`, then seen without `edit`
  `403 access.role-insufficient` (`details: { role, requiredRole: 'edit' }`, `role` null through
  lists only), then `If-Match` `412`, then the rules of the domain `422`. The grants of a space are
  changed by who manages it (`canManageSpace`: its owner, and for a space `organization` the owner
  and the admins of the organization; `403 space.manage-forbidden` instead of the role check); a
  change of the visibility needs `edit`, then `canManageSpace` (`403 space.visibility-forbidden`).
- A grant goes to a current member or guest (`422 access.grantee-invalid`, `details.userId`); a
  guest holds grants of lists only (`422 access.guest-space-forbidden`); the owner of the space
  holds none and always has `edit` (`422 access.owner-unchangeable`, also for a removal); a space or
  a list holds 200 grants at most (`422 access.grant-limit-reached`, never for a change of role).
  The same role again changes nothing: same version, nothing emitted. Every change of the grants
  or of the switch adds one to the version of the space or the list.
- A space handed to the owner of the organization keeps no grant of theirs: the change that makes
  them the owner removes the grants they held on the space and its lists, with their access events.
- A prefix belongs for good to the first space that took it (`409 space.prefix-taken`); a task
  number is handed out once, by `AllocateTaskKeys`, and never again; `nextKey` previews it.
- `todo` and `done` are never hidden (`422 space.status-required`); a sprint ends on or after its
  start (`422 list.sprint-dates-invalid`).
- Archiving and restoring a list needs `edit` on it, with the refusal order of every write
  (`404`, `403`, `412`). An archive sets `archivedAt` (the instant of the transaction) and
  `archivedBy` (the actor), a restoration clears them and sets `restoredAt`; each adds one to the
  version, its tasks do not change. An archived list is left out of `GET /spaces/{id}/lists`,
  `FindVisibleSpaceLists`, `ListCurrentSprints` and `ListSidebarLists`, and stays everywhere else:
  read by id, `PATCH`, its grants, the access check, `ListVisibleListIds`, the access targets and
  `GrantRequestedAccess`.
- The lists of a space are ordered by `(coalesce(restored_at, created_at), id)`
  (`positionInSpaceOf`) in `GET /spaces/{id}/lists` and its cursor, `FindVisibleSpaceLists`, the
  sidebar and `ListVisibleListIds`; the sprints under way keep `(sprint_end_date, created_at, id)`.
- A list never changes space: the tasks module and `list_grants.space_id` copy the space of a list,
  which stays right only while it holds.
- Deleting a list needs `edit` on it, archived or not (`404`, `403 access.role-insufficient`,
  `412`); deleting a space needs to manage it (`404`, `403 space.manage-forbidden`, `412`). Each
  takes the next version of the list or the space; a space deleted makes a tombstone of every list
  of it not deleted yet, at the same instant and actor, without a version or an event.
- A tombstone, a deleted list or any list of a deleted space, is invisible everywhere: every
  collection, reading by id, lock, write, grant route and access check answers it as unknown
  (`404`), `FindAccessTarget` answers `null`, `GrantRequestedAccess` and `RestoreArchivedList`
  `not-found`, and a grant of a deleted list shows no space. ONE condition per resource in SQL
  (`undeletedListCondition`, `undeletedSpaceCondition`, held by `visibleListCondition` and
  `visibleSpaceCondition`) and the policies fail closed (`spaceRoleOf`, `listRoleOf`,
  `canSeeSpace`, `canManageSpace`). Only the trash entries (`listRoleAsIfNotDeletedOf`, the role
  "as if not deleted") and the deletion machinery read them.
- A tombstone keeps its settings, its prefixes and its grants until it is erased; a restored space
  or list comes back with them. A list comes back at the end of its space (`restored_at`), a space
  at the end of the sidebar (`restored_at`), without their other lists. A deleted space is erased
  with its last list row; its prefix rows stay, so its prefixes stay reserved
  (`409 space.prefix-taken` for another space) and its numbers are never given again.
- Spaces are ordered by `(coalesce(restored_at, created_at), id)` (`positionInSidebarOf`) in
  `GET /spaces` and its cursor, `ListVisibleListIds` and `ListSidebarLists`.
- A tombstone appends no content event until it comes back from the trash, whoever changes it
  (the clean-up of a member who left still hands it over, removes grants and takes versions), and
  every access event of the grants removed there, so that who reaches what converges in every
  consumer with the republish of the restoration: ONE policy decides both (`announcesChanges`,
  `content` or `access`), which every call site of the clean-up reads.
- A private space whose owner left passes to the owner of the organization through the clean-up
  job, unless the copy holds the person as a member again when the batch runs; until then nobody
  sees it, and while the copy does not hold the owner of the organization it awaits an owner. A
  space of the whole organization keeps a former member as owner; made private, it passes to the
  owner of the organization in the same change, or the change is refused
  (`403 space.visibility-forbidden`) while the copy holds no owner. The grants of a member who
  left are removed by the clean-up job, unless the copy holds them as a member again.
- The organization and the actor come from the verified token only, lower-cased; an actor id that
  is not a UUID answers `403 auth.actor-not-allowed`. A text holding U+0000 or a date of the year
  0000 answers `400 request.invalid`.

## Transactions

Every use case runs in one tenant transaction of the organization of the context
(`TenantSpacesUnitOfWork`), joined to the one of the `Idempotency-Key` interceptor, of the
deduplicator or of the calling module; what it writes and its outbox rows commit together, and a
refusal rolls it back. The readings of the copy join the same transaction.

Locks are always taken in the global lock order of the service ("Global lock order" in the
Transactions of `src/modules/tasks/MODULE.md`): memberships `FOR SHARE`, then (for a caller of the tasks module)
its trash entries and tasks, then spaces, then lists, with no exception. Several spaces are
locked in `(created_at, id)` order (`SpaceRepository.lockInOrder` and the batches of the
handover), several lists in ascending id in one statement (`lockMany`, `lockUndeletedOfSpace`),
so that no two lockers wait on each other in a cycle. A lock is taken in its final mode before
the next row: the one strengthening left, `FOR NO KEY UPDATE` of a deleted space to the
`FOR UPDATE` of its erasure (`DeletedSpaceEraser`), waits for no other writer (that mode
conflicts with every other writer, and a deleted space takes no new row, so no foreign-key check
holds it either).

- A write reads the membership of the actor `FOR SHARE`, so that a concurrent removal waits for it.
- A change of a space (`PATCH`, its grants) locks it `FOR NO KEY UPDATE`; a change of a list
  (`PATCH`, `archive`, `unarchive`, its deletion, its grants) holds its space `FOR SHARE`, then
  locks the list `FOR NO KEY UPDATE`; each after the check of the actor on the rows read without
  lock, and again on the locked rows when one of them changed (`CheckedLocker`). Every input of the
  role on a list is then held until the commit (the space, its grants and the list, whose writers
  lock them and take their next version), so a space made private or a grant revoked while the
  change waited for a lock refuses it. A creation of a
  list holds its space `FOR SHARE`, so that a deletion of the space either commits first (`404`)
  or waits and deletes the new list. A `PUT` of a grant locks the membership of the person given
  access `FOR SHARE` after the actor's, so that the clean-up of a removal sees the grant.
  `RestoreArchivedList` reads no membership and holds the space `FOR SHARE`, then locks the list
  `FOR NO KEY UPDATE`, after the tasks its caller locked.
- `DeleteList` holds the space `FOR SHARE` and locks the list `FOR NO KEY UPDATE`
  (`EditableListLocator`, as `ArchiveList`);
  `DeleteSpace` locks the space `FOR NO KEY UPDATE`, then its lists not deleted yet
  `FOR NO KEY UPDATE` in ascending id in one `select … order by id for no key update`, then writes
  them in ONE `UPDATE` (O(lists of the space)), which would otherwise take them in the order of its
  scan, `(created_at, id)`, against the ascending id of every other locker of several lists (the
  clean-up of a member, the moves of tasks). Each enqueues `task.trash-deleted-tasks`
  (`{ listId }` or `{ spaceId }` and the `traceparent`, occurrence key `list:<id>:<version>` or
  `space:<id>:<version>`) through the connection of the transaction, with its event: all commit
  or none does.
- `HoldList` locks the list `FOR SHARE` after the tasks its caller locked; a deletion of it or of
  its space writes the row, so the two serialize. `LockDeletedList` locks a deleted list's space
  `FOR NO KEY UPDATE`, then the list `FOR UPDATE`, and nothing for a live or unknown list.
  `LockTrashLists` reads its lists in one statement without lock, then locks their spaces, live
  or deleted, in `(created_at, id)` order, then the lists in ascending id in one statement, which
  reads them again, then reads the role of the viewer: `FOR SHARE` on both in `hold`, the spaces
  `FOR NO KEY UPDATE` and the lists `FOR UPDATE` in `erase`, after the entries and the tasks its
  caller locked.
  `RestoreDeletedList` reads the list and its space, checks the role, locks the space
  `FOR NO KEY UPDATE`, then the list `FOR NO KEY UPDATE`, after the entry and the tasks its caller
  locked (and `LockDeletedList`, whose locks it then holds already). `FindAccessTarget` with
  `lock: 'share-unless-locked'` holds the space of a space target, or the list of a list target,
  `FOR SHARE SKIP LOCKED`: it never waits for a writer of the target, whose row then reads unknown.
  `PurgeDeletedList` reads the list without lock and locks only a deleted one, its space
  `FOR NO KEY UPDATE`, then the list `FOR UPDATE` (its callers hold both already), then erases a
  deleted space through `DeletedSpaceEraser` (`FOR UPDATE`). `PurgeDeletedSpace` locks
  the space `FOR UPDATE`; both erase a space through the one `DeletedSpaceEraser`.
  `ListDeletedSpaceLists` holds the space `FOR SHARE`, which waits for a restoration or an erasure
  of it, or makes them wait.
- An archive, a deletion and a restoration store the instant of their transaction
  (`TransactionClock`: `now()`
  truncated to the millisecond, as the outbox stamps `occurredAt`, read once per run), never the
  system clock.
- A change of the grants of a list (its routes, `GrantRequestedAccess`) reads the list, locks its
  space `FOR SHARE` (its owner, whom no grant may name, cannot change meanwhile), then the list
  `FOR NO KEY UPDATE`. `GrantRequestedAccess` checks, with the role of the actor its caller read in
  the same transaction, that the actor still manages the space or the access of the list, on the
  rows read without lock, then on the locked rows when they changed.
- A grant write loads every grant of the space or the list (200 at most), applies
  `ResourceGrants`, checks `If-Match` against the version of the space or the list, upserts or
  deletes the one row (`granted_at` and `granted_by_*` change only when the role changes,
  `created_at` stays), takes the next version and appends the access event.
- A batch of `HandOverPrivateSpaces` locks up to 100 spaces in `(created_at, id)` order, then reads
  the copy without lock, then writes each space and its event, then removes the grants the new
  owner held there (one reading when they held none). A batch of `RemoveMemberGrants` reads up to
  100 grants of the account (grants of spaces first), locks their spaces one by one in the
  `(created_at, id)` order of the handover (`FOR NO KEY UPDATE` the spaces whose grant goes,
  `FOR SHARE` the spaces of the lists whose grant goes, since only those lists take a version), then
  their lists in id order, then reads the copy without lock, then removes each grant, takes the
  next version of its space or list and appends its event (about 500 short statements for a full
  batch, under the 10 s statement timeout and the 5 s lock timeout of the application role). Two
  batches, a handover among them, take their common spaces in the same order, and every one locks
  its spaces before its lists, so they do not wait on each other in a cycle. A grant whose space or
  list an erasure of a tombstone removed while the batch waited for its lock went with it (the
  grants read after the locks are gone), so the batch skips it; a grant naming a space or a list
  the batch did not lock while grants of it remain is a defect the foreign keys rule out: the
  batch throws and rolls back. A failed batch rolls back alone.
- A request that writes a space or a list a batch of the clean-up holds (`PATCH`, a grant, a change
  of the switch) waits for it at most the 5 s `lock_timeout` of the application role, then answers
  `500` (`55P03`, `lock_not_available`); the batches are short, so this needs a batch stuck on a
  slow statement.
- The readings take no lock and append no event. The access of a member to one space and one list
  is ONE statement of three indexed lookups (the grant of the space, the grant of the list, a grant
  of any list of the space), skipped when the rule of the organization or the ownership already
  gives `edit` on everything asked (`isHighestRole`), except in `FindAccessTarget`, which always
  reads it.
- `AllocateTaskKeys` is one `UPDATE … RETURNING` of the prefix row, which serializes the creations
  under one prefix until the caller commits; the caller allocates last.

The unit of work wakes the relay once its `run` resolved when an event was appended.

## Decisions

- The effective role (decision 2 of P3b-1 as the contract fixed it) is computed by the policies of
  the domain only (`spaceRoleOf`, `listRoleOf`, `canSeeSpace`, `canManageSpace`, `canEdit`,
  `canManageListAccess`, `isHighestRole`); the application compares no role by hand. The
  collections apply ONE visibility condition per resource in SQL, kept in one mapper each
  (`visibleSpaceCondition`, `visibleListCondition`), and select the grants of the viewer so that
  the role of each row is computed in TypeScript; a row the policy refuses all the same is left
  out (fail closed). Lists: `not deleted and space not deleted and not awaiting_owner and (grant
of the list or (not a guest and (owner of the space or (space organization and
organization_access) or grant of the space)))`. Spaces: `not deleted and not awaiting_owner and
((not a guest and (space organization or owner or grant of the space)) or a grant of one of its
lists that is not deleted)`. Each grant is read once per row by a left join on the full
  primary key restricted to the viewer (`viewer_list_grant`, `viewer_space_grant`), and the spaces
  of the lists shared with the viewer once per statement (`select distinct space_id from
list_grants join lists` by `list_grants_user_index`, which `list_grants.space_id` makes possible),
  instead of
  correlated subqueries evaluated in the condition and again in the selection;
  `organization_id` is named in every predicate. `ListVisibleListIds` and
  `ListManagedAccessTargets` read lean rows (what the role needs, no name, look or sprint).
- A write answers the access of the caller after the change. A write needs `edit` and can only
  take it away (a plain member turns the switch off, an admin makes a space private): it then
  answers `callerRole: 'edit'`, the role the change was made with, which the contract reads as
  absent; `callerCanManage` is the value after the change.
- An approval raises a grant and never lowers it (`ResourceGrants.raise`): a person who holds the
  role asked or a higher one keeps it, and nothing changes.
- The clean-up of the grants of a member who left is a batch operation of 100 grants, as the
  handover of the private spaces, first-N without a cursor: a removed grant leaves the range. A
  re-join committed before the batch keeps the grants; one that commits after the read loses
  those of that batch (accepted race, as for the handover).
- A space handed over to the owner of the organization drops the grants they held there (not in
  the design of P3b-1: the domain refuses to load grants that name the owner, which would make the
  space and its lists unshareable). The `space.access-changed.v1` of a removed space grant shares
  the version of the `space.updated.v1` of the handover (one change, one version); each list whose
  grant goes takes its own next version.
- `If-Match` is optional; a stale one answers `412 request.version-mismatch` with the stored
  version, after the access checks and before the rules of the domain (and before an archive or a
  restoration that changes nothing answers `200`).
- Archives of lists (decision 6 of P3b-1): ONE predicate keeps the live lists
  (`liveListCondition`, `archived_at is null`), applied by the four collections only, over
  `visibleListCondition`, which leaves the tombstones out. A restored list stays in its space and
  goes to its end through `restored_at`, which a later archive keeps; the domain refuses an archive
  stored by halves. The tasks module serves the pages of the archives (they need task counts, and
  spaces never depends on tasks) through `ListArchivedLists` and `FindVisibleLists`, and restores
  the list of a restored task
  through `RestoreArchivedList`, whose refusals, those of the one guard of the writes of a list
  (`EditableListLocator`, also behind `PATCH`, `archive` and `unarchive`), are outcomes so that the
  caller answers them. A page of the archived lists and its total read
  `lists_organization_archived_index` by a bitmap scan, then sort the archived lists the viewer
  sees: not a walk stopped at the limit, O(archived lists of the organization). Plans of
  `tests/archive-queries.int-spec.ts` (4,004 lists, 60 of them archived), the page and the total:
  16 buffers, 0.3 ms for Camille; 107 buffers, 0.4 to 0.5 ms for a member with a role on 1,392
  lists; `FindVisibleLists` reads its lists by `lists_pkey`, 19 buffers.
- The trail of an archive of a list: while it is archived, `archived_at` and `archived_by_*` say
  when and by whom; a restoration clears them and keeps only `restored_at` (when, not who). The
  events `list.archived.v1` and `list.unarchived.v1` name the actor, and are kept 7 days (the sent
  rows of the outbox and the stream `EVENTS`). Open point: a durable trail of who archived and
  restored a list.
- The writes of the trash are behind `TRASH_WRITES_ENABLED` (off by default, `TrashConfig` of
  `src/config/app-config.ts`, port `TrashWrites`): the release before ignores `deleted_at`, so no
  tombstone may exist while a rollback to it is possible (`.claude/rules/migrations.md`); the
  readings of the tombstones, the restoration and the erasure stay served, as they act only on
  what exists.
- Deletions (P3b-1 PR 3), beyond the contract: the grants of a tombstone stay until it is erased
  (they give the role "as if not deleted" in the trash, and come back with a restored list or
  space); the clean-up of a member who left (`RemoveMemberGrants`, `HandOverPrivateSpaces`,
  `HandOverAwaitingSpaces`, the removal of the grants of a new owner) changes tombstones like any
  space or list (owner, grants, versions) but appends no `space.updated.v1` for them until they
  come back, as a task in the trash emits nothing; it still appends the access events of the
  grants it removes there: a restored space whose last grant went while it was deleted
  republishes an empty snapshot; a restoration of an entry whose list is
  archived and not deleted leaves the list archived; a list archived, then deleted, comes back
  live, its archive cleared ("a deleted list comes back with it, at the end of its space" of
  `openapi/public/trash.yaml`); the archived tasks of its entries come back archived (tasks
  `MODULE.md`). The erasure of a space checks `list_grants_space_fkey` through
  `list_grants_space_index` (116 buffers, 0.1 ms; a Seq Scan of `list_grants` without it).
- Lists live in this module (a space is created with its first list), and the tasks module depends
  on spaces through the public entries above, never the reverse; access-requests and
  member-lifecycle likewise.
- `tests/spaces.int-spec.ts` proves the P3a routes, the visibility rules, idempotency, row-level
  security and the handover on real PostgreSQL, NATS and pg-boss. `tests/access.int-spec.ts`
  proves the grant routes, the switch, the effective role on the P3a routes, row-level security of
  `space_grants` and `list_grants`, the clean-up batches (a lock timeout and `member-again`
  included), and takes the plans of the queries above. The unit specs prove the rules on an
  in-memory store that writes the conditions again from the SQL, the SQL text of the conditions
  and of the joins by the specs of their mappers and repositories.
