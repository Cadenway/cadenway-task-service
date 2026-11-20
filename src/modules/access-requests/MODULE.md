# Access requests

## Purpose

The requests for access of each organization ("Demander l’accès", "Demande envoyée", decision 4 of
P3b-1, "Access requests" of `openapi/public/access.yaml`):

- a request of a member for a space or a list by its id, or a task by its key, with an optional
  message, taken whatever the target and stored only when the rules say so;
- the hourly limit of 10 requests per requester and organization, stored or not;
- the pending requests the people who manage a target read, their approval with a role (which gives
  the grant through the spaces module) and their refusal;
- the dropping of the requests of a member who left the organization, one batch per call, which the
  clean-up job of member-lifecycle runs after the removal;
- the dropping of the pending requests of a deleted target (a space, a list, the tasks in the
  trash), which the jobs of deletion-lifecycle run.

It owns neither the spaces, the lists, the grants and the access rules (spaces), nor the tasks
(tasks), the memberships (organization-members), nor the notice to the owner and the answer to the
requester (cadenway-notification-service, from the events, in P4).

## Public entry points

| Entry point                                         | Consumers                            |
| --------------------------------------------------- | ------------------------------------ |
| `access-requests.module`                            | member-lifecycle, deletion-lifecycle |
| `public/access-request/drop-member-access-requests` | member-lifecycle                     |
| `public/access-request/drop-target-access-requests` | deletion-lifecycle                   |

`AccessRequestsModule` exports the `DropMemberAccessRequests` provider (`{ organizationId, userId }`
to `{ outcome: 'none-left' }`, `{ outcome: 'member-again' }` or `{ outcome: 'dropped', dropped }`):
one batch of at most 500 requests of a former member, pending or answered, deleted with the
attempts of the account, in a tenant transaction of its own of the organization of the context.
The clean-up job of member-lifecycle calls it after the grants were removed, until `none-left` or
`member-again`. No event: the contract defines none for a dropped request.

It also exports the `DropTargetAccessRequests` provider (`{ organizationId, target }` to
`{ dropped }`, `target` a `DroppedRequestTarget`: `{ kind: 'tasks', taskIds }` with 2,000 ids at
most, more throws before any statement, `{ kind: 'list', listId }` or `{ kind: 'space', spaceId }`):
the pending requests of a deleted target, in the tenant transaction of its caller, which it joins.
The jobs of deletion-lifecycle call it in transactions that read the target still deleted under its
lock: for a deleted or erased space (its space requests and the list requests of its lists) when
they read its lists, for each deleted list in its first batch, for the tasks of each batch they
move to the trash, and for the tasks of an entry of "Supprimer la tâche" that are not out of the
trash. The caller decides that the target is
deleted; this operation only deletes. No event.

## Owned tables

| Table                     | Key                     | Organization scoping                                     |
| ------------------------- | ----------------------- | -------------------------------------------------------- |
| `access_requests`         | `(organization_id, id)` | `organization_id`, policy of the kit, enabled and forced |
| `access_request_attempts` | `(organization_id, id)` | `organization_id`, policy of the kit, enabled and forced |

Created by `migrations/0005_access_grants.sql`, which forces both policies by hand.

- `access_requests.id` comes from `uuidv7()`; `created_at` and `decided_at` are `timestamptz(3)`, so
  that the position of a page round-trips exactly through the cursor. `target` is `space`, `list`
  or `task`; `target_id` the id of the space, the list or the task; `space_id` the space of the
  target when asked; `list_id` the list of a list request, or the list a task was in when it was
  asked for (what its `task.access-requested.v1` said); `task_id` and `task_key` name a task target.
  CHECK constraints keep the shape of each target, the three states, a role exactly for an approval
  and a decision (`decided_at`, `decided_by_type`, `decided_by_id`) exactly for an answered
  request. `space_id`, `list_id` and `task_id` name rows of other modules without a foreign key: the
  strict layout forbids importing their schemas.
- `access_requests_pending_unique (organization_id, requester_user_id, target, target_id) WHERE
state = 'pending'` keeps one pending request per requester and target (the insert is
  `ON CONFLICT ... DO NOTHING` on it); `access_requests_pending_index (organization_id, created_at,
id) WHERE state = 'pending'` serves the listing, walked backwards, and the read of the pending task
  requests. Both predicates are written as the literal `state = 'pending'` in the queries so the
  planner matches them. `access_requests_requester_index (organization_id, requester_user_id, id)`
  serves the batch of the clean-up, which locks the requests of the account, pending or answered,
  in id order: one range of the requests of that account, whatever the organization holds.
