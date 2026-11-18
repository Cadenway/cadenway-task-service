# Tasks

## Purpose

The tasks of each organization (P3a, "Tâches") and what hangs from a task:

- a task: key, name, description, status (ten keys, with a cancel reason and note), priority, due
  and start dates, estimate, list and space, parent;
- its subtasks (three levels at most), its assignees, its labels and its checklist, which share the
  `version` of the task;
- the activity log of the tasks (creation, status, priority, due date, assignment), read by task
  and by list;
- the unassignment of a member who left the organization from their tasks, one batch per call,
  which the clean-up job of member-lifecycle runs after the removal.

It decides who sees a task: whoever sees the space of its list, with the visibility rules of the
spaces module, from the copy of the memberships of the organization-members module, never from the
`role` claim of the internal token. It does not own spaces, lists or the numbers of the task keys
(spaces hands them out), the memberships (organization-members), the documents, the attachments or
the automation rules (other services), nor the task queries by list, group, label or assignee, nor
the overview, the counts and the home, which the task query module serves from PR 3.

## Public entry points

| Entry point                               | Consumers        |
| ----------------------------------------- | ---------------- |
| `tasks.module`                            | member-lifecycle |
| `public/assignee/unassign-removed-member` | member-lifecycle |

`TasksModule` exports the `UnassignRemovedMember` provider
(`{ organizationId, userId, afterTaskId }` to `{ outcome: 'none-left' }`,
`{ outcome: 'member-again' }` or `{ outcome: 'unassigned', locked, unassigned, lastTaskId }`): one batch of the removal of a former
member from their tasks, in a tenant transaction of its own of the organization of the context.
The clean-up job of member-lifecycle calls it once the private spaces of the former member were
handed over, from `afterTaskId: null`, then after each `lastTaskId`, until `none-left` or
`member-again`. The module owns no job and no queue.

## Owned tables

| Table              | Key                                     | Organization scoping                                     |
| ------------------ | --------------------------------------- | -------------------------------------------------------- |
| `tasks`            | `(organization_id, id)`                 | `organization_id`, policy of the kit, enabled and forced |
| `task_assignees`   | `(organization_id, task_id, user_id)`   | `organization_id`, policy of the kit, enabled and forced |
| `task_labels`      | `(organization_id, task_id, label_key)` | `organization_id`, policy of the kit, enabled and forced |
| `checklist_items`  | `(organization_id, id)`                 | `organization_id`, policy of the kit, enabled and forced |
| `activity_entries` | `(organization_id, id)`                 | `organization_id`, policy of the kit, enabled and forced |

Created by `migrations/0003_tasks.sql`, which forces the five policies by hand.

- `tasks.id`, `checklist_items.id` and `activity_entries.id` come from `uuidv7()`. The instants
  that order a page (`created_at`, `occurred_at`, `completed_at`) are `timestamptz(3)`, so that the
  position of a page round-trips exactly through the cursor. The key is stored on the task
  (`key_prefix`, `key_number`, unique per organization): a task keeps its key when it moves or
  when its space changes prefix, and old keys still resolve.
- The children reference `(organization_id, task_id)` of `tasks`, and a subtask references its
  parent by `(organization_id, parent_id)`, so that a row never points at another organization.
  There is no foreign key to `lists` or `spaces`: the strict layout forbids importing their
  schemas, and neither is ever deleted in this version, so `list_id` and `space_id` are kept right
  by the use cases. Nothing is deleted either (no `ON DELETE` action); trash and purge come later.
- CHECK constraints keep what the domain already guarantees: key shape and bounds, the ten status
  and four priority keys, `cancel_reason` set exactly when the status is `cancelled`, `cancel_note`
  only then, `completed_at` set exactly when the status is `done`, a start date only with a due date
  and not after it, estimate 1 to 60,000, and for an activity entry the detail columns of its kind
  and no other. Lengths are not checked, so that a limit can be raised later.
- `task_assignees` and `task_labels` keep the order of the addition in `position`;
  `task_labels.label_key` is the label folded (NFC and lower case), `name` its first spelling.
  `checklist_items` is unique on `(organization_id, task_id, position)`.
