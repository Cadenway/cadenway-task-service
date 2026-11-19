# Access requests

## Purpose

The requests for access of each organization ("Demander l’accès", "Demande envoyée", decision 4 of
P3b-1, "Access requests" of `openapi/public/access.yaml`):

- a request of a member for a space or a list by its id, or a task by its key, with an optional
  message, taken whatever the target and stored only when the rules say so;
- the hourly limit of 10 requests per requester and organization, stored or not;
- the pending requests the people who manage a target read, their approval with a role (which gives
  the grant through the spaces module) and their refusal;
- the dropping of the pending requests of a member who left the organization, one batch per call,
  which the clean-up job of member-lifecycle runs after the removal.

It owns neither the spaces, the lists, the grants and the access rules (spaces), nor the tasks
(tasks), the memberships (organization-members), nor the notice to the owner and the answer to the
requester (cadenway-notification-service, from the events, in P4).

## Public entry points

| Entry point                                         | Consumers        |
| --------------------------------------------------- | ---------------- |
| `access-requests.module`                            | member-lifecycle |
| `public/access-request/drop-member-access-requests` | member-lifecycle |

`AccessRequestsModule` exports the `DropMemberAccessRequests` provider (`{ organizationId, userId }`
to `{ outcome: 'none-left' }`, `{ outcome: 'member-again' }` or `{ outcome: 'dropped', dropped }`):
one batch of at most 500 pending requests of a former member, deleted with the attempts of the
account, in a tenant transaction of its own of the organization of the context. The clean-up job of
member-lifecycle calls it after the grants were removed, until `none-left` or `member-again`. No
event: the contract defines none for a dropped request.

## Owned tables

| Table                     | Key                     | Organization scoping                                     |
| ------------------------- | ----------------------- | -------------------------------------------------------- |
| `access_requests`         | `(organization_id, id)` | `organization_id`, policy of the kit, enabled and forced |
| `access_request_attempts` | `(organization_id, id)` | `organization_id`, policy of the kit, enabled and forced |

Created by `migrations/0005_access_grants.sql`, which forces both policies by hand.

- `access_requests.id` comes from `uuidv7()`; `created_at` and `decided_at` are `timestamptz(3)`, so
  that the position of a page round-trips exactly through the cursor. `target` is `space`, `list`
  or `task`; `target_id` the id of the space, the list or the task; `space_id` the space of the
  target; `list_id` the list of a list request, or the list a task was in when it was asked for;
  `task_id` and `task_key` name a task target. CHECK constraints keep the shape of each target, the
  three states, a role exactly for an approval and a decision (`decided_at`, `decided_by_type`,
  `decided_by_id`) exactly for an answered request. `space_id`, `list_id` and `task_id` name rows
  of other modules without a foreign key: the strict layout forbids importing their schemas.
- `access_requests_pending_unique (organization_id, requester_user_id, target, target_id) WHERE
state = 'pending'` keeps one pending request per requester and target (the insert is
  `ON CONFLICT ... DO NOTHING` on it) and serves the batches of the clean-up through its
  `(organization_id, requester_user_id)` prefix; `access_requests_pending_index (organization_id,
created_at, id) WHERE state = 'pending'` serves the listing, walked backwards, the filter on the
  spaces and lists a member answers applied to its rows. Both predicates are written as the literal
  `state = 'pending'` in the queries so the planner matches them. No query plan was taken on
  representative data yet.
- `access_request_attempts` holds one row per request taken, stored or not, with `attempted_at`
  (`timestamptz(3)`, the `now()` of the transaction) and no target.
  `access_request_attempts_user_index (organization_id, user_id, attempted_at)` serves the count,
  the pruning and the deletion as one range each. The attempts of a requester older than an hour
  are deleted by their next request and those of a former member by the clean-up, so the table holds
  at most the attempts of the last hour plus the last ones of people who stopped asking.
- Answered requests are kept: they are the history the requester was answered with.

## API

`openapi/internal/task-service.yaml` (`@cadenway/contracts` 0.10.0), issuer `api-gateway`, actor
`user`, organization required:

| Route                                                          | Operation                      | Success                |
| -------------------------------------------------------------- | ------------------------------ | ---------------------- |
| `POST /internal/v1/access-requests`                            | `createAccessRequestInternal`  | `202`, no body         |
| `GET /internal/v1/access-requests`                             | `listAccessRequestsInternal`   | `200`                  |
| `POST /internal/v1/access-requests/{accessRequestId}/approval` | `approveAccessRequestInternal` | `200`, `AccessRequest` |
| `POST /internal/v1/access-requests/{accessRequestId}/refusal`  | `refuseAccessRequestInternal`  | `200`, `AccessRequest` |