- `access_request_attempts` holds one row per request taken, stored or not, with `attempted_at`
  (`timestamptz(3)`, the `now()` of the transaction) and no target.
  `access_request_attempts_user_index (organization_id, user_id, attempted_at)` serves the count,
  the pruning and the deletion as one range each. The attempts of a requester older than an hour
  are deleted by their next request and those of a former member by the clean-up, so the table holds
  at most the attempts of the last hour plus the last ones of people who stopped asking.
- Answered requests are kept while the requester is a member: they are the history the requester was
  answered with. The clean-up of a former member deletes them, with the free text they wrote.

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
- `202` always, whatever the target: the status, the body and the statements never tell whether it
  exists, is seen already or is asked for already. `404 organization.not-found` for an actor the
  copy does not hold; `429 access-request.limit-reached` with `details.nextAvailableAt` (ISO
  instant: the oldest counted request plus one hour) and `Retry-After` (whole seconds until then, at
  least 1, set on the response since `ProblemException` carries no header; the gateway derives its
  own from `details.nextAvailableAt`).
- The listing: `spaceId` keeps the requests of a space, its lists and the tasks now in them, `listId`
  those of a list and the tasks now in it; `limit` 1 to 100 (50 by default); `cursor` is the
  `nextCursor` of a page of the same filters, any other answers `400 request.invalid` with one
  issue `{ in: 'query', path: 'cursor', code: 'invalid_cursor' }`; `total` on every page. A task
  request carries `task` (`TaskRef`, its key, name and status as they are now) and the `spaceId` and
  `listId` of the list the task is in now; a task request whose task is no longer found is left out.
- An answer: `404 access-request.not-found` for an unknown request, one whose requester left the
  organization, one whose task is no longer found, or one the actor does not answer, decided or
  not; `409 access-request.already-decided` with `details.state`; an approval also answers
  `422 access.grantee-invalid` (`details.userId`), `access.guest-space-forbidden`,
  `access.owner-unchangeable` or `access.grant-limit-reached` from the spaces module, and
  `404 access-request.not-found` when the space or the list no longer exists or the actor no longer
  manages it on the locked rows (`manage-forbidden`). The answer of a task request names the list
  the task is in now. The refusal body is the empty object of the contract, validated and not read.

## Events emitted

Through the outbox, in the transaction of the change, validated with `eventSchemas` of
`@cadenway/contracts/events/task-service`:

- `space.access-requested.v1`, `list.access-requested.v1`, `task.access-requested.v1` when a request
  is stored: version 1, actor the requester, the names of the space (and of the list, and of the
  task), `spaceOwnerUserId` and the message; a task request names the list the task is in when
  asked. Asking again while a request is pending emits nothing.
- `space.access-request-decided.v1`, `list.access-request-decided.v1`,
  `task.access-request-decided.v1` when a request is answered: version 2, actor who answered,
  `decision` (`approved` or `refused`), `role` (`null` for a refusal), no name; a task request names
  the space and the list its task is in now, on which an approval gave the role. An approval also
  emits, before it and through the spaces module, the `space.access-changed.v1` or
  `list.access-changed.v1` of the grant when the grant changed.

## Events consumed

None directly. The clean-up job of member-lifecycle runs `DropMemberAccessRequests` batch after
batch after a `member.removed.v1`; the jobs of deletion-lifecycle run `DropTargetAccessRequests`
after a deletion of a list or a space and after "Supprimer la tâche".

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
  they manage (`callerCanManage`), the list requests of the lists they have `edit` on, and the task
  requests whose task is now in a list they have `edit` on ("the list of the task for a task").
  Anyone else gets `404` and an empty listing. A request whose requester left, or whose task is no
  longer found, is answered by nobody.
- An approval grants the space of a space request, the list of a list request and the current list
  of the task of a task request, and raises without lowering: a lower grant is raised, an equal or
  higher one is kept, the request records the role the approval gave.
- The requests of a member who left, pending or answered, are dropped with their attempts by the
  clean-up job, unless the copy holds them as a member again when a batch runs.
