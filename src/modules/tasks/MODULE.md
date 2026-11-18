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
  which the clean-up job of member-lifecycle runs after the removal;
- the seven queries the product screens read: the tasks of a list with filters and sorts, the
  counts of its groups, the counters of a list, the overview of a space, the labels, "Mes tâches"
  and "Accueil". They live here, not in a module of their own, because they read the tables of
  this module (see Decisions).

It decides who sees a task: whoever sees the space of its list, with the visibility rules of the
spaces module, from the copy of the memberships of the organization-members module, never from the
`role` claim of the internal token. It does not own spaces, lists or the numbers of the task keys
(spaces hands them out), the memberships (organization-members), the documents, the attachments or
the automation rules (other services). The lists, sprints and spaces the queries show come from
five public entries of the spaces module (`FindVisibleList`, `ListVisibleSpaceIds`,
`FindVisibleSpaceLists`, `ListCurrentSprints`, `ListSidebarLists`), which join the transaction of
the query.

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

Created by `migrations/0003_tasks.sql`, which forces the five policies by hand;
`migrations/0004_task_queries.sql` adds the two indexes below, as plain `CREATE INDEX` (see Decisions).

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
  primary or unique key prefix.
- `tasks (organization_id, list_id, created_at, id)` (`tasks_list_created_index`): every statement
  on the tasks of one list (page, total, groups, counters) is a range of the list, and the pages in
  creation order (`manual`, `createdAt`, both directions) are an ordered scan that stops at the
  limit. Plans taken as `task_app` on 75,000+ tasks (PostgreSQL 18; 98 top-level tasks and 150
  subtasks in Sprint 14, a list of 20,000 top-level tasks and 5,000 subtasks, 25,000 tasks in a
  sibling list and 25,000 in another organization): Sprint 14 page, total, groups and counters read
  7 to 15 blocks of the 2,375 of `tasks` in 0.1 to 0.3 ms (without the index: a Seq Scan, 2,375
  blocks, 3 to 5 ms); on the large list the first page in creation order reads 105 blocks in 0.1 ms
  (6 blocks for `-manual`) against a Seq Scan of 15 ms. The other sorts read the whole range of the
  list (a bitmap scan, 1,086 blocks) and keep the top rows in memory: 21 to 28 ms for `dueDate` and
  `priority`, 66 ms for `name` (99 ms for its second page: the name is folded for each row). The
  large list is 27 % of the table, so the total, groups and counters of it cost about what a Seq Scan
  costs (4 to 11 ms).
- `task_labels (organization_id, label_key, task_id)` (`task_labels_key_index`): the label filter and
  the labels. Kept because plans use it, with a small gain at this size: the label total of the large
  list is a bitmap scan of the key, 11.8 ms against 14.0 ms for a Seq Scan of `task_labels` without
  it; in creation order the primary key serves the nested loop as well (1.0 ms with, 0.7 ms
  without). The labels route does not use it: it reads the label rows of the visible tasks (a Seq
  Scan, 3,513 blocks, 35 to 45 ms).