- The body of a request is validated by the generated validator, then refined: exactly one of
  `spaceId`, `listId` and `taskKey`, else `400 request.invalid` with one issue
  `{ in: 'body', path: '', code: 'custom' }`; a message holding U+0000 answers `400` with one issue
  on `message`. Ids are read in either case.
- `202` always, whatever the target: the status, the body and the reads never tell whether it
  exists, is seen already or is asked for already. `404 organization.not-found` for an actor the
  copy does not hold; `429 access-request.limit-reached` with `details.nextAvailableAt` (ISO
  instant: the oldest counted request plus one hour) and `Retry-After` (whole seconds until then, at
  least 1, set on the response since `ProblemException` carries no header; the gateway derives its
  own from `details.nextAvailableAt`).
- The listing: `spaceId` keeps the requests of a space, its lists and their tasks, `listId` those of
  a list and its tasks; `limit` 1 to 100 (50 by default); `cursor` is the `nextCursor` of a page of
  the same filters, any other answers `400 request.invalid` with one issue
  `{ in: 'query', path: 'cursor', code: 'invalid_cursor' }`; `total` on every page. A task request
  carries `task` (`TaskRef`, its key, name and status as they are now), `null` if the tasks module
  no longer finds the task.
- An answer: `404 access-request.not-found` for an unknown request or one the actor does not answer,
  decided or not; `409 access-request.already-decided` with `details.state`; an approval also
  answers `422 access.grantee-invalid` (`details.userId`), `access.guest-space-forbidden`,
  `access.owner-unchangeable` or `access.grant-limit-reached` from the spaces module, and
  `404 access-request.not-found` when the space or the list no longer exists. The refusal body is
  the empty object of the contract, validated and not read.

## Events emitted

Through the outbox, in the transaction of the change, validated with `eventSchemas` of
`@cadenway/contracts/events/task-service`:

- `space.access-requested.v1`, `list.access-requested.v1`, `task.access-requested.v1` when a request
  is stored: version 1, actor the requester, the names of the space (and of the list, and of the
  task), `spaceOwnerUserId` and the message. Asking again while a request is pending emits nothing.
- `space.access-request-decided.v1`, `list.access-request-decided.v1`,
  `task.access-request-decided.v1` when a request is answered: version 2, actor who answered,
  `decision` (`approved` or `refused`) and `role` (`null` for a refusal), no name. An approval also
  emits, before it and through the spaces module, the `space.access-changed.v1` or
  `list.access-changed.v1` of the grant when the grant changed.

## Events consumed

None directly. The clean-up job of member-lifecycle runs `DropMemberAccessRequests` batch after
batch after a `member.removed.v1`.

## Invariants

- An actor the copy of the memberships does not hold answers `404 organization.not-found`, for every
  route. The organization and the actor come from the verified token only, lower-cased.
- A request is stored only when its target exists in the organization and the requester has no role
  on it: on the space for a space, on its list for a list or a task (`isRequestStored`). A guest's
  request for a space is never stored. The answer is the same `202` whatever happened.
- One pending request per requester and target: asking again changes nothing, its message
  included, and emits nothing. A request for a list and one for a task of that list are distinct.
- A message is trimmed, `null` when empty, 500 characters at most.
- 10 requests per requester and organization within the last hour (a request exactly an hour old has
  left it), stored or not; the eleventh is refused and counts for nothing.
- A request changes once, from `pending` to `approved` with a role or to `refused`; its version is 1,
  then 2. The requester never reads it.
- Only the people who manage its target answer and read a request: the space requests of the spaces
  they manage (`callerCanManage`), the list and task requests of the lists they have `edit` on (the
  stored list). Anyone else gets `404` and an empty listing.
- An approval grants the space of a space request and the list of a list or a task request, and
  raises without lowering: a lower grant is raised, an equal or higher one is kept, the request
  records the role the approval gave.
- The pending requests of a member who left are dropped with their attempts by the clean-up job,
  unless the copy holds them as a member again when a batch runs.

## Transactions

Every use case runs in one tenant transaction of the organization of the context
(`TenantAccessRequestsUnitOfWork`); the readings of the copy (`FindOrganizationMember`), of the
spaces (`FindAccessTarget`, `ListManagedAccessTargets`), of the tasks (`FindTaskReference`,
`FindTaskReferences`) and the grant (`GrantRequestedAccess`) join it through their own runners,
which open no transaction of their own and ask for no read-only access, so they join a read-write
transaction as well as a read-only one. A refusal rolls everything back. The unit of work wakes the
relay once a run that appended events resolved.

