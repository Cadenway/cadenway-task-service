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
  `edit`, `comment` or `view`.

It decides who sees a space or a list, with which role, and who changes what ("Access", "Who sees
a space" and "Who changes what" of `openapi/public/spaces.yaml`, "Grants" of
`openapi/public/access.yaml`), from the copy of the memberships of the organization-members
module, never from the `role` claim of the internal token. Tasks, their counts, the activity log,
the archived tasks and the pages of the archives belong to the tasks module; access requests to
the access-requests module; the trash and deletions are not in this version.

## Public entry points

| Entry point                                 | Consumers                                |
| ------------------------------------------- | ---------------------------------------- |
| `spaces.module`                             | access-requests, member-lifecycle, tasks |
| `public/space/hand-over-private-spaces`     | member-lifecycle                         |
| `public/space/hand-over-awaiting-spaces`    | member-lifecycle                         |
| `public/space/allocate-task-keys`           | tasks                                    |
| `public/list/find-visible-list`             | tasks                                    |
| `public/list/find-visible-lists`            | tasks                                    |
| `public/list/find-visible-space-lists`      | tasks                                    |
| `public/list/list-current-sprints`          | tasks                                    |
| `public/list/list-sidebar-lists`            | tasks                                    |
| `public/list/list-visible-list-ids`         | tasks                                    |
| `public/list/list-archived-lists`           | tasks                                    |
| `public/list/restore-archived-list`         | tasks                                    |
| `public/access/find-access-target`          | access-requests                          |
| `public/access/list-managed-access-targets` | access-requests                          |
| `public/access/grant-requested-access`      | access-requests                          |
| `public/access/remove-member-grants`        | member-lifecycle                         |

`SpacesModule` exports these providers; each runs in `SpacesUnitOfWork.run`, which joins the
tenant transaction of its caller, or opens one for the batches of the clean-up job. Inputs carry
the organization and, for the readings, the member and their role as the caller read them from the
copy of the memberships.

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
- `ListVisibleListIds` (`{ organizationId, viewerUserId, viewerRole }` to `{ listIds }`): every list
  of the organization the viewer has a role on, archived ones included, in sidebar order (spaces by
  creation, then the lists of each by their position). It replaces `ListVisibleSpaceIds`, removed.
- `ListArchivedLists` (`{ organizationId, viewerUserId, viewerRole, after, limit }`, `after` a
  `{ archivedAt, id }` or `null`, to `{ lists, total }`): the archived lists the viewer has a role
  on, `(archivedAt desc, id desc)` after `after`, at most `limit`; `total` counts them all.
- `RestoreArchivedList` (`{ organizationId, actorUserId, viewerRole, listId }` to `{ outcome }`,
  `restored`, `not-archived`, `not-found` or `{ outcome: 'role-insufficient', role }`): restores the
  list of an archived task the tasks module restores, with `edit` on it, and appends
  `list.unarchived.v1` by the actor; every other outcome writes nothing.
- `FindAccessTarget` (`{ …, target: { kind: 'space', spaceId } | { kind: 'list', listId } }`): the
  target with `spaceName`, `spaceOwnerUserId`, `listName`, `viewerRole` (on the space for a space,
  on the list for a list) and `viewerManages` (`canManageSpace` for a space,
  `canManageListAccess` for a list), seen or not; `null` only when the organization has no such
  space or list. No lock. The same statements run whatever the outcome (an unknown target is read
  with the nil UUID in its place, and the grants are always read), so that they tell nothing of
  the existence of the target.
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
`migrations/0006_archives.sql` (the archive columns of `lists`). Deploying `0006_archives.sql`
holds ACCESS EXCLUSIVE on `lists` from its first `ALTER TABLE` until the migrator commits, and
scans `lists` under it for its three CHECKs and the build of its partial index: the reads and
writes of lists of the running version wait meanwhile, and fail after the 5 s `lock_timeout` of
the application role. The measured cost, the timeouts and the rollback are in the tasks
`MODULE.md`, since the same transaction takes that lock on `tasks` too.

- `spaces.id` and `lists.id` come from `uuidv7()`; every `created_at` is `timestamptz(3)`, so that
  the position of a page round-trips exactly through the cursor. `statuses` is a `jsonb` of the ten
  keys. `owner_user_id` names an account, without a foreign key. `awaiting_owner` marks a private
  space whose owner left while the copy did not hold the owner of the organization.