- Not indexed, on purpose: `search` (a fold of the name, key and labels of one list, 38 to 96 ms for
  20,000 tasks; an index would need `pg_trgm`), the `dueDate`, `priority` and `name` sorts (the
  total is already O(list)), "Mes tâches" and "Accueil" (the hash join of the assignments of the
  caller with their tasks, 17 to 44 ms for a person assigned to 10,006 of the 75,000 tasks;
  `task_assignees_user_index` serves the assignment side) and the counters of lists that are most of
  the table (a Seq Scan, 24 ms, for a space of 45,000 tasks; the counters of the lists of a small
  space are a range, 15 blocks). If counters outgrow their budget, add `INCLUDE (parent_id, status,
due_date)` to the list index for index-only counts; status changes then stop being HOT updates.

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
| `GET /internal/v1/lists/{listId}/tasks`                                | `listTasksInternal`           | `200`                     |
| `GET /internal/v1/lists/{listId}/task-groups`                          | `countTaskGroupsInternal`     | `200`                     |
| `GET /internal/v1/lists/{listId}/counts`                               | `getListCountsInternal`       | `200`                     |
| `GET /internal/v1/spaces/{spaceId}/overview`                           | `getSpaceOverviewInternal`    | `200`                     |
| `GET /internal/v1/labels`                                              | `listLabelsInternal`          | `200`                     |
| `GET /internal/v1/users/{userId}/tasks`                                | `listMyTasksInternal`         | `200`                     |
| `GET /internal/v1/users/{userId}/home`                                 | `getHomeInternal`             | `200`                     |

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
- Refusals: `404 task.not-found`, `list.not-found`, `space.not-found` (the overview),
  `user.not-found` (the two `users` routes, when `userId` is not the actor, checked before the
  membership), `checklist-item.not-found`, `organization.not-found`; `412 request.version-mismatch`; `422 task.status-hidden`
  (`details.status`), `task.cancel-reason-required`, `task.cancel-reason-unexpected`,
  `task.assignee-invalid` (`details.userIds`), `task.assignee-limit-reached`,
  `task.label-limit-reached`, `task.checklist-limit-reached`, `task.start-date-invalid`,
  `task.list-invalid`, `task.parent-invalid` (`details.parentKey`), `task.subtask-depth-exceeded`
  and `task.subtask-limit-reached`.
- The seven queries answer `200` without an `ETag`. `limit` is 1 to 100 (50 by default), `cursor` is
  the `nextCursor` of a page of the same collection with the same filters, sort, list, space or
  account, at most 2,048 characters: any other answers `400 request.invalid` with one issue
  `{ in: 'query', path: 'cursor', code: 'invalid_cursor' }`. `status`, `priority`, `assignee` and
  `label` are comma-separated or repeated; ids are read in either case. A parameter the route does not
  declare, and a date of the year 0000 in `today`, `dueFrom` or `dueTo`, answer `400`.

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
- Visibility of the queries: a list or a space the actor does not see answers `404`; the cross-list
  routes (labels, "Mes tâches", "Accueil") read the tasks of the spaces the actor sees only. A guest
  sees nothing: the list and space routes answer `404`, labels and "Mes tâches" an empty page with
  zero counts, "Accueil" zeros and empty lists. An account that is not the actor never reads
  another's tasks or home.
- Filters of a list (tasks and groups): values of one filter add up, filters narrow each other.
  `assignee` takes account ids, `me` (the actor) and `none` (nobody assigned); `label` compares the
  label key (trimmed, form C, lower case), so case is ignored and accents are significant; `search`
  looks in the name, the key and the labels, ignoring case and accents, the text as sent, with no
  wildcard; `dueFrom` and `dueTo` are inclusive and leave out the undated, `dueFrom` after `dueTo`
  gives an empty result; `level` `roots` (default) keeps the top-level tasks, `all` adds the
  subtasks as tasks, for the page, the `total` and the groups alike. `total` counts the matching
  tasks on every page.
- Sorts: `manual` is `createdAt`, the order of creation (no position is stored yet); `dueDate` puts
  the undated last in both directions; `priority` goes from `urgente` to `basse`; `name` ignores case
  and accents. The order of the list (`created_at`, `id`) breaks every tie. A leading `-` reverses the
  key only: ties stay in ascending list order, except `-manual` and `-createdAt`, which reverse the
  whole order.
- Groups: `status` and `priority` list every key in the order of the contract, zeros included;
  `assignee` lists the accounts assigned to at least one matching task by descending count then
  account, then `none`, always last and present even at 0. A task with several assignees counts in
  each group; `total` counts each task once.
- Counters (`TaskCounts`, the overview, "Accueil" lists and sprints) count top-level tasks only:
  `total`, `open` (not `done` or `cancelled`), `done` (« Terminées »), `cancelled` and `late` (open
  and due strictly before the `today` of the caller, which the service does not know). The overview
  gives `listCount` and `taskCount` of the whole space on every page; "Mes tâches" and the stats of
  "Accueil" count the tasks assigned to the actor, subtasks included, with the counts of both tabs
  on every page; "Accueil" lists the 7 next open tasks, the current sprints (start and end
  inclusive, at most 10, by end date then creation) and the first 6 lists in the order of the
  sidebar (spaces then lists, by creation), sprints included.