- A request: the membership of the actor `FOR SHARE` (a concurrent removal waits for the request,
  so its clean-up job sees it), then `pg_advisory_xact_lock` on the organization and the account,
  which serializes the requests of one requester (the count, the insert and the uniqueness see each
  other), then the clock, the attempts of the hour (at most 10 rows), and, when allowed, the pruning
  and the new attempt, then the target (one or two readings of other modules, without lock), then,
  when stored, the insert and one outbox append.
- The listing runs in `runReadOnly`: the role, `ListManagedAccessTargets`, the page (one statement,
  `limit + 1` rows), the total (one statement) and the tasks of the page (one batch); a member who
  answers nothing reads no request. Each statement reads what was committed when it started.
- An answer: the membership of the actor `FOR SHARE`, the request `FOR UPDATE` (two answers are
  serialized, the second sees the first), `FindAccessTarget` without lock, the clock; for an approval
  `GrantRequestedAccess`, which locks the membership of the requester `FOR SHARE` then the space or
  the list `FOR NO KEY UPDATE`; then the update of the request and its outbox append, and the task of
  a task request for the answer.
- A batch of `DropMemberAccessRequests` opens its own transaction in the organization context of the
  clean-up job: it locks up to 500 pending requests of the account `FOR UPDATE` in id order, reads
  the copy without lock, then deletes them and the attempts of the account: four statements whatever
  the size, under the 10 s statement timeout and the 5 s lock timeout of the application role. An
  answer that holds one of these requests makes the batch wait at most 5 s. A failed batch rolls
  back alone; the loop, the retries and the dead letters belong to member-lifecycle (its MODULE.md).
- Lock order: memberships, then requests, then spaces and lists. The batch locks no membership and
  no space, and the removal of a member locks no request, so they cannot deadlock with an answer.

## Decisions

- A module of its own: a request reads the spaces, the lists and the tasks and an approval writes a
  grant, so it depends on spaces and tasks, and neither may depend on it (tasks already depends on
  spaces; a request held in either would close a cycle). member-lifecycle depends on it.
- The requests of one requester are serialized by a transaction-level advisory lock keyed on
  `hashtextextended('access-request:<organization>:<account>', 0)`, released at the commit or the
  rollback: without it two concurrent requests could both pass the limit. A row lock cannot do it,
  since an attempt row is not there yet. A collision of keys only serializes two unrelated requests
  for a moment.
- The limit counts attempts in a table of its own, not the stored requests: the requests not stored
  must count too, or a `429` would tell that a target exists (decisions beyond the brief of
  cadenway-api-contracts#36). Each request prunes the attempts of its requester older than an hour,
  so the table stays bounded without a job. The count reads the 10 most recent attempts of the hour,
  which also give `nextAvailableAt`. The clock is the `now()` of the transaction.
- The limit is per requester and organization, as the table is a tenant table: the same person asks
  10 times per hour in each organization they belong to.
- The rule of what is stored (`isRequestStored` of the domain) reads the role the spaces module
  computes (`FindAccessTarget.viewerRole`), on the space for a space and on the list for a list or a
  task, so that what "seen" means stays with the access rules.
- A task request stores the list the task was in when it was asked for: an approval grants that list
  ("a task request is approved as a grant of its list"), and the people who have `edit` on it answer
  the request, even if the task has moved since.
- An approval raises and never replaces: `GrantRequestedAccess` keeps an equal or higher grant, so an
  approval with `view` never lowers someone who was given `edit` meanwhile.
- Timing: a request makes the same calls whatever the target: an unknown task key still reads a list
  (the nil UUID, which no list has). What still differs is the work of a stored request (one insert
  and one outbox append) and the inner statements of the other modules; an attacker can probe at
  most 10 ids per hour and the ids of spaces and lists are UUIDv7. Accepted, not measured.
- `grantee-invalid` at an approval (the requester left, and the clean-up has not dropped the request
  yet) answers `422 access.grantee-invalid` with `details.userId`, as the grant routes do; the public
  contract also lists "whose requester left" under `404`, which the clean-up makes true once it ran.
- A task request whose task is no longer found shows `task: null` rather than being left out, so its
  managers can still refuse it; none can be missing in this version.
- What PR 3 owes: drop the pending requests of a deleted space or list and of a trashed task (the
  contract: "The pending requests of a target that is deleted ... are dropped"), and decide what an
  archived target keeps (the contract stores requests for archived targets).
- Not proven yet on real PostgreSQL and NATS: the integration specs of these routes, the advisory
  lock under concurrency, the partial-index plans and row-level security of both tables belong to
  the integration tests of the PR (`tests/*.int-spec.ts`, coordinator). The unit specs cover the
  rules, the order of the calls and the rollbacks on fakes.