- `space_prefixes` holds one row per prefix a space ever took, with `last_number`: a prefix never
  passes to another space, and its numbers never go back.
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
- Indexes: `spaces (organization_id, created_at, id)` for the listing, `spaces (organization_id,
owner_user_id)` for the handover, `lists (organization_id, space_id, created_at, id)` for the
  lists of a space (sorted by `coalesce(restored_at, created_at)` after the read: no index orders
  that expression, a space holds few lists), the partial `lists_organization_archived_index
(organization_id, archived_at, id) where archived_at is not null` for the archives (a bitmap scan of
  the archived lists of the organization, then a sort; plans in Decisions);
  `space_grants_user_index (organization_id, user_id, space_id)` and
  `list_grants_user_index (organization_id, user_id, space_id, list_id)` for the grants of one
  person (the visibility conditions, the clean-up of a member who left); the primary keys of the
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
    `spaces_organization_created_index` stopped at the limit), 215 for a guest; the first six lists
    of the sidebar ("Accueil"): 107 buffers; the lists of a space for a viewer: 39 buffers;
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
| `POST /internal/v1/spaces/{spaceId}/lists`             | `createListInternal`       |
| `GET /internal/v1/spaces/{spaceId}/lists`              | `listListsInternal`        |
| `GET /internal/v1/lists/{listId}`                      | `getListInternal`          |
| `PATCH /internal/v1/lists/{listId}`                    | `updateListInternal`       |
| `POST /internal/v1/lists/{listId}/archive`             | `archiveListInternal`      |
| `POST /internal/v1/lists/{listId}/unarchive`           | `unarchiveListInternal`    |
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
- A list never changes space, and a space or a list is never deleted in this version: the tasks
  module and `list_grants.space_id` copy the space of a list, which stays right only while it holds.
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

Locks are always taken in this order: memberships `FOR SHARE`, then spaces, then lists.

- A write reads the membership of the actor `FOR SHARE`, so that a concurrent removal waits for it.
- A change of a space (`PATCH`, its grants) locks it `FOR NO KEY UPDATE`; a change of a list locks
  the list (`PATCH`, `archive`, `unarchive`). A `PUT` of a grant locks the membership of the person
  given access `FOR SHARE` after the actor's, so that the clean-up of a removal sees the grant.
  `RestoreArchivedList` reads no membership and locks the list `FOR NO KEY UPDATE` after the tasks
  its caller locked.
- An archive and a restoration store the instant of their transaction (`TransactionClock`: `now()`
  truncated to the millisecond, as the outbox stamps `occurredAt`, read once per run), never the
  system clock.
- A change of the grants of a list (its routes, `GrantRequestedAccess`) reads the list, locks its
  space `FOR SHARE` (its owner, whom no grant may name, cannot change meanwhile), then the list
  `FOR NO KEY UPDATE`. `GrantRequestedAccess` checks on these locked rows, with the role of the
  actor its caller read in the same transaction, that the actor still manages the space or the
  access of the list.
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
  its spaces before its lists, so they do not wait on each other in a cycle. A grant naming a space
  or a list the batch did not lock is a defect the foreign keys rule out: the batch throws and
  rolls back. A failed batch rolls back alone.
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
  out (fail closed). Lists: `not awaiting_owner and (grant of the list or (not a guest and (owner
of the space or (space organization and organization_access) or grant of the space)))`. Spaces:
  `not awaiting_owner and ((not a guest and (space organization or owner or grant of the space))
or a grant of one of its lists)`. Each grant is read once per row by a left join on the full
  primary key restricted to the viewer (`viewer_list_grant`, `viewer_space_grant`), and the spaces
  of the lists shared with the viewer once per statement (`select distinct space_id from
list_grants` by `list_grants_user_index`, which `list_grants.space_id` makes possible), instead of
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
  (`liveListCondition`, `archived_at is null`, the one the trash will extend), applied by the four
  collections only. A restored list stays in its space and goes to its end through `restored_at`,
  which a later archive keeps; the domain refuses an archive stored by halves. The tasks module
  serves the pages of the archives (they need task counts, and spaces never depends on tasks)
  through `ListArchivedLists` and `FindVisibleLists`, and restores the list of a restored task
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