- The pending requests of a deleted target are dropped by the jobs of deletion-lifecycle ("The
  pending requests of a target that is deleted ... are dropped"): the space requests of a deleted
  or erased space and the list requests of its lists, the list requests of a deleted or erased
  list, the task requests of the tasks in the trash or erased, each while the target is still
  deleted. A deleted space has all its lists deleted (restoring a list restores its space) and an
  erased one has no list left, so every list request of such a space belongs to a deleted or erased
  list; this also covers the lists of the space erased before its job ran. Until then
  they are hidden: their target is no longer found, so nobody reads or answers them; a target
  restored first keeps them. Answered requests stay, and a request for an archived target stays
  pending (a request is stored for an archived target); the attempts are untouched.

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
  and the new attempt, then the target under a `FOR SHARE` lock held until the commit (a space
  through `FindAccessTarget`, which locks the space; a list through `FindAccessTarget`, which locks
  the list and reads its space without a lock; a task through `FindTaskReference`, which locks the
  task, then its list through `FindAccessTarget`, which locks the list), in the same statements and
  locks for every outcome (an unknown target is read as the nil UUID), then one
  insert, always (`INSERT ... SELECT ... WHERE $stored ON CONFLICT ... DO NOTHING`), and, for a
  stored request, one outbox append. A deletion or a trash of the target running meanwhile either
  commits first, and the request reads its target deleted or in the trash and stores nothing, or
  waits for the request, whose pending row its job then drops. The lock of the list suffices for a
  list or a task: a deletion of its space writes the list rows too (it marks them deleted), so it
  conflicts with that lock as a deletion of the list does. Lock order: the membership, the advisory
  lock, the attempts, the task, then the space (a space target) or the list, then the insert. It
  cannot deadlock with a batch of a deletion job (tasks `FOR NO KEY UPDATE`, the list `FOR SHARE`,
  then the access requests), a trash (tasks, then the list), a deletion of a list or a space (the
  space, then its lists) or a restoration (tasks, the space, the list): the request holds one row
  of the space or the list only, after its task, and takes the access requests last.
- The listing runs in `runReadOnly`: the role, `ListManagedAccessTargets`, then, when the actor has
  `edit` on some list, the distinct tasks of the pending task requests of the organization (one
  statement) located with `FindTaskReferences` in chunks of 100, then the page (one statement,
  `limit + 1` rows) and the total (one statement); a member who answers nothing reads no request.
  The task requests cost O(pending task requests of the organization) per listing, whatever the
  page, bounded by the hourly limit of each requester and by the clean-up of the former members.
  Each statement reads what was committed when it started.
- An answer: the membership of the actor `FOR SHARE`, the request `FOR UPDATE` (two answers are
  serialized, the second sees the first), the membership of the requester without lock, the task of
  a task request (`FindTaskReferences`), `FindAccessTarget` without lock, the clock; for an
  approval, `GrantRequestedAccess`, which locks the membership of the requester `FOR SHARE`, then
  the space or the list `FOR NO KEY UPDATE`; then the update of the request and its outbox append.
- A batch of `DropMemberAccessRequests` opens its own transaction in the organization context of the
  clean-up job: it locks up to 500 requests of the account `FOR UPDATE` in id order, reads the copy
  without lock, then deletes them and the attempts of the account: four statements whatever the
  size, under the 10 s statement timeout and the 5 s lock timeout of the application role. An
  answer that holds one of these requests makes the batch wait at most 5 s. A failed batch rolls
  back alone; the loop, the retries and the dead letters belong to member-lifecycle (its MODULE.md).
- `DropTargetAccessRequests` joins the transaction of the job step that calls it: one delete of the
  pending requests (`state = 'pending'`) of the target, `target_id = ANY($tasks)` for task
  requests, `target_id = $list` for list requests, `target_id = $space` or `space_id = $space` for
  a space (`target_id` is the task, the list or the space of the target, which the shape check
  keeps), with no read before it. No index serves `target_id` alone: the statement reads the pending requests of
  the organization through `access_requests_pending_index`, O(pending requests of the
  organization), like the listing, bounded by the hourly limit of each requester; its plans are for
  the integration suite to measure. A request an answer holds `FOR UPDATE` makes the statement wait
  5 s at most, then it is answered and stays. In a deletion batch it runs after the tasks module locked the tasks and held
  the deleted list `FOR SHARE`: an approval locks its request, then the list, only once it read the
  list live, which a deleted list is not, so the two never wait in opposite orders.
- Lock order of an approval: the membership of the actor `FOR SHARE`, the request `FOR UPDATE`,
  then inside `GrantRequestedAccess` the membership of the requester `FOR SHARE` and the space or
  the list `FOR NO KEY UPDATE`. It cannot deadlock with a removal, which locks one membership
  exclusively and nothing else (it waits for the shares, or they wait for it, and it never waits for
  the request); nor with a batch of the clean-up, which locks requests only, then reads the copy
  without lock (an approval waits for the batch at the request, or the batch waits for the approval
  at the request, and neither then waits for the other); nor with `RemoveMemberGrants`, which locks
  spaces and lists and reads the copy without lock, so it never waits for a membership.

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
- A task request concerns the list its task is in now (`openapi/public/access.yaml`: "the list of
  the task for a task"; `task.access-request-decided.v1`: "the role an approval gave on the list of
  the task"): who answers it, what an approval grants, the `spaceId` and `listId` of its answer and
  of its decided event, and the scope of the listing all follow the task when it moves, so the
  editors of a list it left neither answer it nor read the live name and status of a task they may
  no longer see. The stored `list_id` stays the list the task was in when asked, which its
  `task.access-requested.v1` named.
- An approval raises and never replaces: `GrantRequestedAccess` keeps an equal or higher grant, so an
  approval with `view` never lowers someone who was given `edit` meanwhile.
- A request whose requester left the organization answers `404 access-request.not-found` to an
  approval and a refusal (`AccessRequestNotFound`: "or one whose requester left"), as soon as the
  copy says so, before the clean-up drops it. `422 access.grantee-invalid` remains for a removal
  that commits between that reading and the lock of `GrantRequestedAccess`.
- Timing: a request runs the same statements whatever the target: an unknown task key still reads a
  list (the nil UUID, which no list has), the spaces module gives `FindAccessTarget` the same
  statements for every outcome, and the insert always runs, with placeholder values that `WHERE
false` keeps from any row when nothing is stored. The one difference left is the outbox append of
  a stored request (one statement); accepted, since a requester takes 10 attempts per hour and per
  organization, and the ids of spaces and lists are UUIDv7.
- The clean-up of a former member deletes their answered requests too, in the same batches: each
  holds the free text the person wrote, which nothing needs once they left (privacy).
- P3b-1 PR 3: the pending requests of a deleted list or space and of a task moved to the trash are
  dropped by the jobs of deletion-lifecycle, not in the transaction of the deletion, so that a
  deletion does not grow with the requests; they are hidden at once, since the target is no longer
  found. An archived target keeps its requests, pending or answered: the contract stores a request
  for an archived target. Only pending requests go; an answered one stays as the history the
  requester was answered with, until the requester leaves the organization.
- `tests/access.int-spec.ts` proves on real PostgreSQL and NATS the routes, the existence oracle
  (same status, headers and body, and the timing medians of a stored request, a request not stored
  and an unknown target), the hourly limit, the approval and the refusal, row-level security on
  `access_requests` and `access_request_attempts`, the plans of the partial indexes, and the
  clean-up of the grants and the requests, a lock timeout and `member-again` included, 15
  concurrent requests of one requester (exactly 10 taken, 5 answered `429`, 10 attempts recorded),
  a task request that follows its task to another list, and a requester removed while the clean-up
  waits (`404`). The timing medians of the three outcomes are 13.1 to 13.2 ms. Plans on 10,005
  requests (2,000 pending, 500 of them for tasks) and 5,004 attempts: a page of the pending
  requests walks `access_requests_pending_index` backwards, 8 buffers, 0.1 ms; their total, 68
  buffers, 0.8 ms; the pending task requests of the organization (the listing),
  `access_requests_pending_unique`, 64 buffers, 0.4 ms, then one `FindTaskReferences` per 100 of
  them; the attempts of the hour, 12 buffers; the clean-up lock of the requests of an account,
  `access_requests_requester_index`, 42 buffers. Not proven: an approval refused by the check on
  the locked rows (`manage-forbidden`), which needs a concurrent loss of the right between the
  read and the lock.