- Indexes: `tasks_key_unique` (every route by key); `tasks (organization_id, parent_id,
created_at, id)` (subtasks, counts, the subtree and the ancestors);
  `task_assignees (organization_id, user_id, task_id)` (the unassignment of a removed member,
  which pages by `task_id` so that every batch is one range scan starting where the last one
  ended);
  `activity_entries (organization_id, task_id, occurred_at, id)` and
  `activity_entries (organization_id, list_id, occurred_at, id)` (the two activity routes, their
  counts and the merge candidate). The assignees, labels and checklist are read through their
  primary or unique key prefix. No query plan was taken on representative data yet. PR 3 adds the
  indexes the list queries need.

## API

`openapi/internal/task-service.yaml` (`@cadenway/contracts` 0.9.0), issuer `api-gateway`, actor
`user`, organization required:

| Route                                                                  | Operation                     | Success                   |
| ---------------------------------------------------------------------- | ----------------------------- | ------------------------- |
| `POST /internal/v1/lists/{listId}/tasks`                               | `createTaskInternal`          | `201`, `Location`, `ETag` |
| `GET /internal/v1/lists/{listId}/activity`                             | `listListActivityInternal`    | `200`                     |
| `GET /internal/v1/tasks/{taskKey}`                                     | `getTaskInternal`             | `200`, `ETag`             |
| `PATCH /internal/v1/tasks/{taskKey}`                                   | `updateTaskInternal`          | `200`, `ETag`             |
| `GET /internal/v1/tasks/{taskKey}/detail`                              | `getTaskDetailInternal`       | `200`, `ETag`             |
| `PUT /internal/v1/tasks/{taskKey}/assignees/{userId}`                  | `assignTaskInternal`          | `200`, `ETag`             |
| `DELETE /internal/v1/tasks/{taskKey}/assignees/{userId}`               | `unassignTaskInternal`        | `204`, `ETag`             |
| `POST /internal/v1/tasks/{taskKey}/labels/add`                         | `addTaskLabelInternal`        | `200`, `ETag`             |
| `POST /internal/v1/tasks/{taskKey}/labels/remove`                      | `removeTaskLabelInternal`     | `200`, `ETag`             |
| `GET /internal/v1/tasks/{taskKey}/subtasks`                            | `listSubtasksInternal`        | `200`                     |
| `POST /internal/v1/tasks/{taskKey}/subtasks`                           | `createSubtaskInternal`       | `201`, `Location`, `ETag` |
| `POST /internal/v1/tasks/{taskKey}/checklist-items`                    | `addChecklistItemInternal`    | `201`, `Location`, `ETag` |
| `PATCH /internal/v1/tasks/{taskKey}/checklist-items/{checklistItemId}` | `updateChecklistItemInternal` | `200`, `ETag`             |
| `GET /internal/v1/tasks/{taskKey}/activity`                            | `listTaskActivityInternal`    | `200`                     |

- The task routes and `listSubtasks` name a task by its key, `^[A-Z]{2,5}-[1-9][0-9]{0,8}$`: a
  lower-case or zero-padded key answers `400 request.invalid`.
- The three creations honour `Idempotency-Key` (`@Idempotent()`, applied by `tasks.module.ts`: the
  decorator lives in `@cadenway/nest-common/database`, which the strict layout keeps out of
  `presentation/`). A replay answers the recorded `Location` and `ETag`: the version at creation.
  A request still running with the same key answers `409 idempotency.request-in-progress`; a
  malformed key, `400 request.invalid` with one issue on the `Idempotency-Key` header.
- `If-Match` is optional on every change, except on `PATCH /tasks/{taskKey}` whose body has a
  `description` (even `null`), where its absence answers `400 request.invalid` with one issue
  `{ in: 'header', path: 'If-Match', code: 'invalid_type' }`. `*` satisfies it. A stale one answers
  `412 request.version-mismatch` with `details.version`. The checklist addition declares none.
- The `ETag` of a task body comes from its `version` (the `EtagInterceptor` of the kit); the detail
  and the `204` of the unassignment set it from the version of the task.
- `kind` and `actorId` of the activity routes are comma-separated (`?kind=status,assign`), as the
  gateway forwards them; a repeated parameter is read the same way. An `actorId` that is a UUID is
  lower-cased; any other actor id (`task-service`, an automation) is matched as sent.
- Refusals: `404 task.not-found`, `list.not-found`, `checklist-item.not-found`,
  `organization.not-found`; `412 request.version-mismatch`; `422 task.status-hidden`
  (`details.status`), `task.cancel-reason-required`, `task.cancel-reason-unexpected`,
  `task.assignee-invalid` (`details.userIds`), `task.assignee-limit-reached`,
  `task.label-limit-reached`, `task.checklist-limit-reached`, `task.start-date-invalid`,
  `task.list-invalid`, `task.parent-invalid` (`details.parentKey`), `task.subtask-depth-exceeded`
  and `task.subtask-limit-reached`.
