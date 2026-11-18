# Spaces

## Purpose

The spaces of each organization ("Espaces", P3a) and what they hold besides tasks:

- a space: name, description, appearance (icon, color), visibility (`organization` or `private`),
  owner, prefix of its task keys, and how it names or hides each of the ten statuses;
- the prefixes the spaces use or used, and the counter of task numbers of each prefix;
- the lists and sprints of a space, in the order of their creation.

It decides who sees a space and who changes what (decision 3 of the P3a plan, "Who sees a space"
and "Who changes what" of `openapi/public/spaces.yaml`), from the copy of the memberships of the
organization-members module, never from the `role` claim of the internal token. Tasks, their
counts (the space overview and the counts of a list, served by the tasks module from PR 3) and the
activity log belong to the task modules of P3a.

## Public entry points

| Entry point                              | Consumers               |
| ---------------------------------------- | ----------------------- |
| `spaces.module`                          | member-lifecycle, tasks |
| `public/space/hand-over-private-spaces`  | member-lifecycle        |
| `public/space/hand-over-awaiting-spaces` | member-lifecycle        |
| `public/list/find-visible-list`          | tasks                   |
| `public/list/find-visible-space-lists`   | tasks                   |
| `public/list/list-current-sprints`       | tasks                   |
| `public/list/list-sidebar-lists`         | tasks                   |
| `public/space/list-visible-space-ids`    | tasks                   |
| `public/space/allocate-task-keys`        | tasks                   |

`SpacesModule` exports the `HandOverPrivateSpaces` (input and output) and
`HandOverAwaitingSpaces` (input) providers. `HandOverPrivateSpaces`
(`{ organizationId, formerOwnerUserId }` to `{ outcome: 'none-left' }`,
`{ outcome: 'member-again' }` or `{ outcome: 'handed-over', handedOver, awaitingOwner }`) is one batch of at most 100 private
spaces, in a tenant transaction of its own: the clean-up job of member-lifecycle calls it after a
removal committed, until `none-left` or `member-again`. member-lifecycle calls
`HandOverAwaitingSpaces` when the copy learns the owner of an organization, in the tenant
transaction of the event, which it joins.

It also exports, for the tasks module:

- `FindVisibleList` (`{ organizationId, viewerUserId, viewerRole, listId }`): the list and its space
  (statuses, prefix, `nextKey`) as plain `VisibleList` and `VisibleSpace` projections, or `null`
  when the list is unknown or the viewer does not see its space (a guest, a private space of
  another member, a space awaiting an owner);
- `FindVisibleSpaceLists` (`{ organizationId, viewerUserId, viewerRole, spaceId }`): every list of
  the space, unpaged and in creation order, as `{ lists: VisibleList[] }`, or `null` when the space
  is unknown or the viewer does not see it (same cases as `FindVisibleList`); the space overview of
  the tasks module needs them all, and slices its page itself;
- `ListCurrentSprints` (`{ organizationId, viewerUserId, viewerRole, today, limit }`, `today` a
  `YYYY-MM-DD` calendar date of the caller): the sprints of the spaces the viewer sees whose start
  is on or before `today` and whose end is on or after it, ordered by end date, then creation, at
  most `limit`, as `{ lists }`; empty for a guest, without a read;
- `ListSidebarLists` (`{ organizationId, viewerUserId, viewerRole, limit }`): the first `limit`
  lists of the spaces the viewer sees in sidebar order (spaces by creation, then the lists of each
  by creation, sprints included), as `{ lists }`; empty for a guest, without a read;
- `ListVisibleSpaceIds` (`{ organizationId, viewerUserId, viewerRole }`): the ids of the spaces the
  viewer sees, in creation order, with the filter of the space listing; empty for a guest;
- `AllocateTaskKeys` (`{ organizationId, spaceId, count }`, `count` from 1 to 26): the prefix and
  the first number of `count` consecutive numbers handed out under the current prefix.

## Owned tables

