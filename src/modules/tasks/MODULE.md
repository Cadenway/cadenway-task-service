# Tasks

## Purpose

The tasks of each organization (P3a, "Tâches") and what hangs from a task:

- a task: key, name, description, status (ten keys, with a cancel reason and note), priority, due
  and start dates, estimate, list and space, parent;
- its subtasks (three levels at most), its assignees, its labels and its checklist, which share the
  `version` of the task;
- the activity log of the tasks (creation, status, priority, due date, assignment), read by task
  and by list.

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

`TasksModule` exports the `UnassignRemovedMember` provider (`{ organizationId, userId }` to
`{ unassigned }`). member-lifecycle calls it on `member.removed.v1`, after the copy of the
memberships and the handover of the private spaces, in the tenant transaction of the event, which
it joins. It does nothing while the copy still holds the account as a member under another
membership.

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
  `task_assignees (organization_id, user_id)` (the unassignment of a removed member);
  `activity_entries (organization_id, task_id, occurred_at, id)` and
  `activity_entries (organization_id, list_id, occurred_at, id)` (the two activity routes, their
  counts and the merge candidate). The assignees, labels and checklist are read through their
  primary or unique key prefix. No query plan was taken on representative data yet. PR 3 adds the
  indexes the list queries need.

## API

`openapi/internal/task-service.yaml` (`@cadenway/contracts` 0.9.0), issuer `api-gateway`, actor
`user`, organization required:

| Route                                                         | Operation                     | Success                   |
| ------------------------------------------------------------- | ----------------------------- | ------------------------- |
| `POST /internal/v1/lists/{listId}/tasks`                      | `createTaskInternal`          | `201`, `Location`, `ETag` |
| `GET /internal/v1/lists/{listId}/activity`                    | `listListActivityInternal`    | `200`                     |
| `GET /internal/v1/tasks/{taskKey}`                            | `getTaskInternal`             | `200`, `ETag`             |
| `PATCH /internal/v1/tasks/{taskKey}`                          | `updateTaskInternal`          | `200`, `ETag`             |
| `GET /internal/v1/tasks/{taskKey}/detail`                     | `getTaskDetailInternal`       | `200`, `ETag`             |
| `PUT /internal/v1/tasks/{taskKey}/assignees/{userId}`         | `assignTaskInternal`          | `200`, `ETag`             |
| `DELETE /internal/v1/tasks/{taskKey}/assignees/{userId}`      | `unassignTaskInternal`        | `204`, `ETag`             |
| `POST /internal/v1/tasks/{taskKey}/labels/add`                | `addTaskLabelInternal`        | `200`, `ETag`             |
| `POST /internal/v1/tasks/{taskKey}/labels/remove`             | `removeTaskLabelInternal`     | `200`, `ETag`             |
| `GET /internal/v1/tasks/{taskKey}/subtasks`                   | `listSubtasksInternal`        | `200`                     |
| `POST /internal/v1/tasks/{taskKey}/subtasks`                  | `createSubtaskInternal`       | `201`, `Location`, `ETag` |
| `POST /internal/v1/tasks/{taskKey}/checklist-items`           | `addChecklistItemInternal`    | `201`, `Location`, `ETag` |
| `PATCH /internal/v1/tasks/{taskKey}/checklist-items/{itemId}` | `updateChecklistItemInternal` | `200`, `ETag`             |
| `GET /internal/v1/tasks/{taskKey}/activity`                   | `listTaskActivityInternal`    | `200`                     |

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
- The removal of a member emits one `task.updated.v1` (`changed: ['assigneeIds']`) per task, by the
  actor `{ type: 'system', id: 'task-service' }`.
- A parent emits nothing when a subtask is created, attached or detached: its subtask counts are
  derived.

## Events consumed

None directly: member-lifecycle consumes `member.removed.v1` and calls `UnassignRemovedMember` in
the same tenant transaction. `member.role-changed.v1` never changes the assignees.

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
- A text holding U+0000, or a calendar date of the year 0000, answers `400 request.invalid`: the
  contract validators accept them, PostgreSQL cannot store them.

## Transactions

Every use case runs in one tenant transaction of the organization of the context
(`TenantTasksUnitOfWork`), joined to the one the `Idempotency-Key` interceptor opened for a creation
or to the one the deduplicator opened for the removal of a member: the task, its collections, its
activity entries and their outbox rows commit together, or nothing does. A refusal rolls it back.
The readings of the copy of the memberships, `FindVisibleList`, `ListVisibleSpaceIds` and
`AllocateTaskKeys` join the same transaction. The unit of work wakes the relay once its `run`
resolved when an event was appended (inside a joined transaction, before the outer commit, so the
rows leave at the next poll).

Lock order, the same for every writer:

1. the memberships `FOR SHARE`: the actor, then the people being assigned;
2. the tasks `FOR NO KEY UPDATE`: the task by key, then, when a patch involves several, the others
   (the new parent, the moving descendants) in one statement in ascending id order;
3. the `space_prefixes` row, last, by `AllocateTaskKeys`, which serializes the creations of a prefix
   until the commit.

A task write takes no space lock. The removal of a member locks its membership exclusively, then the
private spaces, then the tasks in ascending id order in batches of 500. A sequential task lock that
is not globally ordered could still meet another writer that holds several: PostgreSQL then aborts
one transaction, the request answers an error and a removal is redelivered. The 412 is checked
inside the transaction, after the visibility of the task and before the domain rules.

Reads (`GET` routes) run in the same unit of work without locks; the detail reads the task, its
space, its list, its parent and its subtasks in one transaction.

`UnassignRemovedMember` runs inside the existing `task-service__project-member-removed` consumer:
no consumer or grant is added. A transient failure (the database, the lock timeout of 5 s or the
statement timeout of 10 s) rolls the copy, the handover and the unassignments back together, and
the event is redelivered; after a commit a redelivery is skipped by `processed_events`. The whole
delivery must finish within the 25 s `handlerTimeoutMs` of the kit, under the 30 s ack wait.

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
- `PUT /assignees/{userId}` reads no body: the contract body is the empty object, with nothing to
  validate or keep.
- The unassignment of a removed member is bounded by the 25 s of the handler: three set-based
  statements per batch of 500 tasks and one outbox insert per task, with no cap. A member assigned to
  more tasks than the delivery can finish would make every delivery time out and the removal never
  commit. The rate has not been measured on this code yet; the integration test of the change records
  it. The remedy, once `@cadenway/nest-jobs` is wired, is to commit the removal with the first
  unassignments and enqueue the rest as a job in the same transaction.
- `tests/tasks.int-spec.ts` is the integration test of the routes, the rules, idempotency, row-level
  security and the removal of a member on real PostgreSQL and NATS; the change that follows this one
  writes it.