- The task queries by list, group, label or assignee (`GET /internal/v1/lists/{listId}/tasks`, groups, my
  tasks, labels), the overview and the counts are PR 3.

## Events emitted

`task.created.v1`, `task.updated.v1` (with `changed`), `task.status-changed.v1` and
`task.assigned.v1` of `asyncapi/task-service.yaml`, appended to the outbox in the transaction of
the change. Their payload carries neither the description, the checklist nor, outside
`task.status-changed.v1`, the cancel note.

- A creation emits `task.created.v1` for the task, each `task.assigned.v1` of its assignees, then the
  same for each subtask, in body order. The subtask route emits the same for the subtask only.
- A change that changes something emits `task.updated.v1` with the version it produced, then
  `task.status-changed.v1` when the status changed, then `task.assigned.v1` for each person added.
  A move or an attachment emits one `task.updated.v1` per subtask that follows, with its own version.
  A patch that changes nothing writes, records and emits nothing and answers the same version.
- The unassignment of a removed member emits one `task.updated.v1` (`changed: ['assigneeIds']`)
  per task it changes, by the actor `{ type: 'system', id: 'task-service' }`, in the transaction of
  its batch. A batch runs in the span of the clean-up job, child of the delivery of the removal, so
  these rows carry the `traceparent` of that trace when the process traces.
- Note for cadenway-api-contracts, reported to the contract owner: until the clean-up job reaches
  a task, the former member stays in its `assigneeIds`, in the task and in every event the task
  emits meanwhile (a rename, a cancel note). An assignee may briefly be a former member: consumers
  check the membership, and clients show « Ancien membre ».
- A parent emits nothing when a subtask is created, attached or detached: its subtask counts are
  derived.

## Events consumed

None, and no job queue: member-lifecycle consumes `member.removed.v1`, enqueues its clean-up
job and runs `UnassignRemovedMember` from that job, batch after batch. `member.role-changed.v1`
never changes the assignees.

## Invariants

- An actor the copy of the memberships does not hold answers `404 organization.not-found`. What
  the actor does not see (a task whose space is private to another member, a list unknown to them,
  anything for a guest) answers `404` and is left out of every collection.
- A new status that differs from the current one must not be hidden in the space the task is in
  after the change (`422 task.status-hidden`); a task keeps its status when it moves into a space
  that hides it. `cancelled` needs a cancel reason, a cancel reason or note belongs to `cancelled`
  alone (`null` is accepted as "none"); leaving `cancelled` clears both. Entering `done` sets
  `completedAt`, leaving it clears it, and `done` to `done` keeps it. The status of a parent never
  changes its subtasks.
- A start date needs a due date and is not after it. A patch that moves the due date alone moves the
  start by the same number of days; removing the due date removes the start; a shift below the year
  0001 answers `422 task.start-date-invalid`.
- At most 20 assignees, 20 labels, 100 checklist items, 25 direct subtasks and three levels. A new
  assignee is a current member who is not a guest; a person already assigned changes nothing, even
  when they are a guest now. A label is trimmed and compared ignoring case (accents are
  significant); a duplicate changes nothing.
- A task and its subtasks are always in the same list: a new subtask takes its parent's list, a
  moved task takes its subtree, an attached task moves with its subtree to the parent's list, a
  subtask moved to another list leaves its parent first, a detached task keeps its list.
- A task is never deleted or renumbered. A key is never given twice: the number comes from
  `AllocateTaskKeys` in the creation transaction (a creation with `n` subtasks takes `1 + n`
  consecutive numbers, the task first), and the task keeps it when it moves or its space changes
  prefix.
- `version` grows by one per committed change, collections included, and nothing else changes it.
  `updatedAt` follows it.
- The activity log records the creation of each task, every status change (never merged), the
  changes of priority and due date, and every assignment or removal; it does not record name,
  description, labels, estimate, list, parent or checklist. Initial assignees add no `assign` entry.
  A priority or due-date entry merges into the latest entry of the same kind for the task when the
  actor (type and id) and the list are the same and the change comes at most 60 seconds after the
  entry's `occurredAt` (sliding); the entry keeps its first `from`, takes the new `to` and the
  instant of the last change, and is deleted when `from` and `to` are equal again. The task lock
  serializes the merges.