| Table            | Key                         | Organization scoping                                     |
| ---------------- | --------------------------- | -------------------------------------------------------- |
| `spaces`         | `(organization_id, id)`     | `organization_id`, policy of the kit, enabled and forced |
| `space_prefixes` | `(organization_id, prefix)` | `organization_id`, policy of the kit, enabled and forced |
| `lists`          | `(organization_id, id)`     | `organization_id`, policy of the kit, enabled and forced |

Created by `migrations/0002_spaces_and_lists.sql`, which forces the three policies by hand.

- `spaces.id` and `lists.id` come from `uuidv7()`; `created_at` is `timestamptz(3)`, so that the
  position of a page round-trips exactly through the cursor. `statuses` is a `jsonb` of the ten
  keys, `{ name, hidden }` each. `owner_user_id` names an account, without a foreign key.
  `awaiting_owner` marks a private space whose owner left while the owner of the organization was
  unknown to the copy (CHECK: only a private space awaits an owner).
- `space_prefixes` holds one row per prefix a space of the organization ever took, with
  `last_number`, the last task number given under it (decisions 1 and 2): a prefix never passes to
  another space, and its numbers never go back.
- `lists` references its space by `(organization_id, space_id)`; a sprint has both dates (end on or
  after the start) and an optional goal, a list none of them (CHECK constraints).
- Indexes: `spaces (organization_id, created_at, id)` for the listing, `spaces (organization_id,
owner_user_id)` for the handover (a batch reads the rows of one owner, sorts them by
  `(created_at, id)` and keeps 100: a handed-over space leaves that range, an awaiting one stays in
  it but is filtered out, so the index suffices for the number of spaces one member owns, and no
  index is added), `lists (organization_id, space_id, created_at, id)` for the
  lists of a space; `space_prefixes` is read by its primary key only. No query plan was taken on
  representative data yet: the visibility filter of the listing (`visibility = 'organization' or
owner_user_id = $viewer`) runs after the index, which costs one row read per private space of
  another member.
- Changes lock the row `FOR NO KEY UPDATE`, which lets a list or a prefix that references the space
  be inserted meanwhile.

## API

`openapi/internal/task-service.yaml` (`@cadenway/contracts` 0.9.0), issuer `api-gateway`, actor
`user`, organization required:

| Route                                      | Operation             |
| ------------------------------------------ | --------------------- |
| `POST /internal/v1/spaces`                 | `createSpaceInternal` |
| `GET /internal/v1/spaces`                  | `listSpacesInternal`  |
| `GET /internal/v1/spaces/{spaceId}`        | `getSpaceInternal`    |
| `PATCH /internal/v1/spaces/{spaceId}`      | `updateSpaceInternal` |
| `POST /internal/v1/spaces/{spaceId}/lists` | `createListInternal`  |
| `GET /internal/v1/spaces/{spaceId}/lists`  | `listListsInternal`   |
| `GET /internal/v1/lists/{listId}`          | `getListInternal`     |
| `PATCH /internal/v1/lists/{listId}`        | `updateListInternal`  |

- The two creations honour `Idempotency-Key` (`@Idempotent()`, applied by `spaces.module.ts`: the
  decorator lives in `@cadenway/nest-common/database`, which the strict layout keeps out of
  `presentation/`). A replay answers the recorded `Location` and `ETag`: the version of the space
  or the list at its creation. A request still running with the same key answers
  `409 idempotency.request-in-progress`; a malformed key, `400 request.invalid` with one issue on
  the `Idempotency-Key` header.
- `GET /internal/v1/spaces/{spaceId}/overview` and `GET /internal/v1/lists/{listId}/counts` count
  tasks: the tasks module serves the overview and the list counts (PR 3).

## Events emitted

`space.created.v1`, `space.updated.v1` (with `changed`), `list.created.v1`, `list.updated.v1` (with
`changed`) of `asyncapi/task-service.yaml`, appended to the outbox in the transaction of the
change. A space creation emits `space.created.v1` then the `list.created.v1` of its "Première
liste". A patch that changes nothing emits nothing. The handover emits `space.updated.v1` with
`changed: ['ownerUserId']` and the actor `{ type: 'system', id: 'task-service' }`, when a space
passes to the owner of the organization; a space left awaiting an owner emits nothing (the field is
not in the event, and the space is seen by nobody), its handover later does.

