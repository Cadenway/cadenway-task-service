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
counts (the space overview and the counts of a list, served by the task query module from PR 3)
and the activity log belong to the task modules of P3a.

## Public entry points

| Entry point                             | Consumers        |
| --------------------------------------- | ---------------- |
| `spaces.module`                         | member-lifecycle |
| `public/space/hand-over-private-spaces` | member-lifecycle |

`SpacesModule` exports the `HandOverPrivateSpaces` provider with its input type: on
`member.removed.v1`, member-lifecycle calls it in the tenant transaction of the event, which it
joins.

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
- `space_prefixes` holds one row per prefix a space of the organization ever took, with
  `last_number`, the last task number given under it (decisions 1 and 2): a prefix never passes to
  another space, and its numbers never go back.
- `lists` references its space by `(organization_id, space_id)`; a sprint has both dates (end on or
  after the start) and an optional goal, a list none of them (CHECK constraints).
- Indexes: `spaces (organization_id, created_at, id)` for the listing, `spaces (organization_id,
owner_user_id)` for the handover, `lists (organization_id, space_id, created_at, id)` for the
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
  `presentation/`). Known deviations of `@cadenway/nest-common` 0.6.2 from the contract, accepted
  for P3a PR 1 by the coordinating session until the kit fixes them: a request still running
  answers `409 idempotency.in-progress` where the contract declares
  `idempotency.request-in-progress`; a replayed space creation carries the weak entity tag Express
  computes from the body (`W/"…"`) instead of the version of the space, since the kit replays only
  `Location` and its body has no top-level `version` (a replayed list creation carries its
  version); a malformed key answers `400 idempotency.key-invalid`, a code the contract does not
  declare.
- `GET /internal/v1/spaces/{spaceId}/overview` and `GET /internal/v1/lists/{listId}/counts` count
  tasks: the task query module serves them from PR 3.

## Events emitted

`space.created.v1`, `space.updated.v1` (with `changed`), `list.created.v1`, `list.updated.v1` (with
`changed`) of `asyncapi/task-service.yaml`, appended to the outbox in the transaction of the
change. A space creation emits `space.created.v1` then the `list.created.v1` of its "Première
liste". A patch that changes nothing emits nothing. The handover emits `space.updated.v1` with
`changed: ['ownerUserId']` and the actor `{ type: 'system', id: 'task-service' }`.

## Events consumed

None directly; member-lifecycle calls `HandOverPrivateSpaces` on `member.removed.v1`.

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
- A sprint ends on or after its start (`422 list.sprint-dates-invalid`).
- A private space always has an owner who is a member, so that someone sees it. When the owner of a
  private space leaves the organization, the owner of the organization becomes its owner, unless
  the account is still a member under another membership. A space of the whole organization keeps
  a former member as owner; made private, it passes to the owner of the organization in the same
  change (`changed` gains `ownerUserId`), or the change is refused
  (`403 space.visibility-forbidden`) while the copy holds no owner of the organization.
- The organization and the actor come from the verified token only, lower-cased; an actor id that
  is not a UUID answers `403 auth.actor-not-allowed`.
- A text holding U+0000, or a calendar date of the year 0000, answers `400 request.invalid`: the
  contract validators accept them, PostgreSQL cannot store them.

## Transactions

Every use case runs in one tenant transaction of the organization of the context
(`TenantSpacesUnitOfWork`), joined to the one the `Idempotency-Key` interceptor opened for a
creation, or to the one the deduplicator opened for the handover: the space, its prefix, its first
list and their outbox rows commit together, or nothing does. A refusal rolls it back. The readings
of the copy join the same transaction; a write reads the membership of the actor `FOR SHARE`, so
that a concurrent removal of the actor waits for the write, and its handover sees a private space
the write just created or made private. Locks are always taken membership first, then space, and
a change locks its space or list `FOR NO KEY UPDATE`.

The unit of work wakes the relay once its `run` resolved when an event was appended: after the
commit when it opened the transaction; inside a joined one (a creation with `Idempotency-Key`, the
handover) before the outer commit, so that the rows then leave at the next poll of the relay,
within a second.

## Decisions

- Lists live in this module: a space is created with its first list in one transaction, and a
  separate lists module would form a cycle with this one.
- Primary keys start with `organization_id`, as every index a tenant query uses, and the foreign
  keys repeat it, so that a list or a prefix never references a space of another organization.
- `If-Match` is optional; a stale one answers `412 request.version-mismatch` with the stored version,
  checked after the visibility of the space and before the domain rules.
- The overview and the counts of a list moved from PR 1 to PR 3 (task queries), with the agreement
  of the coordinating session: they count tasks, which exist from PR 2, and serving them from the
  task query module avoids a cycle between spaces and tasks.
- `tests/spaces.int-spec.ts` proves the routes, the visibility rules, the prefixes, idempotency,
  row-level security and the handover on real PostgreSQL and NATS.