- The activity of a list holds the entries recorded while their task was in it; the entries of a
  task the actor no longer sees are left out of `items` and `total`, and those of a task now in
  another visible list stay.
- The organization and the actor come from the verified token only, lower-cased; an actor id that is
  not a UUID answers `403 auth.actor-not-allowed`.
- A removed member is unassigned from every task they hold, closed ones included, by the clean-up
  job their removal enqueued (member-lifecycle), unless the copy holds them as a member again when
  a batch runs: the job then stops for good and the tasks it had not reached keep them. An
  assignment made after a re-join is never undone by the job of an earlier removal. Until the job
  reaches a task, the task still lists the former member among its assignees; the former member
  sees nothing (the copy answers `404 organization.not-found`) and is not assigned again: a `PUT`
  of the assignee on a task that still lists them answers `200` with the same version and changes
  nothing (a person already assigned), and on any other task `422 task.assignee-invalid`.
- A text holding U+0000, in any member, or a calendar date of the year 0000 in `dueDate` or
  `startDate`, answers `400 request.invalid`: the contract validators accept them, PostgreSQL cannot
  store them. A name, a label or a note that reads `0000-11-03` is only a text.

## Transactions

Every use case runs in one tenant transaction of the organization of the context
(`TenantTasksUnitOfWork`), joined to the one the `Idempotency-Key` interceptor opened for a creation
or to the one the deduplicator opened for the removal of a member: the task, its collections, its
activity entries and their outbox rows commit together, or nothing does. A refusal rolls it back.
The readings of the copy of the memberships, `FindVisibleList`, `ListVisibleSpaceIds` and
`AllocateTaskKeys` join the same transaction. The unit of work wakes the relay once its `run`
resolved when an event was appended (inside a joined transaction, before the outer commit, so the
rows leave at the next poll).

The queries (`GET` routes) run in `runReadOnly`: a read-only transaction, in which a write fails in
the database, and the detail in a read-only `REPEATABLE READ` one, so that the task, its space, its
list, its parent and its subtasks come from one snapshot ("read in one transaction" in the
contract). The operations of the other modules a query calls join it: the kit only refuses a join
that asks for more than the running transaction gives. The other queries read each statement as
committed when it started; the page and the total of a list are two statements.

Lock order, the same for every writer:

1. the memberships `FOR SHARE`: the actor, then the people being assigned;
2. the tasks `FOR NO KEY UPDATE`: the task by key, then, when a patch involves several, the others
   (the new parent, the moving descendants) in one statement in ascending id order;
3. the `space_prefixes` row, last, by `AllocateTaskKeys`, which serializes the creations of a prefix
   until the commit.

A task write does not lock before it knows the actor may see the task: it reads the task without
a lock, checks the visibility of its list, then locks it and reads it again, and checks the
visibility again when the locked task is in another list (a move committed meanwhile). An
attachment does the same for the new parent. A move or an attachment locks the descendants in
ordered statements until the subtree read under the locks holds nothing unlocked, and carries only
the tasks that are still descendants then; a valid subtree has three levels and at most 650
descendants, which bounds the passes, and a larger one is a defect that answers 500. A subtask
created without `assigneeIds` reads the first assignee of the parent and locks that membership
before the parent; no membership is locked once the parent is, so the order cannot deadlock with a
removal. If the parent was reassigned in between, the subtask keeps the account that was read while
it is still one of the parent's assignees, and is created without assignee otherwise (accepted
race). A task write takes no space lock. The removal of a member locks its membership exclusively,
and no space and no task; each task batch of its clean-up job locks up to 500 tasks in ascending
id order in one statement, then reads the copy without lock. A sequential task lock that is not
globally ordered could still meet another writer that holds several: PostgreSQL then aborts one
transaction, and the request answers an error or the batch of the clean-up job is retried. The
412 is checked inside the transaction, after the visibility of the task and before the domain
rules.

Reads (`GET` routes) run in read-only transactions without locks (see above).