## Events consumed

None directly; the clean-up job of member-lifecycle calls `HandOverPrivateSpaces` batch after
batch after a `member.removed.v1`, and member-lifecycle calls `HandOverAwaitingSpaces` on the join
or role change that gives an organization its owner.

## Invariants

- An actor the copy of the memberships does not hold answers `404 organization.not-found`; a guest
  sees no space and creates none (`403 organization.role-forbidden`).
- A space of the organization is seen by every member but the guests; a private space by its owner
  only, not by the owner or the admins of the organization. What the actor does not see answers
  `404` and is left out of every collection; a list is seen by whoever sees its space.
- Only the owner of the space, or the owner or an admin of the organization, changes its visibility
  (`403 space.visibility-forbidden`); every other change is open to any member who sees it.
- A prefix belongs for good to the first space that took it (`409 space.prefix-taken`); a space may
  take back one of its former prefixes, whose numbering continues. `nextKey` previews the next
  number, reserving nothing.
- `todo` and `done` are never hidden (`422 space.status-required`); a status name has at most 24
  characters.
- A task number is handed out once, by `AllocateTaskKeys`, in the transaction that creates the
  task, and never again: the counter of a prefix only moves forward, a rollback gives the numbers
  back, and no number is given twice nor above 999,999,999 (a counter past it is a defect that
  answers 500 and rolls back). `nextKey` and `FindVisibleList` only preview the next number and
  reserve nothing; the allocation emits nothing and leaves the version of the space unchanged.
- A sprint ends on or after its start (`422 list.sprint-dates-invalid`).
- A list never changes space, and a space or a list is never deleted in this version: the tasks
  module copies `space_id` and `list_id` onto its rows without a foreign key (the strict layout
  forbids importing these schemas), and what it stores stays right only while both hold. A change
  that moves a list to another space, or deletes a space or a list, has to migrate the tasks first.
- A private space is seen by its owner only. When the owner of a private space leaves the
  organization, the removal commits without touching the space, and the clean-up job of the removal
  then makes the owner of the organization its owner (`space.updated.v1`, system actor), unless the
  copy holds the account as a member again when the batch runs: the person then keeps the spaces
  the job had not reached. Until the job reaches the space, it stays owned by a person who is no
  longer a member, so nobody sees it, the owner and the admins of the organization included (fail
  closed). While the copy does not hold the owner of the organization, the job marks the space
  awaiting an owner: seen by nobody, the former owner included, until the copy learns the owner and
  the space passes to them (decision revised by the coordinating session for P3a, then again in
  PR 2: the removal itself no longer hands over). A space of the whole organization keeps
  a former member as owner; made private, it passes to the owner of the organization in the same
  change (`changed` gains `ownerUserId`), or the change is refused
  (`403 space.visibility-forbidden`) while the copy holds no owner of the organization.
- The organization and the actor come from the verified token only, lower-cased; an actor id that
  is not a UUID answers `403 auth.actor-not-allowed`.
- A text holding U+0000, in any member, or a calendar date of the year 0000 in the `startDate` or
  `endDate` of a sprint, answers `400 request.invalid`: the contract validators accept them,
  PostgreSQL cannot store them. A name or a goal that reads `0000-11-03` is only a text.

## Transactions

Every use case runs in one tenant transaction of the organization of the context
(`TenantSpacesUnitOfWork`), joined to the one the `Idempotency-Key` interceptor opened for a
creation, or to the one the deduplicator opened for the handover of the awaiting spaces: the space,
its prefix, its first list and their outbox rows commit together, or nothing does. A refusal rolls
it back. The readings of the copy join the same transaction; a write reads the membership of the
actor `FOR SHARE`, so that a concurrent removal of the actor waits for the write, and the clean-up
job of the removal, which runs after it, sees a private space the write just created or made
private. Locks are always taken membership first, then space, and a change locks its space or list
`FOR NO KEY UPDATE`. A batch of `HandOverPrivateSpaces` opens its own transaction in the
organization context of the job: it locks up to 100 spaces in `(created_at, id)` order, then reads
the copy without lock, then writes each space and its event (about 200 round trips for a full
batch, under the 10 s statement timeout and the 5 s lock timeout of the application role); a
request that writes a space the batch holds waits for it at most 5 s. A failed batch rolls back
alone, the batches before it stay committed.