- Labels: one per label key, whatever the case, in the order of the folded key; the spelling is the
  first in code point order among the visible tasks, so a private space leaks none.

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

Reads (`GET` routes) run in read-only transactions without locks (see above). The tasks of a list,
the groups, the counters of a list, the labels and "Mes tâches" read each statement as committed
when it started (the page and the total of a list are two statements); the overview and "Accueil"
run on one snapshot (`REPEATABLE READ`), so that their counters agree with each other. The
statements of a route do not depend on the page size or on the size of the organization: the tasks
of a list 6 to 11 (the summaries are skipped for an empty page), the groups 5 or 6, the counters of
a list 5, the overview 4, the labels 3, "Mes tâches" 9, "Accueil" 12 (control statements of the
transaction not counted).

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
- The seven queries live in this module: a separate module cannot import the task tables (the strict
  layout forbids the import of another module's schemas), every route must call a use case of its
  own module, and the overview, the counters and "Accueil" need the tasks of the lists that spaces
  hands over, which adds no cycle (tasks already depends on spaces; spaces never depends on tasks).
  Decision of the coordinating session for PR 3 of P3a.
- "Without regard to case or accents" is one SQL expression used on both sides of every
  comparison: `regexp_replace(normalize(casefold(x COLLATE "pg_unicode_fast"), NFKD), <combining
marks>, '', 'g')`. It needs PostgreSQL 18 (`casefold`, `pg_unicode_fast`) and a UTF8 database, and
  no extension; `strpos` avoids escaping `LIKE` wildcards.
- The cursor of `name` carries the first 128 code points of the folded name (the kit refuses a cursor
  over 2,048 characters and a name has up to 300). Two names equal on 128 folded code points fall
  back to the order of the list.
- The cursor of the groups is `sort = [count]`, `id = value` for the three groupings; the groups
  are all computed on each request (bounded by the statuses, priorities or assignees of one list)
  and sliced in memory, as the overview slices its lists.
- Reversed sorts keep ties in ascending list order, `none` is always present, assignee ties go by
  account, and `dueFrom` after `dueTo` gives an empty result: the contract leaves these open.
- A label that contains a comma cannot be a `label` filter (comma-separated by the contract): to
  report to the contract owner.
- The two indexes are plain `CREATE INDEX`: the Drizzle migrator runs all migrations in one
  transaction, which forbids `CONCURRENTLY`. The tables are small in P3a (the build takes about a
  second on 75,000 tasks); a large production table would need a separate concurrent step in
  `src/migrate.ts`. Rollback: `DROP INDEX IF EXISTS tasks_list_created_index,
task_labels_key_index;`, which the previous release does not need.
- `tests/task-queries.int-spec.ts` is the integration test of the queries on real PostgreSQL and
  NATS: every route against its generated response validator and a reference model of the filters,
  sorts, groups and counters written in the spec, the exact counters of Sprint 14 of the contract
  (98, 72, 24, 2, 3 on 2026-11-08), visibility, guests, isolation of the organizations as `task_app`,
  the 400 cases, the statements per route and the plans above (no Seq Scan of `tasks` for Sprint 14
  pages, totals and groups, under 2 % of its blocks), and the median of five calls per route against
  generous bounds (300 ms at the size of Sprint 14, 2,000 ms on the large list).
- `tests/tasks.int-spec.ts` is the integration test of the routes, the rules, idempotency, row-level
  security and the removal of a member on real PostgreSQL, NATS and pg-boss: the removal commits
  with its clean-up job, the job empties 1,200 assignments in three batches, a redelivered removal
  enqueues nothing, a re-join stops the job and keeps the private space and the tasks, a lock
  timeout in a batch retries only that batch, a removal in upper case commits at once and its job
  writes lower-case events, the rows of the job carry the trace of the removal, and the dead-letter
  SQL of the member-lifecycle MODULE.md reads, replays and deletes a dead letter. The dead letter
  itself is seeded by SQL there: provoking it takes the whole retry schedule, about an hour.