A batch of the unassignment of a removed member (`UnassignRemovedMember`) runs in its own tenant
transaction of the organization of the clean-up job: the locking read of up to 500 tasks (a range
scan of `task_assignees_user_index` after `afterTaskId`, without the checklists, which it never
reads), the reading of the copy, the read of the clock, the loads of the assignees, the labels and
the parent keys, one delete of the assignee rows, one update of the versions and one insert of the
activity entries, that is nine statements (eight when no task has a parent); each task also costs
one outbox append, two round trips, and the statements run under the 10 s statement timeout and
the 5 s lock timeout of the application role. A task is rewritten only when the domain changed it.
A request that writes a task a batch has locked waits for it at most its 5 s `lock_timeout`, then
answers 500 (SQLSTATE 55P03); a batch holds its locks for one transaction only. A failed batch
rolls back alone; the batches before it stay committed. The loop, the stop on an empty batch, the
retries, the dead letters and what an operator does about them belong to the clean-up job of
member-lifecycle (its MODULE.md).

## Decisions

- Activity lives in this module: a separate module would depend on tasks (to record in the
  transaction of the change) and tasks on it (key, current space and name of the task), a cycle. So
  do labels and the checklist.
- The role of the viewer is read from the copy of the memberships in the same transaction and
  passed to the spaces operations (`viewerRole`); it never comes from the token.
- `PATCH /tasks/{taskKey}` requires `If-Match` whenever the body names `description`, also with
  `null` or the value the task has, and `*` satisfies it (open questions 5 and 16 of the design:
  the description is stored as sent).
- A subtask created without `assigneeIds` inherits the first assignee of
  its parent, and is created unassigned when that person is no longer an eligible member.
- The coalescing window is sliding and compares with the latest entry of the same kind whoever wrote
  it, so a change by another actor breaks the chain; an entry written with a move in the same patch
  records the list after the patch. A cursor walked across a merge may skip or repeat the merged
  entry, whose position moved.
- No lock on the space in a task write: a status hidden, a prefix changed or a space made private
  concurrently with a write is accepted (the key stays unique and under a prefix of the space).
- `PUT /assignees/{userId}` has a body, the empty object of the contract (`AssignTaskBody`): it is
  validated, so a missing body or an array answers `400`, and not read. The generated schema is not
  strict, so the members of an object body are dropped; making it strict is a change of the
  contract.
- The activity instant and `updatedAt` are the instant the transaction started (`now()`), taken
  once per run. A writer that waits for a lock keeps the instant it started with, so two changes of
  one task can commit in the reverse order of their instants; the version still orders them. This is
  accepted, and the 60-second coalescing compares the same instants.
- The `total` of the activity of a list counts every matching entry of the list, joined with the
  tasks to leave out those of a space the actor does not see, on each page. It is left as it is
  until it is measured on representative data; a total carried by the first page, or a capped
  count, are the options.
- A `PATCH` that names `description` without `If-Match` answers `400` before the `404` of a task
  that does not exist: the header is validated at the boundary.
- The unassignment of a removed member is a batch operation called by the clean-up job of
  member-lifecycle (decision of the coordinating session for PR 2 of P3a, revised again in PR 2:
  the job orchestrates the spaces and the tasks, so it belongs to the orchestrator). The removal,
  like the revocation of PR 1, never waits for cleanup, and its cost does not grow with the
  assignments of the member. The first version of PR 2 unassigned inline in that transaction, in
  batches of 500, which bounded a removal by the 25 s handler budget of the kit; the second one
  owned the job in this module.
- The job, not the removal, decides: each batch reads the copy after locking, so a re-join followed
  by a new assignment is never undone, and the old assignments left by that stop stay with the
  person who came back.
- Batches of 500 tasks, each in its own transaction: a failure costs one batch, and a request waits
  for one batch at most. The job loops within its attempt rather than enqueuing a continuation: the
  remaining assignments in `task_assignees` are the cursor, so a retry resumes from `null` without
  carrying state.
- `tests/tasks.int-spec.ts` is the integration test of the routes, the rules, idempotency, row-level
  security and the removal of a member on real PostgreSQL, NATS and pg-boss: the removal commits
  with its clean-up job, the job empties 1,200 assignments in three batches, a redelivered removal
  enqueues nothing, a re-join stops the job and keeps the private space and the tasks, a lock
  timeout in a batch retries only that batch, a removal in upper case commits at once and its job
  writes lower-case events, the rows of the job carry the trace of the removal, and the dead-letter
  SQL of the member-lifecycle MODULE.md reads, replays and deletes a dead letter. The dead letter
  itself is seeded by SQL there: provoking it takes the whole retry schedule, about an hour.