`FindVisibleList`, `FindVisibleSpaceLists`, `ListCurrentSprints`, `ListSidebarLists`,
`ListVisibleSpaceIds` and `AllocateTaskKeys` join the tenant transaction of the tasks module the
same way. The five readings take no lock and append no event; the two listings of lists through
their space join `spaces` on `(organization_id, id)` and apply the one visibility condition of
`listVisible` and `listVisibleIds` (`(visibility = 'organization' or owner_user_id = $viewer) and
not awaiting_owner`), kept in one infrastructure mapper. The allocation is one
`UPDATE space_prefixes SET last_number = last_number + count ... RETURNING`, scoped by organization,
prefix and space, which locks the prefix row until the caller commits: creations under one prefix
are serialized, so the caller allocates last, after every validation, and takes no space lock.

The unit of work wakes the relay once its `run` resolved when an event was appended: after the
commit when it opened the transaction; inside a joined one (a creation with `Idempotency-Key`, the
handover of the awaiting spaces) before the outer commit, so that the rows then leave at the next
poll of the relay, within a second.

## Decisions

- The handover of the private spaces of a removed member is a batch operation that the clean-up
  job of member-lifecycle runs after the removal committed (decision revised again by the
  coordinating session in PR 2 of P3a): the removal loaded and updated every private space of the
  member in its own transaction, one outbox append per space and no limit, so a member with very
  many private spaces could not be removed. Batches of 100, first-N without a cursor: the spaces a
  batch processed leave its filter. The copy is read after the lock, so a re-join committed before
  the batch keeps the spaces; a re-join that commits after the read loses the spaces of that batch
  to the owner of the organization (accepted race, as for an inline handover).
- Lists live in this module: a space is created with its first list in one transaction, and a
  separate lists module would form a cycle with this one.
- Primary keys start with `organization_id`, as every index a tenant query uses, and the foreign
  keys repeat it, so that a list or a prefix never references a space of another organization.
- `If-Match` is optional; a stale one answers `412 request.version-mismatch` with the stored version,
  checked after the visibility of the space and before the domain rules.
- The overview and the counts of a list moved from PR 1 to PR 3, with the agreement of the
  coordinating session: they count tasks, which exist from PR 2, and the tasks module serves the
  overview and the list counts (PR 3), which avoids a cycle between spaces and tasks: the tasks
  module depends on spaces through the public entries above, never the reverse.
- The tasks module passes the role of the viewer to the five readings (`FindVisibleList`,
  `FindVisibleSpaceLists`, `ListCurrentSprints`, `ListSidebarLists` and `ListVisibleSpaceIds`): it
  reads it from the copy of the memberships (`FindOrganizationMember`) in the same transaction,
  never from the token, and these operations apply `canSeeSpace` to it without a second reading
  (a guest gets `null` or an empty list, without a statement for the three new ones).
- Cost of the three readings added in PR 3, all bounded by the lists of the organization, not by its
  tasks: `FindVisibleSpaceLists` reads every list of one space through `lists (organization_id,
space_id, created_at, id)` (unpaged on purpose: the overview counts every list); `ListSidebarLists`
  reads the lists of the visible spaces in sidebar order and stops at `limit`; `ListCurrentSprints`
  filters the lists of the visible spaces on their sprint dates, which no index serves (the lists
  of an organization are few, and the space and list counts are the bound). "Accueil" calls the last
  two on every load, and the overview calls the first on every page. If an organization comes to
  hold thousands of lists, add an index on the sprint dates before it is measured slow.
- `tests/spaces.int-spec.ts` proves the routes, the visibility rules, the prefixes, idempotency,
  row-level security and the handover by the clean-up job on real PostgreSQL, NATS and pg-boss,
  the window before it included. The batches of 100 and a failed batch that rolls back alone are
  proven by the unit spec of `HandOverPrivateSpaces` only: no integration test seeds more than 100
  private spaces.
