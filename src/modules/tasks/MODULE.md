# Tasks

## Purpose

The tasks of each organization (P3a, "Tâches") and what hangs from a task:

- a task: key, name, description, status (ten keys, with a cancel reason and note), priority, due
  and start dates, estimate, list and space, parent;
- its subtasks (three levels at most), its assignees, its labels and its checklist, which share the
  `version` of the task;
- directed dependencies between tasks in the same organization, including across spaces;
- the activity log of the tasks (creation, status, priority, due date, assignment), read by task
  and by list;
- sprint burndown and velocity, workload, timesheets, team dashboards and the task rows for CSV
  exports;
- the unassignment of a member who left the organization from their tasks, one batch per call,
  which the clean-up job of member-lifecycle runs after the removal;
- the seven queries the product screens read: the tasks of a list with filters and sorts, the
  counts of its groups, the counters of a list, the overview of a space, the labels, "Mes tâches"
  and "Accueil". They live here, not in a module of their own, because they read the tables of
  this module (see Decisions);
- the access check of a task for the realtime gateway, and the reading of tasks by key or id for
  the access requests of the access-requests module;
- the attachment access decision for the API gateway, based on the current membership, task
  placement, list role and archive state in one read-only snapshot;
- the archives of the tasks (P3b-1, "Tasks" of `openapi/public/archives.yaml`): the archive of a
  task with its live subtasks, the restoration of a whole archive, and the page "Archives" (its
  tabs "Listes" and "Tâches"), served here because both need the task tables;
- the trash (P3b-1 PR 3, `openapi/public/trash.yaml`): the deletion of a task with its subtasks at
  every level, archived ones included, as one trash entry, the page "Corbeille", the restoration
  and the erasure of an entry,
  "Vider la corbeille", and the batches the deletion-lifecycle jobs run: the move to the trash of
  the tasks of a deleted list, the purge of the entries due or handed over, and the organizations
  with entries to purge.

It applies the effective role of the actor on the list of a task (P3b-1, "Who sees a task" of
`openapi/public/tasks.yaml`): any role (`view`, `comment`, `edit`) reads the task, `edit` changes
it. The role is computed by the spaces module (owner of the space, rule of the organization and
the switch of the list, grants of the space and of the list), from the copy of the memberships of
the organization-members module, never from the `role` claim of the internal token. It does not
own spaces, lists, grants or the numbers of the task keys (spaces hands them out), the memberships
(organization-members), the access requests (access-requests), the documents, the attachments or
the automation rules (other services). The lists, sprints and spaces the queries show, with the
role of the actor on them, come from the public entries of the spaces module (`FindVisibleList`,
`ListVisibleListIds`, `FindVisibleSpaceLists`, `ListCurrentSprints`, `ListSidebarLists`,
`FindVisibleLists`, `ListArchivedLists`), which join the transaction of the query; the
restoration of a task restores its archived list through `RestoreArchivedList`, in the transaction
of the restoration. The trash reads the lists through `ListTrashLists` and `FindTrashList` (the
role as if the list and its space were not deleted, every role: the module keeps the lists on
which its own `canWriteTasksOf` accepts it), holds a list with `HoldList`, locks a deleted list
with `LockDeletedList` (a restoration and the deletion job decide under it), locks the lists of
trash entries, live or deleted, with `LockTrashLists` (an erasure and "Vider la corbeille" decide
under it, the role read again there), brings a deleted list and
space back with `RestoreDeletedList` and erases a tombstone with `PurgeDeletedList`. Spaces owns
the archive and the deletion of a list; this module never writes a list.

## Public entry points

| Entry point                                           | Consumers                                                                                                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tasks.module`                                        | access-requests, deletion-lifecycle, goals, intake, member-lifecycle, onboarding, task-approvals, task-comments, task-templates, notification-visibility |
| `public/goal/measure-goal-targets`                    | goals                                                                                                                                                    |
| `public/onboarding/create-onboarding-example`         | onboarding                                                                                                                                               |
| `public/approval/change-task-approval`                | task-approvals                                                                                                                                           |
| `public/approval/read-task-approval`                  | task-approvals                                                                                                                                           |
| `public/assignee/unassign-removed-member`             | member-lifecycle                                                                                                                                         |
| `public/watcher/remove-member-watcher-overrides`      | member-lifecycle                                                                                                                                         |
| `public/task/record-comment-activity`                 | task-comments                                                                                                                                            |
| `public/task/begin-comment`                           | task-comments                                                                                                                                            |
| `public/task/resolve-comment-task`                    | task-comments                                                                                                                                            |
| `public/task/find-task-reference`                     | access-requests                                                                                                                                          |
| `public/task/find-task-references`                    | access-requests                                                                                                                                          |
| `public/task/find-visible-task-locations`             | notification-visibility                                                                                                                                  |
| `public/trash/trash-deleted-list-tasks`               | deletion-lifecycle                                                                                                                                       |
| `public/trash/purge-trash-batch`                      | deletion-lifecycle                                                                                                                                       |
| `public/trash/list-organizations-with-trash-to-purge` | deletion-lifecycle                                                                                                                                       |
| `public/trash/list-untrashed-task-ids`                | deletion-lifecycle                                                                                                                                       |
| `public/task/read-task-template-source`               | task-templates                                                                                                                                           |
| `public/intake/create-intake-task`                    | intake                                                                                                                                                   |
| `public/intake/resolve-intake-contact-task`           | intake                                                                                                                                                   |

`MeasureGoalTargets` projects readable list progress and milestone completion in the goal
transaction. It uses current list visibility, including readable archives, and skips deleted
targets. A goal write can hold the linked placements and milestone rows until commit.

`BeginComment` and `RecordCommentActivity` are exported to task-comments for an authorized task
version advance and comment activity creation, excerpt update or removal inside the caller's transaction.
For comment writes, `BeginComment` locks supplied recipient memberships after the actor, then the task,
and holds its space and list before recipient access is checked; access revocations wait for commit. `ResolveCommentTask`
checks reply-author visibility without taking membership locks after the task lock.

`ResolveCommentTask` is exported to task-comments. It checks task visibility and resolves the
internal task ID in the read transaction of the caller, without exposing an inaccessible task.

`CreateOnboardingExample` creates one preset example with the ordinary task policies and outbox,
joining the provisioning transaction. Normal task creation updates the verified actor's first-task
checklist marker in that transaction. Examples, subtasks, copies and recurrence do not advance it.

`ReadTaskApproval` exposes an authorized task and eligible reviewers within one task snapshot.
`ChangeTaskApproval` holds reviewed memberships, the task and its placement, checks the task
version and uses the ordinary status, recurrence and watcher policies. It calls the approval
module's decision and finalization inside the same transaction as the task write and outbox.

`TasksModule` exports the `FindTaskReference` and `FindTaskReferences` providers, which the
access-requests module reads the task of a request with: `{ organizationId, taskKey }` to a
`TaskLocation` (`{ id, key, name, status, listId, spaceId }`) or `null` for an unknown or malformed
key, and `{ organizationId, taskIds }` (100 ids at most, more is a defect that throws) to
`{ tasks }`, unknown ids and ids that are not UUIDs left out, in no particular order. A task in the
trash is not found by either (`null`, left out), so the requests of its tasks are hidden at once.
Neither checks any visibility: the caller decides what the actor may learn. Both join the transaction of the
caller (`TasksUnitOfWork.run`, read-only or not), read one statement without the collections of
the task, take no lock and write nothing. `FindTaskReference` also takes
`lock: 'none' | 'share-unless-locked'` (`none` by default): with `share-unless-locked`, the
caller's transaction must be able to lock, and the task of the key is locked
`FOR SHARE SKIP LOCKED` until its commit, in the same statement whatever the outcome (unknown, in
the trash or found; a task in the trash is still `null`), so a deletion of the task ("Supprimer la
tâche" or a deletion batch, `FOR NO KEY UPDATE`) either committed first and the request finds
nothing, or starts after and waits for the request, whose clean-up then drops it; a task a writer
holds at that instant answers `null` at once, without waiting, so the time of the answer tells
nothing of a task the caller may not see. A malformed key reads nothing in either mode.

`TasksModule` also exports the `UnassignRemovedMember` provider
(`{ organizationId, userId, afterTaskId }` to `{ outcome: 'none-left' }`,
`{ outcome: 'member-again' }` or `{ outcome: 'unassigned', locked, unassigned, lastTaskId }`): one batch of the removal of a former
member from their tasks, in a tenant transaction of its own of the organization of the context.
The clean-up job of member-lifecycle calls it once the private spaces of the former member were
handed over, from `afterTaskId: null`, then after each `lastTaskId`, until `none-left` or
`member-again`.

`RemoveMemberWatcherOverrides` takes the same organization, account and task-id cursor. One
tenant transaction locks up to 500 tasks with an explicit override for the account, in task-id
order, including archived and trashed tasks. It reads membership after the locks, returns
`member-again` if the account rejoined, or deletes that account's overrides. The next batch
starts after the last locked task. The task and its version stay unchanged and cleanup emits no
event: the membership copy already removes the former member from the effective audience.

`TasksModule` exports the three batches of the deletion-lifecycle jobs; the first two join the
tenant transaction of their caller (`TasksUnitOfWork.run`) or open their own:

- `TrashDeletedListTasks` (`{ organizationId, listId, after }` to `{ outcome: 'list-live' }`,
  `{ outcome: 'list-gone' }`, `{ outcome: 'rescan' }`,
  `{ outcome: 'none-left', listPurged, spacePurged }` or
  `{ outcome: 'trashed', entries, taskIds, last }`): one batch of the move of the tasks of a
  deleted list to the trash, from `after: null`, then after each `last`, until `list-live` (a list
  restored after its job), `list-gone` (an unknown or erased list) or `none-left`; on `rescan`
  (no root after the position while the list still holds tasks out of the trash) the caller starts
  the list again from `after: null`; `taskIds` (1,150 live tasks at most, plus the archived
  subtasks under them, which the product does not limit) are for the requests the caller drops in
  the same transaction.
- `PurgeTrashBatch` (`{ organizationId }` to `{ outcome: 'none-left' }` or
  `{ outcome: 'purged', entries, tasks, listsPurged, spacesPurged }`): one batch of the purge,
  999 tasks at most, or a part of 500 tasks of an entry too large for one batch (`entries: 0`).
- `ListOrganizationsWithTrashToPurge` (`{ after, limit }`, 1 to 1,000, to
  `{ organizationIds }`): the organizations holding an entry due or handed over, by id; the only
  cross-organization read of the module, in a read-only system transaction of its own
  (`SystemTransactionRunner`), never joined to a tenant one, ids only.

`TasksModule` also exports `ListUntrashedTaskIds` (`{ organizationId, taskIds }`, 2,000 ids at
most, more is a defect that throws, to `{ taskIds }`): those of the ids that are tasks out of the
trash, live or archived, by id, ids that are not UUIDs left out. The deletion-lifecycle job of
`task.drop-trashed-task-requests` drops the pending requests of the other ids only, in the same
transaction, so a task restored before the job keeps its requests and an erased one loses them.
It is a locking read: it joins the transaction of its caller (`TasksUnitOfWork.run`, a
transaction that may lock), locks the tasks of the ids `FOR SHARE` in one statement ordered by id
(in the trash or not) and answers those out of the trash as read under the lock; it writes
nothing. A restoration locks its tasks `FOR NO KEY UPDATE` and an erasure `FOR UPDATE`, so either
committed before the lock and is seen, or waits for the commit of the job: the requests dropped
are those of tasks still in the trash or gone when the job commits. Lock order: the tasks, then
the access requests its caller deletes.

The module enqueues two jobs, in the transaction of the change, and owns no worker:
`task.drop-trashed-task-requests` (`{ taskIds, traceparent? }`, occurrence key `entry:<entryId>`)
from a deletion, `task.purge-trash` (`{ traceparent? }`, no key) from "Vider la corbeille".

## Owned tables

| Table                      | Key                                     | Organization scoping                                     |
| -------------------------- | --------------------------------------- | -------------------------------------------------------- |
| `tasks`                    | `(organization_id, id)`                 | `organization_id`, policy of the kit, enabled and forced |
| `task_assignees`           | `(organization_id, task_id, user_id)`   | `organization_id`, policy of the kit, enabled and forced |
| `task_labels`              | `(organization_id, task_id, label_key)` | `organization_id`, policy of the kit, enabled and forced |
| `checklist_items`          | `(organization_id, id)`                 | `organization_id`, policy of the kit, enabled and forced |
| `activity_entries`         | `(organization_id, id)`                 | `organization_id`, policy of the kit, enabled and forced |
| `task_time_entries`        | `(organization_id, id)`                 | `organization_id`, policy of the kit, enabled and forced |
| `space_custom_fields`      | `(organization_id, id)`                 | `organization_id`, policy of the kit, enabled and forced |
| `task_custom_field_values` | `(organization_id, task_id, field_id)`  | `organization_id`, policy of the kit, enabled and forced |
| `task_dependencies`        | `(organization_id, id)`                 | `organization_id`, policy of the kit, enabled and forced |
| `trash_entries`            | `(organization_id, id)`                 | `organization_id`, policy of the kit, enabled and forced |
| `task_watcher_overrides`   | `(organization_id, task_id, user_id)`   | `organization_id`, policy of the kit, enabled and forced |
| `sprint_task_history`      | `(organization_id, sequence)`           | `organization_id`, policy of the kit, enabled and forced |
| `sprint_field_history`     | `(organization_id, sequence)`           | `organization_id`, policy of the kit, enabled and forced |
| `sprint_value_history`     | `(organization_id, sequence)`           | `organization_id`, policy of the kit, enabled and forced |
| `sprint_history_coverage`  | `singleton`                             | Instance-wide history rollout marker                     |

Sprint history records task state, point-field designation and point values as separate facts.
Physical task or field removal cascades to the respective facts. The coverage marker records
when the history triggers were installed.

Created by `migrations/0003_tasks.sql`, which forces the five policies by hand;
`migrations/0004_task_queries.sql` adds the two indexes below, as plain `CREATE INDEX` (see Decisions);
`migrations/0006_archives.sql` adds the archive of a task (expand only: every existing task stays
live); `migrations/0007_trash.sql` adds the trash (expand only: every existing task stays out of
it). The collaboration migration adds the watcher override table.

- `task_dependencies`: one oriented blocker-to-blocked pair per organization. Both endpoint
  foreign keys include the organization and cascade on physical purge. Indexes starting with
  each endpoint within the organization support directed traversal and incident paging.
- `task_watcher_overrides`: one explicit follow or unfollow per account and task; the task foreign key
  cascades on purge, and the tenant-first user index supports member cleanup. The watcher policy
  combines the human creator and active assignees with up to 100 explicit overrides. A candidate
  counts only while their membership and list visibility permit a read.
- `trash_entries`: one row per entry, a task and its subtasks deleted together. `root_task_id` and
  `list_id` carry no foreign key (the entry and its tasks are erased together; the lists belong to
  spaces); `parent_key` is the parent of the root as it read when deleted, `null` for a top-level
  task; `task_count` (1 or more) is the root and its subtasks; `trashed_at` (`timestamptz(3)`) and
  `trashed_by_*` say when and by whom; `purge_requested_*` (all set or all null) is the hand-over
  by "Vider la corbeille". Partial indexes: `trash_entries_trashed_index` on
  `(organization_id, trashed_at, id)` where `purge_requested_at is null` (the page walked
  backwards, its total, the due entries from its start) and
  `trash_entries_purge_requested_index` on `(organization_id, purge_requested_at, id)` where not
  null (the hand-overs, oldest first). The extended statistics `trash_entries_list_statistics`
  (`dependencies, ndistinct, mcv` on `organization_id, list_id`, written by hand in the migration:
  drizzle-kit cannot declare them) let the planner see how many entries of the organization the
  lists of the caller hold; without them it took a few rows and sorted a bitmap scan of every entry
  of the organization (59,747 buffers, 26 to 28 ms per page at 20,000 entries for a member with
  2,233 lists, against 259 buffers and 0.3 ms for the walk).
- `tasks.trash_entry_id` names the entry of a task in the trash, a foreign key
  `(organization_id, trash_entry_id)` to `trash_entries`, `null` otherwise; partial index
  `tasks_trash_entry_index` on `(organization_id, trash_entry_id)` where not null (the tasks of an
  entry). An archived task in the trash keeps its archive columns (both `archived_at` and
  `trash_entry_id` set): it is out of the archives while in the trash, and comes back in its
  archive with its entry.
- Deploying `migrations/0007_trash.sql`: its `ALTER TABLE`s take ACCESS EXCLUSIVE on `tasks`,
  `lists`, `spaces` and `space_prefixes` until the migrator commits (one transaction); under them
  PostgreSQL scans `tasks` for the foreign key and the build of `tasks_trash_entry_index`, and
  `lists` and `spaces` for their CHECKs; the columns are added without a rewrite. Reads and writes
  of the running version on those tables wait meanwhile and fail after the 5 s `lock_timeout` of
  `task_app` (`55P03`, `500`). It also builds `list_grants_space_index` (a `SHARE` lock on `list_grants`:
  grant writes wait) and the extended statistics of `trash_entries`. Measured
  (`tests/trash-queries.int-spec.ts`, its 25 statements under fresh names in a rolled-back
  transaction of the migrator, 231,912 tasks, 5,134 lists, 408 spaces, 40,116 list grants): 113 ms
  in all, of which 28.2 ms for the foreign key scan of `tasks`, 23.9 ms for the build of
  `tasks_trash_entry_index`, 16.0 ms for `list_grants_space_index`, about 1 ms for each CHECK of
  `lists` and `spaces`, under 1 ms for each `ADD COLUMN`; `tasks` is held about 60 ms, and every
  lock until the commit. The scans grow with the whole tables (every organization).
  Rollback: a release before 0007 reads neither the trash nor the tombstones, so it would show the
  tasks in the trash and the deleted lists and spaces as live. That is why this release creates
  neither while `TRASH_WRITES_ENABLED` is off (its default; `docs/development.md` "Trash writes"):
  until the switch is turned on in an environment, the release before stays a safe rollback target
  there; once it is on, the minimum rollback target is this release (turn the switch off and keep
  it, or roll forward). A later contract migration that drops what 0007 added never re-adds
  `space_prefixes_space_fkey`: the prefix rows outlive the spaces erased since.

- `tasks.archived_at` (`timestamptz(3)`), `archived_by_type`, `archived_by_id` and
  `archive_root_id` are all set or all null (`tasks_archived_check`); `archive_root_id` names the
  task the archive was made from, the root itself for the root, a foreign key to
  `(organization_id, id)`. A task whose `archived_at` is null is live. `archive_root` (`boolean not
null default false`, added without a rewrite) is true exactly for the root of an archive
  (`tasks_archive_root_check`: `archive_root = coalesce(archive_root_id = id, false)`): PostgreSQL
  has no statistics for a comparison of two columns, so with `archive_root_id = id` as the
  predicate of the partial index the second page of the archives sorted every root after a bitmap
  scan (589 buffers, 11.7 ms at 12,310 roots, against 5 buffers for the walk). Partial indexes:
  `tasks_archive_root_index`, on `(organization_id, archived_at, id)` where `archive_root` (the tab
  "Tâches", every page walked backwards from its keyset), and `tasks_archive_member_index`, on
  `(organization_id, archive_root_id)` where `archive_root_id is not null` (the members of an
  archive: the restoration lock and the counts of the tab). Rollback: drop the two indexes, the
  constraints and the five columns in a new migration; the previous release reads none of them.
- Deploying `migrations/0006_archives.sql`: its first `ALTER TABLE` of each table takes ACCESS
  EXCLUSIVE on `lists` and on `tasks`, held until the migrator commits (the Drizzle migrator runs
  every pending migration in one transaction). Under it PostgreSQL scans `tasks` for the foreign
  key `tasks_archive_root_fkey`, the four CHECKs and the builds of the two partial indexes, and
  `lists` for its three CHECKs and its partial index (the columns are added without a rewrite).
  Reads and writes of the running version on either table wait meanwhile, and fail after the 5 s
  `lock_timeout` of `task_app` (SQLSTATE `55P03`, answered `500`). A migrator that cannot take a
  lock within the `lock_timeout` of its own role fails with nothing applied (all or nothing) and is
  retried safely. Measured (`tests/archive-queries.int-spec.ts`, the statements of 0006 under fresh
  names in a rolled-back transaction of the migrator, 104,278 tasks of 3,929 blocks and 4,004
  lists): 94 ms in all, of which 10 to 14 ms for each scan of `tasks` (the foreign key, each CHECK,
  each index build), the `ADD COLUMN`s under 2 ms each; the transaction holds ACCESS EXCLUSIVE on
  both tables until its commit. The scans grow with the whole table (every organization): deploy at
  low traffic once `tasks` holds millions of rows, or split the CHECKs and the foreign key into
  `NOT VALID` then `VALIDATE` steps in a later migration. Rollback: as above.
- `tasks.id`, `checklist_items.id` and `activity_entries.id` come from `uuidv7()`. The instants
  that order a page (`created_at`, `occurred_at`, `completed_at`) are `timestamptz(3)`, so that the
  position of a page round-trips exactly through the cursor. The key is stored on the task
  (`key_prefix`, `key_number`, unique per organization): a task keeps its key when it moves or
  when its space changes prefix, and old keys still resolve.
- The children reference `(organization_id, task_id)` of `tasks`, and a subtask references its
  parent by `(organization_id, parent_id)`, so that a row never points at another organization.
  There is no foreign key to `lists` or `spaces`: the strict layout forbids importing their
  schemas, and a deleted list or space stays as a tombstone until no task row references it, so
  `list_id` and `space_id` are kept right by the use cases. No `ON DELETE` action: the erasure of a
  trash entry deletes its collections, its activity and its tasks itself, in that order.
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
  limit when the filters keep a fair share of the list (a rare filter reads more of the range
  before it finds `limit` rows, up to the whole list). Plans taken as `task_app` on 75,000+ tasks (PostgreSQL 18; 98 top-level tasks and 150
  subtasks in Sprint 14, a list of 20,000 top-level tasks and 5,000 subtasks, 25,000 tasks in a
  sibling list and 25,000 in another organization): Sprint 14 page, total, groups and counters read
  7 to 15 blocks of the 2,375 of `tasks` in 0.1 to 0.3 ms (without the index: a Seq Scan, 2,375
  blocks, 3 to 5 ms); on the large list the first page in creation order reads 105 blocks in 0.1 ms
  (6 blocks for `-manual`) against a Seq Scan of 15 ms. The other sorts read the whole range of the
  list (a bitmap scan, 1,086 blocks) and keep the top rows in memory: 19 to 22 ms for `dueDate` and
  `priority`, 65 to 69 ms for `name` (106 ms for its second page: the name is folded for each row).
  So a page of any sort but the creation order is O(tasks of the list) at every depth, the second
  page and the hundredth alike; no index serves them (see "Not indexed"). The
  large list is 27 % of the table, so the total, groups and counters of it cost about what a Seq Scan
  costs (4 to 11 ms).
- `task_labels (organization_id, label_key, task_id)` (`task_labels_key_index`): the label filter
  only. Kept because plans use it, with a small gain at this size: the label total of the large
  list is a bitmap scan of the key, 11.5 ms against 14.0 ms for a Seq Scan of `task_labels` without
  it; in creation order the primary key serves the nested loop as well (1.0 ms with, 0.7 ms
  without). The labels route does not use it: it groups the label rows of the visible tasks and
  sorts the groups by an expression of `label_key`, so it reads them all whatever the index (a Seq
  Scan, 2,940 to 3,534 blocks, 31 to 41 ms).
- Not indexed, on purpose: `search` (a fold of the name and the labels, and a lower-cased key, of
  one list, 28 to 84 ms for 20,000 tasks; an index would need `pg_trgm`), the `dueDate`, `priority` and `name` sorts (the
  total is already O(list)), "Mes tâches" and "Accueil" (the hash join of the assignments of the
  caller with their tasks, 17 to 44 ms for a person assigned to 10,006 of the 75,000 tasks;
  `task_assignees_user_index` serves the assignment side) and the counters of lists that are most of
  the table (a Seq Scan, 24 ms, for a space of 45,000 tasks; the counters of the lists of a small
  space are a range, 15 blocks). If counters outgrow their budget, add `INCLUDE (parent_id, status,
due_date)` to the list index for index-only counts; status changes then stop being HOT updates.
- Not indexed, on purpose: the live tasks (`tests/archive-queries.int-spec.ts`). The candidate
  `(organization_id, list_id, created_at, id) where archived_at is null` helps only the first page
  in creation order of a list with many old archived tasks (2,664 to 31 buffers, 0.79 to 0.09 ms)
  and 40 % of the buffers of its aggregates, for 0.7 to 1 ms; the candidate `(organization_id, id)
where archived_at is null` is not used by "Mes tâches". To revisit by replacing
  `tasks_list_created_index` with its partial form, once the trash reads of PR 3 are checked.
- The counters, the totals and the groups read every task row of the list (or of the space): they
  need `status`, `due_date` and `parent_id`, which the index does not hold, so each is a heap read of
  the range. `list_id` is in the index, so moving a task to another list is not a HOT update.
- The two indexes are built by plain `CREATE INDEX` in the transaction of the migrator, which takes
  a `SHARE` lock on `tasks` and on `task_labels` until it commits: writes to them wait, and may fail
  on the 5 s `lock_timeout` of the application role (`55P03`, answered `500`) while the new version
  deploys; reads go on. A concurrent build needs a separate non-transactional step later (see
  Decisions). Rollback is `DROP INDEX IF EXISTS tasks_list_created_index, task_labels_key_index;` in
  a new migration (a merged migration is never edited).

## API

For Search, `GET /internal/v1/task-search-projections` exports current task, list and space
metadata and `POST /internal/v1/task-search-projections/resolve` resolves an ordered batch.
Both require the Search system identity and the signed organization. The export holds the
first page's UUID upper bound and binds its authenticated cursor to the tenant, kind and parent
filters. The read-only projection joins Task-owned rows with list and space lifecycle in the
same service database. Each join includes the organization. Spaces retains ownership of list
and space writes. A space awaiting an owner and its descendants remain in system projections.
The user proof applies the canonical access rules and excludes those resources until the space
has an owner.

`POST /internal/v1/task-search-access/resolve` checks a Search-delegated user. It compares the
current local membership stamp against Organization's evidence, then resolves active versions,
placements and access in the same read-only snapshot. The space proof distinguishes direct
access from visibility through a shared list.

The P3c-2 reporting contract uses a verified API gateway user and organization. The list reads
serve sprint reports, workload, timesheets and CSV rows. The team dashboard spans the caller's
visible live lists. CSV rows carry encoded cells and assignee IDs for the gateway to resolve.
The export checks list visibility, the active sort and the 10,000-row cap before sending headers.
It orders task IDs once and reads at most 250 selected tasks at a time in the same tenant snapshot.
The HTTP response writes legacy JSON incrementally, or UTF-8 NDJSON when the gateway explicitly
selects `application/x-ndjson`. The JSON closing bytes or NDJSON completion record follow the
read-only commit. A streaming transaction uses one attempt. A connection closed by
the consumer or its export deadline stops work before the next page, and a failure after headers
closes the partial response.

Normal task creation accepts an optional initial checklist. Its items are created in request
order with fresh IDs and are unchecked. The items share the new task's version 1 and its
creation transaction. Subtask creation still uses its separate contract.

Dependency routes under `/internal/v1/tasks/{taskKey}` use the verified API gateway user and
organization. `GET /dependencies` pages visible dependencies by creation time and id.
`GET /dependencies/{dependencyId}` requires a readable anchor and a visible, live counterpart.
`POST /dependencies` and `DELETE /dependencies/{dependencyId}` require edit on both live endpoints
and use the anchor version for the conditional write and resulting ETag. Creation returns the
edge location and supports the usual idempotency protocol. `GET /dependency-candidates` searches
editable live tasks, with the anchor list first and then name and key. Cursors are scoped to the
anchor and, for candidates, the direction and search.

The two strict-empty duplication routes accept the source version and an idempotency key. A
single task copy holds the source and its live parent in task-id order, then rechecks access
under placement locks. A list copy snapshots at most 501 live tasks in one statement, holds
current assignee memberships in one batch and rechecks the source list and space before writing.
List creation through `spaces`, the new task forest and its outbox records share the tenant
transaction. Fresh keys and checklist identities belong to the copy. Conversation, edges,
recurrence, grants and views stay with the source.
If inherited access leaves the initiating source editor below `edit`, the new list receives a
fresh `edit` grant for that editor alone and records the ordinary access-change fact. The source
organization-access switch is preserved.

The request guard checks body presence before replay for ordinary JSON, including chunked
requests. Transport bytes can still represent an empty decompressed body because the shared
parser discards decoded raw bytes. The API gateway sends a literal JSON object.

`openapi/internal/task-service.yaml` (`@cadenway/contracts` 0.28.0). The user routes require an
organization and the `api-gateway` issuer. The Realtime access check and the delegated task
commands specify their own signed callers below.

| Route                                                                     | Operation                                 | Success                   |
| ------------------------------------------------------------------------- | ----------------------------------------- | ------------------------- |
| `POST /internal/v1/lists/{listId}/tasks`                                  | `createTaskInternal`                      | `201`, `Location`, `ETag` |
| `POST /internal/v1/tasks/bulk-actions`                                    | `executeBulkTaskActionInternal`           | `200`                     |
| `POST /internal/v1/lists/{listId}/duplicate`                              | `duplicateListInternal`                   | `201`, `Location`, `ETag` |
| `POST /internal/v1/tasks/{taskKey}/duplicate`                             | `duplicateTaskInternal`                   | `201`, `Location`, `ETag` |
| `GET /internal/v1/lists/{listId}/activity`                                | `listListActivityInternal`                | `200`                     |
| `GET /internal/v1/tasks/{taskKey}`                                        | `getTaskInternal`                         | `200`, `ETag`             |
| `PATCH /internal/v1/tasks/{taskKey}`                                      | `updateTaskInternal`                      | `200`, `ETag`             |
| `POST /internal/v1/tasks/{taskKey}/git-status-actions`                    | `applyGitTaskStatusActionInternal`        | `200`                     |
| `POST /internal/v1/tasks/{taskKey}/automation-actions`                    | `applyAutomationTaskActionInternal`       | `200`                     |
| `POST /internal/v1/tasks/{taskKey}/automation-notification-authorization` | `authorizeAutomationNotificationInternal` | `204`                     |
| `GET /internal/v1/tasks/{taskKey}/detail`                                 | `getTaskDetailInternal`                   | `200`, `ETag`             |
| `PUT /internal/v1/tasks/{taskKey}/assignees/{userId}`                     | `assignTaskInternal`                      | `200`, `ETag`             |
| `DELETE /internal/v1/tasks/{taskKey}/assignees/{userId}`                  | `unassignTaskInternal`                    | `204`, `ETag`             |
| `POST /internal/v1/tasks/{taskKey}/labels/add`                            | `addTaskLabelInternal`                    | `200`, `ETag`             |
| `POST /internal/v1/tasks/{taskKey}/labels/remove`                         | `removeTaskLabelInternal`                 | `200`, `ETag`             |
| `GET /internal/v1/tasks/{taskKey}/subtasks`                               | `listSubtasksInternal`                    | `200`                     |
| `POST /internal/v1/tasks/{taskKey}/subtasks`                              | `createSubtaskInternal`                   | `201`, `Location`, `ETag` |
| `POST /internal/v1/tasks/{taskKey}/checklist-items`                       | `addChecklistItemInternal`                | `201`, `Location`, `ETag` |
| `PATCH /internal/v1/tasks/{taskKey}/checklist-items/{checklistItemId}`    | `updateChecklistItemInternal`             | `200`, `ETag`             |
| `GET /internal/v1/tasks/{taskKey}/activity`                               | `listTaskActivityInternal`                | `200`                     |
| `GET /internal/v1/tasks/{taskKey}/time-entries`                           | `listTaskTimeEntriesInternal`             | `200`                     |
| `POST /internal/v1/tasks/{taskKey}/time-entries`                          | `createTaskTimeEntryInternal`             | `201`, `Location`         |
| `GET /internal/v1/tasks/{taskKey}/time-entries/{timeEntryId}`             | `getTaskTimeEntryInternal`                | `200`                     |
| `DELETE /internal/v1/tasks/{taskKey}/time-entries/{timeEntryId}`          | `deleteTaskTimeEntryInternal`             | `204`                     |
| `GET /internal/v1/tasks/{taskKey}/time-summary`                           | `getTaskTimeSummaryInternal`              | `200`                     |
| `GET /internal/v1/tasks/{taskKey}/status-durations`                       | `getTaskStatusDurationsInternal`          | `200`                     |
| `GET /internal/v1/lists/{listId}/tasks`                                   | `listTasksInternal`                       | `200`                     |
| `GET /internal/v1/lists/{listId}/task-groups`                             | `countTaskGroupsInternal`                 | `200`                     |
| `GET /internal/v1/lists/{listId}/counts`                                  | `getListCountsInternal`                   | `200`                     |
| `GET /internal/v1/spaces/{spaceId}/overview`                              | `getSpaceOverviewInternal`                | `200`                     |
| `GET /internal/v1/spaces/{spaceId}/milestones`                            | `listSpaceMilestonesInternal`             | `200`                     |
| `GET /internal/v1/labels`                                                 | `listLabelsInternal`                      | `200`                     |
| `GET /internal/v1/users/{userId}/tasks`                                   | `listMyTasksInternal`                     | `200`                     |
| `GET /internal/v1/users/{userId}/home`                                    | `getHomeInternal`                         | `200`                     |
| `POST /internal/v1/tasks/{taskKey}/archive`                               | `archiveTaskInternal`                     | `200`, `ETag`             |
| `POST /internal/v1/tasks/{taskKey}/unarchive`                             | `unarchiveTaskInternal`                   | `200`, `ETag`             |
| `GET /internal/v1/archives/lists`                                         | `listArchivedListsInternal`               | `200`                     |
| `GET /internal/v1/archives/tasks`                                         | `listArchivedTasksInternal`               | `200`                     |
| `POST /internal/v1/tasks/{taskKey}/trash`                                 | `trashTaskInternal`                       | `200`                     |
| `GET /internal/v1/trash/entries`                                          | `listTrashInternal`                       | `200`                     |
| `DELETE /internal/v1/trash/entries/{entryId}`                             | `purgeTrashEntryInternal`                 | `204`                     |
| `POST /internal/v1/trash/entries/{entryId}/restore`                       | `restoreTrashEntryInternal`               | `200`                     |
| `POST /internal/v1/trash/empty`                                           | `emptyTrashInternal`                      | `202`                     |
| `GET /internal/v1/tasks/{taskKey}/access` (`realtime-gateway`)            | `checkTaskAccessInternal`                 | `200`                     |

- The access check answers `AccessCheck`: the role of the actor on the list of the task, the
  space, the list, the stable task UUID and the key. A task the actor has no role on and an unknown key answer
  `404 task.not-found` (never `task.trashed`), a malformed key `400 request.invalid` like every
  route of a task, an actor the copy does not hold `404 organization.not-found`. It runs in
  `runReadOnly`: the copy of the memberships, the task by `tasks_key_unique` without its
  collections, then `FindVisibleList` of spaces for its list (the list, its space, the read of
  the grants of the actor when the rule of the organization or ownership does not already give
  `edit`, and the read of the prefix counter for `nextKey`); it writes and emits nothing.
- Every `Task` answer carries `archivedAt` and `archivedBy`, `null` for a live task; every
  `TaskList` (the detail, the overview, the counters of a list, "Accueil", the archives) carries
  `archivedAt` and `archivedBy` of the list, `null` for a live list.
- The archive and the restoration take the empty object of the contract (`EmptyRequest`, validated,
  not read) and an optional `If-Match` on the version of the task of the path; both answer `Task`
  with its `ETag` (the restoration answers the root of the archive). The two archives pages take
  `cursor` and `limit` like the other pages, answer `total` on every page and no `ETag`.
- The trash routes take the empty object of the contract as body (`EmptyRequest`, validated, not
  read); the deletion takes an optional `If-Match` on the task and answers the entry
  (`TrashEntry`); `entryId` is a UUID (`400 request.invalid`); the page takes `cursor` and `limit`
  like the other pages (its cursor `(trashed_at, id)` fingerprinted with the collection) and
  answers `total` on every page. No `ETag`.
- `404 task.trashed` (`details: { key, name, entryId, rootKey, trashedAt, trashedBy, purgeAt }`)
  answers every route of the key of a task in the trash, read or write, to an actor with `edit` on
  its list as if the list and its space were not deleted, while the entry is not handed to the
  purge; anyone else gets `404 task.not-found`, before the `403` of a live task. The access check
  always answers `task.not-found`. `404 trash-entry.not-found` answers an entry the actor may not
  restore (unknown, handed over, or of a list without `edit` as if not deleted), never a `403`.
- Every `TaskList` and `Space` a route answers (the detail, the overview, the counters of a list,
  "Accueil") carries the access of the actor: `organizationAccess` and `callerRole` on a list,
  `callerRole` (`null` for a space seen through some of its lists only) and `callerCanManage` on a
  space, as the spaces module computed them in the transaction of the read.

- The task routes and `listSubtasks` name a task by its key, `^[A-Z]{2,5}-[1-9][0-9]{0,8}$`: a
  lower-case or zero-padded key answers `400 request.invalid`.
- The Git action requires a signed `integration-service` issuer, a Git actor, an organization and
  an idempotency key scoped to that actor. Before a cached reply, a guard checks the mapping author's
  current access and the task's active placement; the mutation checks them again under its own locks.
  A refusal is a generic `404 task.not-found`. A successful transition records Git provider activity
  and outbox events in the same transaction as the task change.
- The Automation action requires a signed `automation-service` issuer and the rule as actor in
  the organization. Task rechecks the rule author's active edit authority before execution and
  replay. Assignment also requires current assignee eligibility. A changed priority or
  assignment commits activity, events and the actor-scoped receipt with the task. Authorized
  no-ops return their receipt without changing the task.
- Automation notification authorization accepts a signed `notification-service` system actor
  scoped to the tenant. A single tenant snapshot checks active placement, the rule author's
  current edit access and the recipient's current view access. Success is bodyless and refusals
  return a generic `404 task.not-found`. All replies use `private, no-store`.
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
- `409 task.archived` (`details: { key }`) answers every change of an archived task (the patch, a
  move, `parentKey: null`, an assignee `PUT` or `DELETE`, a label added or removed, a checklist
  item added or ticked, a subtask created under it), after its `404` and `403` and before `412` and
  the `422`s; and a `parentKey` naming an archived parent, with the key of the parent, after the
  `422 task.parent-invalid` and the `403` of the parent.
- Refusals: `404 task.not-found`, `list.not-found`, `space.not-found` (the overview),
  `user.not-found` (the two `users` routes, when `userId` is not the actor, checked before the
  membership), `checklist-item.not-found`, `organization.not-found`; `403
access.role-insufficient` with `details: { role, requiredRole: 'edit' }` (`role` is the role of
  the actor on the list the change acts on); `412 request.version-mismatch`; `422 task.status-hidden`
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
- The overview pages its lists in the order of the sidebar, `(coalesce(restored_at, created_at),
id)` (the `position` of the lists spaces answers), and its cursor carries that position and the
  id: a list restored from the archives goes to the end of its space, and is neither lost nor read
  twice between two pages.
- The space milestone page reads only live milestones from the caller's visible nonarchived lists.
  Its cursor orders due dates ascending, undated last, with the task ID breaking ties. An unseen or
  unknown space gives `404 space.not-found`. For list tasks and task groups, `milestone=true` selects
  milestones and `false` selects ordinary tasks. Both values bind the cursor to the filter.

- Creation and `PATCH` store structured description mentions as Unicode code-point spans. A description
  or spans patch requires `If-Match`. Changing the description without supplying replacement spans
  clears them. Invalid spans give `400 request.invalid`. Supplied recipients, including guests, must
  be current members who can read the resulting list. A recipient refusal gives
  `422 mention.recipient-invalid` after the edit-role check. The stored spans carry a digest of the
  text they annotate. Reads omit stale spans if a previous service version replaced that text.

### Collaboration operations in the installed contract

| Internal operation                                         | Serving file and state                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `GET /internal/v1/tasks/{taskKey}/comments`                | `task-comments/presentation/http/controllers/comment/comments.controller.ts` |
| `POST /internal/v1/tasks/{taskKey}/comments`               | `task-comments/presentation/http/controllers/comment/comments.controller.ts` |
| `GET /internal/v1/tasks/{taskKey}/comments/{commentId}`    | `task-comments/presentation/http/controllers/comment/comments.controller.ts` |
| `PATCH /internal/v1/tasks/{taskKey}/comments/{commentId}`  | `task-comments/presentation/http/controllers/comment/comments.controller.ts` |
| `DELETE /internal/v1/tasks/{taskKey}/comments/{commentId}` | `task-comments/presentation/http/controllers/comment/comments.controller.ts` |
| `GET /internal/v1/tasks/{taskKey}/participants`            | `tasks/presentation/http/controllers/task/task-participants.controller.ts`   |
| `GET /internal/v1/tasks/{taskKey}/watchers`                | `tasks/presentation/http/controllers/watcher/task-watchers.controller.ts`    |
| `PUT /internal/v1/tasks/{taskKey}/watchers/{userId}`       | `tasks/presentation/http/controllers/watcher/task-watchers.controller.ts`    |
| `DELETE /internal/v1/tasks/{taskKey}/watchers/{userId}`    | `tasks/presentation/http/controllers/watcher/task-watchers.controller.ts`    |

Paths in the table are relative to `src/modules/`. The participants query requires `comment` or
`edit`. It reads task visibility, list grants and current memberships in one tenant snapshot.
It returns only `userId` and `memberId`, ordered by user ID, including guests with list read
access. The cursor is bound to the tenant and task.

Watcher pages are ordered by account ID in one tenant snapshot. Every page includes the total and
whether the caller follows the task. A caller with comment or edit access can change their own
override. Only an editor can change another account's override. The account needs current read
access. PUT follows explicitly and DELETE opts out explicitly. Both honor the task's `If-Match`
and return its ETag. Repeating an override preserves the version.

## Events emitted

- `task.dependency-added.v1` and `task.dependency-removed.v1` name the edge and both endpoint
  placements and versions, with the blocker version in the envelope. Explicit writes also append
  one `task.updated.v1` per endpoint with `dependencies` in `changed`. Endpoint purge removes its
  edges through the foreign keys and uses the existing purge fact.

`task.description-mentions-changed.v1` is appended in the same transaction when the stored description
recipient set changes. It carries account IDs and task placement, with no description or span text.

A changed watcher override advances the task version and appends `task.updated.v1` with
`changed: ['watchers']`, then `task.watcher-changed.v1`, in the same transaction. It creates no
activity entry. The watcher fact states the requested override and its effective subscription.
`task.status-changed.v1` includes the effective eligible `watcherIds` of the resulting task, including
its new list when a patch changes its placement and status together. Status and comment creation
snapshot the audience under task and placement locks. The notification consumer rechecks visibility
before delivery and suppresses the actor.

`task.created.v1`, `task.updated.v1` (with `changed`), `task.status-changed.v1`,
`task.assigned.v1`, `task.archived.v1`, `task.unarchived.v1`, `task.trashed.v1`,
`task.restored.v1` and `task.purged.v1` of `asyncapi/task-service.yaml`, appended to the outbox in
the transaction of the change. Their payload carries neither the
description, the checklist nor, outside `task.status-changed.v1`, the cancel note.

- A creation emits `task.created.v1` for the task, each `task.assigned.v1` of its assignees, then the
  same for each subtask, in body order. The subtask route emits the same for the subtask only.
- A change that changes something emits `task.updated.v1` with the version it produced, then
  `task.status-changed.v1` when the status changed, then `task.assigned.v1` for each person added.
  A move or an attachment emits one `task.updated.v1` per subtask that follows, with its own version.
  A patch that changes nothing writes, records and emits nothing and answers the same version.
- The created and updated snapshots report the current milestone flag and recurrence cadence,
  including `false` or `none` when either feature is switched off.
- A live existing milestone entering `done` appends `milestone.reached.v1` with the milestone
  name, completion time, nullable due date and eligible watcher IDs. A recurrence that spawns a
  successor appends `task.occurrence-created.v1` with both keys, the resulting predecessor
  version, the successor's due date and the transferred cadence. The task writes and the outbox
  rows commit together. The existing relay retries publication after commit using the event ID.
- The unassignment of a removed member emits one `task.updated.v1` (`changed: ['assigneeIds']`)
  per task it changes, by the actor `{ type: 'system', id: 'task-service' }`, in the transaction of
  its batch. A batch runs in the span of the clean-up job, child of the delivery of the removal, so
  these rows carry the `traceparent` of that trace when the process traces.
- Note to report to cadenway-api-contracts: until the clean-up job reaches
  a task, the former member stays in its `assigneeIds`, in the task and in every event the task
  emits meanwhile (a rename, a cancel note). An assignee may briefly be a former member: consumers
  check the membership, and clients show « Ancien membre ».
- A parent emits nothing when a subtask is created, attached or detached: its subtask counts are
  derived.
- An archive emits one `task.archived.v1` per task it takes, a restoration one
  `task.unarchived.v1` per member, each with its own version and `rootKey` (the key of the root),
  the root first, then by depth under it, then by id; the restoration carries `parentKey: null` for
  a root detached. A list restored with its task emits `list.unarchived.v1` (spaces) before them.
  The archive of an archived task and the restoration of a live one emit nothing; the removal of a
  member still emits `task.updated.v1` for an archived task it unassigns.
- The trash emits one event per task of an entry, the root first, then by depth, then by id, each
  with `entryId` and `rootKey`: `task.trashed.v1` (the task as it was, its stored parent, the next
  version, `purgeAt`) by the person or by the actor who deleted the list or space; `task.restored.v1`
  (after the `space.restored.v1` and `list.restored.v1` spaces appends, `parentKey: null` for a
  root detached); `task.purged.v1` (stored version plus one, its list, space and stored parent) by
  the person, the requester of "Vider la corbeille" or `{ type: 'system', id: 'task-service' }`
  for an entry due. None is recorded in the activity. The removal of a member emits no
  `task.updated.v1` for a task in the trash. The `entryId` of `task.restored.v1` is the id of the
  entry row the restoration locked, not the id of the request. Accepted race: a removal of a
  member still emits `task.updated.v1` for a task of a deleted list that the deletion job has not
  moved yet (the task is not in the trash), after `list.deleted.v1`; its `task.trashed.v1` follows
  when the job takes it.
- An archived task restored from the trash comes back archived as of the restoration, by the
  person who restored it: it is restored at its next version V (`task.restored.v1` at V), then
  archived again in the same transaction (the instant of the restoration as `archivedAt`, the
  restoring user as `archivedBy`, the same root of its archive), stored at V+1, with its
  `task.archived.v1` at V+1 right after its `task.restored.v1` (`occurredAt` its new `archivedAt`,
  the restoring user as actor, the key of the root of its archive as `rootKey`; root first, in the
  order of the entry). A consumer that follows the contract ignores a version it already applied,
  so a second event at the same version would not hide it again; an archive lies wholly inside an
  entry, so every member of an archive changes together.
- `task.restored.v1` carries `archivedAt` and `archivedBy` from the final post-restore state,
  null for a live task and the new archive instant and actor for an archived task.
- A part of an entry too large for one batch of the purge emits one `task.purged.v1` per task it
  erases in that transaction, breadth-first by depth and id in the remaining forest. The root
  goes with the first part. Every event includes the original root key and the task's parent
  at the time of erasure, which can be absent after detachment in an earlier batch.

## Events consumed

None, and no worker: member-lifecycle consumes `member.removed.v1`, enqueues its clean-up job and
runs `UnassignRemovedMember` from that job, batch after batch; deletion-lifecycle owns the workers
of the four queues of the trash and runs the three batches above. `member.role-changed.v1` never
changes the assignees.

## Invariants

- A space manager controls up to thirty active custom field definitions, in display order. A
  definition's number or text type is immutable. Only an active numeric definition may hold the
  space's sprint points designation, and negative points prevent that designation. Definition
  writes hold the space lock. Task value writes hold that same placement before checking types,
  applying sparse values or deleting values on a cross-space move. Numeric zero and empty text
  are stored values. A field omitted from a patch is unchanged, while `null` clears it.
- Page reads load values for the authorized task and space pairs in one query. Definitions and
  values follow physical removal of their space and task. Retiring a definition hides it from
  current reads and keeps its retained values until cleanup. Copies, templates and recurrences
  start without values. A real value change advances the task's version once and records
  `customFieldValues` in `task.updated.v1` without recording the values in that fact. The
  additive `0013_task_custom_fields` migration can run while the preceding binary is serving.
  Once value writes are enabled in an environment, keep its first image with this migration
  and cross-space cleanup as the minimum rollback version. An older writer does not erase values
  when moving tasks between spaces and can make stale values visible after a later upgrade.

- A work log records its author's stable user ID, whole minutes, independent calendar work date,
  optional plain text note and server creation time. Readers of the task may read its log and
  totals. Adding a log requires edit access to a live task. Deleting it additionally requires
  authorship. Logs follow the task through moves, archives and restoration without changing its
  version. Each subtask has its own log, and the tenant-scoped foreign key removes the log when a
  task is permanently erased. The page and its task-wide totals use the same database snapshot.
  A keyed creation checks current edit access and archive state before the idempotency interceptor
  can replay a stored response. A fresh write rechecks access with its transaction's locks.
- Status durations measure the coherent suffix of durable status activity in `(occurred_at, id)`
  order, ending at one server observation instant. A creation fact records its initial status for
  complete coverage. Older facts with an unknown initial status report incomplete coverage.
  Terminal statuses accumulate elapsed time with no active marker. Milestones have no duration
  summary. Migration `0012_task_time_entries` adds the table and a nullable creation column. The
  previous image still reads and writes valid rows. Creation facts written by that image after
  a rollback have unknown initial status when the newer image resumes.

- A directed dependency is tenant-scoped and cannot form a self-link or a path back to its
  blocker. The cycle check uses all retained edges. Enforce 100 incident edges per endpoint even
  when a counterpart is hidden, archived or trashed. An unavailable counterpart and the path of
  a cycle disclose no identifiers. Archived anchors can read edges to visible live counterparts.

- An actor the copy of the memberships does not hold answers `404 organization.not-found`. A task
  is seen by whoever has a role on its list, any role; what the actor has no role on (a task of a
  list closed to the organization and not shared with them, of a private space of another member,
  of a list not shared with a guest, a list unknown to them) answers `404` and is left out of every
  collection. A guest has a role on the lists shared with them only, and sees their tasks.
- A change needs `edit` on the list of the task, whatever it changes (the patch, an assignee, a
  label, the checklist, a new subtask on its parent, a patch that changes nothing): a task the
  actor sees with `view` or `comment` answers `403 access.role-insufficient` with that role. A
  creation needs `edit` on its list; a move needs `edit` on the list it goes to as well; an
  attachment needs `edit` on the list of the new parent (the task moves to it). An unseen target
  list stays `422 task.list-invalid`, an unseen parent `422 task.parent-invalid`. Order of the
  refusals: not found (`404`), then the role on the list of the task (`403`), then an archived
  task (`409`), then `If-Match` (`412`), then the target of a move or an attachment (`422`
  unseen, `403` without `edit`, `409` archived parent), then the domain (`422`). With `edit` on every list (the rule before grants), every route behaves as
  in P3a.
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
  subtask moved to another list leaves its parent first, a detached task keeps its list. Every
  answer keeps it true: the root of an archive whose live parent moved to another list since (a
  move carries the live subtree only) reads as detached, `parentKey: null` in `Task` (the task,
  the detail, the archive and the restoration) and in every `TaskSummary` (the archives, the
  subtasks, every page), `parent: null` in the detail, as its restoration leaves it
  (`showsParent`, `takesRestoredRoot`); its stored parent stays for the restoration. Only such a
  root can be in that state: the members of an archive share the list of its root, and a live
  task the list of its parent.
- A task is never renumbered, and deleted only by the erasure of its trash entry. A key is never
  given twice (the counter of a prefix never goes back, and an erased space keeps its prefix): the
  number comes from
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
  task now in a list the actor has no role on are left out of `items` and `total`, and those of a
  task now in another visible list stay.
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
- Visibility of the queries: a list the actor has no role on, or a space they do not see, answers
  `404`; the overview of a space lists the lists of it the actor has a role on (a guest sees a
  space through the lists shared with them, and those only), and its `listCount` and `taskCount`
  cover those lists. The cross-list routes (labels, "Mes tâches", "Accueil", and the entries of
  the activity of a list) keep the tasks whose `list_id` is one of the lists the actor has a role
  on (`ListVisibleListIds`). An actor with a role on no list gets, without a read of the tasks, an
  empty page with zero counts for labels and "Mes tâches", zeros and empty lists for "Accueil". An
  account that is not the actor never reads another's tasks or home.
- Filters of a list (tasks and groups): values of one filter add up, filters narrow each other.
  `assignee` takes account ids, `me` (the actor) and `none` (nobody assigned); `label` compares the
  label key (trimmed, form C, lower case), so case is ignored and accents are significant; `search`
  looks in the name, the key and the labels, ignoring case and accents, the text as sent, with no
  wildcard, and a text that folds to nothing (combining marks alone) matches nothing; `dueFrom` and `dueTo` are inclusive and leave out the undated, `dueFrom` after `dueTo`
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
- Counters (`TaskCounts`, the overview, "Accueil" lists and sprints) count live top-level tasks only:
  `total`, `open` (not `done` or `cancelled`), `done` (« Terminées »), `cancelled` and `late` (open
  and due strictly before the `today` of the caller, which the service does not know). The overview
  gives `listCount` and `taskCount` of the whole space on every page; "Mes tâches" and the stats of
  "Accueil" count the tasks assigned to the actor, subtasks included, with the counts of both tabs
  on every page; "Accueil" lists the 7 next open tasks, the current sprints (start and end
  inclusive, at most 10, by end date then creation) and the first 6 lists in the order of the
  sidebar (spaces by creation, then their lists by restoration from the archives, else creation),
  sprints included.
- Archives ("Tasks" of `openapi/public/archives.yaml`): archiving or restoring a task needs `edit`
  on its list. An archive takes the task and its live descendants, every level, whatever their
  status, with one instant, actor and root, the next version and `updatedAt` each; a subtask
  archived before keeps its own archive. An archived task already answers `200` with its version;
  so does the restoration of a live task (after `If-Match`). Neither is recorded in the activity.
- An archived task is left out of every collection and count (the tasks of a list, groups,
  counters, the overview, "Accueil", "Mes tâches", labels, the activity of a list, the live subtree
  and the child count of a write) through one predicate (`liveTask`); it reads by its key (the
  task, its detail, its activity, the access check) and refuses every change of a user until it is
  restored. Archived tasks never move: a move of a live task leaves its archived subtasks in their
  list, under it, where they read as detached (see the list of a subtask above). A live task never
  has an archived parent. An archived task in the trash is out of the archives (every archives
  statement and count adds `untrashedTask`: the roots page, its total, the member counts,
  `lockArchive`), and the archive routes answer it `404 task.trashed`.
- The subtasks shown of a task are those of its archive (`archive_root_id IS NOT DISTINCT FROM` the
  parent's): `subtaskCounts`, `GET /tasks/{taskKey}/subtasks` and the subtasks of the detail. The
  limit of 25, the depth of a new or attached subtask and the subtree of a move count live tasks
  only.
- A restoration through any member restores the whole archive from its root: the root keeps its
  parent only when the parent is live, in the list of the root, with fewer than 25 live subtasks,
  and its level plus the height of the archive is 3 at most (`takesRestoredRoot`), and becomes a
  top-level task of its list otherwise; an archived list of the root is restored first (spaces
  decides on the locked list). It answers the root.
- The archives pages list, the most recently archived first (`archived_at desc, id desc`), the
  archived lists the actor has a role on, each with its live top-level task count, and the roots of
  the archives of the lists the actor has a role on (archived lists included), each with its list
  (`state` `archived` or `active`) and the members archived with it. An actor with a role on no
  list gets an empty page without a read of the tasks.
- Trash (`openapi/public/trash.yaml`): deleting, restoring and erasing an entry need `edit` on its
  list, as if the list and its space were not deleted. An entry is its root and every descendant
  of it in the same list not in the trash already, at every level, live and archived ("a task and
  its subtasks at every level"), with one instant, actor and entry, the next version and
  `updatedAt` each; an archived task keeps its archive while in the trash, a subtask deleted before
  keeps its own entry, and a subtask in another list (an archived task whose parent moved away)
  stays. A deletion of an archived task answers `409 task.archived`. `purgeAt` is `trashedAt` plus
  exactly 30 days (`TRASH_RETENTION_DAYS`).
- Bounds: an entry holds at most 651 live tasks (1 + 25 + 625) plus the archived subtasks under
  them, which the product does not limit (an archived subtask frees its place among the 25 and its
  level), so they may hang below the 3 levels of the live tree. The reads and locks of an entry are
  not capped at 650 descendants (the cap stays for a move and an archive); its tree walk has no
  depth limit (a limit an editor could reach would block a deletion for good: moves and
  attachments count the live height only, so archived chains can deepen). It stays in one
  organization and one list, and PostgreSQL detects a cycle of parent links
  (`CYCLE id SET is_cycle USING path`), a defect that throws. A batch of the deletion job still
  stops adding roots once it holds 500 tasks or more. A purge transaction erases up to 500 tasks,
  taking consecutive whole entries that fit. It erases an oversized entry breadth-first, starting
  with its root, then walking the remaining forest in each subsequent transaction. The entry
  stores its original root key, name and status when the root is erased. It is then unavailable
  for restoration and leaves with its final tasks. Each batch appends a `task.purged.v1` for
  every task it erases in that transaction, so a failed batch leaves its work available for retry.
  Enable the trash only after all purge workers support partially erased entries. Once enabled,
  keep a compatible worker when rolling back or disabling trash writes.
  Known limit, to report: "Supprimer la tâche", a deletion batch, "Supprimer
  définitivement" and a restoration move or erase an entry in one
  transaction, whatever the archived subtasks it holds (an erasure costs what the trash of the
  entry cost, in one transaction too: two outbox round trips per task; the 651 tasks of the
  largest live tree were measured in the plans of `tests/trash-queries.int-spec.ts`). An entry
  whose erasure keeps failing stays first in every batch of its organization and holds back its
  purge until the failure is fixed (the job retries it, then dead-letters it: "Retries" of
  `src/modules/deletion-lifecycle/MODULE.md`).
- A task in the trash is left out of every collection and count, the subtask reads included,
  through `liveTask` (`archived_at is null and trash_entry_id is null`) and the subtask rule
  (`sameArchiveAsParent` also leaves out the subtasks in the trash); `FindTaskReference(s)` and
  the access check do not find it; a `parentKey` naming it is an unseen parent
  (`422 task.parent-invalid`). A task whose parent is in the trash reads as detached
  (`showsParent`). It refuses every change but the removal of a member, which unassigns it at its
  next version. The tasks of a deleted list not in the trash yet answer `404 task.not-found`.
- A restoration brings the whole entry back to its list, each task with its archive state as it
  was (an archived task comes back archived, in its archive, as of the restoration and by the
  restoring user, two versions on): a live root keeps its parent only
  when the parent takes it back (`takesRestoredRoot`: live, in its list, fewer than 25 live
  subtasks, its level plus the height of the live tasks of the entry 3 at most) and is detached
  otherwise; an archived root keeps its parent only when the parent is out of the trash and in its
  list (live or archived), and is detached otherwise, keeping its archive, so `task.restored.v1`
  and every answer agree. A parent in the trash detaches the root without being locked. A root
  deleted as a subtask whose parent was erased meanwhile (the erasure set its parent to `null`)
  answers `detached: true` too. The archived tasks counting towards neither limit, the 25-subtask
  and 3-level limits stay true. A deleted list comes back at the end of its space and a deleted
  space at the end of the sidebar (spaces); an archived list stays archived; the entry row is
  deleted. The answer is the root as it reads, archived for an archived root.
- An entry of a deleted list whose deletion job has not moved every task of the list yet cannot be
  restored: a list that still holds a task out of the trash answers `409 trash-entry.not-restorable-yet`
  when `reportNotReady=true`, otherwise `404 trash-entry.not-found`, writing nothing. Those tasks are the
  pending work of the job (no task enters or leaves a deleted list: creations and moves hold their
  lists, and its tasks are invisible), and the entry is restorable once the job finished, within
  minutes. The check runs twice: under `LockDeletedList` for a list read deleted (an early
  refusal), and again, when `RestoreDeletedList` answers `listRestored`, under the
  `FOR NO KEY UPDATE` it then holds on the list (which conflicts with the `FOR SHARE` of a
  deletion batch and of `HoldList`): `LockDeletedList` takes no lock on a list it reads live, so a
  deletion that commits between the two reads is seen only by the second, whose refusal rolls back
  the restored list, the restored space and their events. Only with both checks does a
  restoration never expose a task its deletion job has not moved. So the job's `list-live` exit
  only follows a list restored after its job finished, which leaves nothing behind.
- An erasure deletes the activity entries, checklist items, assignees, labels and tasks of its
  entries and the entries, and detaches (no version, no event) the tasks outside them that hung
  from one of their tasks: tasks of other entries, and archived tasks out of the trash left in
  another list when their live parent moved away (a deletion takes every subtask of its list, so
  none is left in the list of the entry); a deleted list no task row references any more is handed
  to spaces, which erases it and its deleted space with its last list, decided under the locks of
  the lists (`LockTrashLists` in `erase`, one call for the lists of the erased entries, live or
  deleted, taken after the tasks are deleted: the spaces in `(created_at, id)` order, then the
  lists in ascending id). So the last two erasures of one list serialize on it and the second
  erases the tombstone, and an erasure of the last entry of a list and a deletion of that list
  serialize on it too: the deletion committed before the lock (the erasure reads the list deleted
  and erases its tombstone when nothing is left) or waits for the erasure (its job reads the
  erased tasks gone); no tombstone is left without a trigger. A person's erasure reads their role
  again under those locks and is refused (`404 trash-entry.not-found`, nothing erased) when a
  grant was revoked or the space made private while it waited. "Vider la corbeille" hands every
  entry the actor may restore to the purge job at once (the role read again under the locks of the
  lists, `LockTrashLists` in `hold`, after the entries): they no longer list, restore or erase by
  a person, and their tasks answer `task.not-found`. The daily purge erases the entries due
  (`trashed_at` at or before the transaction instant less 30 days) and the entries handed over.
- The page of the trash lists the entries the actor may restore still in the trash, the most
  recently deleted first (`trashed_at desc, id desc`), each with its root as it reads now, its
  stored parent, its subtasks, its list (`active`, `archived` or `deleted`) and `purgeAt`. An actor
  with `edit` on no list gets an empty page without a read of the entries.
- A deletion of a list moves its tasks to the trash by batches of its job, one entry per task of
  the list out of the trash that reads as top-level (no parent, or a parent in another list or in
  the trash), live or archived, with its descendants as above, by the actor of the deletion: an
  archived top-level task makes its own entry, an archived subtask goes with its top-level
  ancestor. A creation of a top-level task and a move to another list hold the target list
  (`HoldList`) and answer a list deleted meanwhile as unseen (`404 list.not-found`,
  `422 task.list-invalid`); a move to another list and an attachment to a parent in another list
  also hold the list the task leaves (two lists in ascending list id, the order of every writer
  that locks several lists), and answer it deleted meanwhile as for any task of a deleted list
  (`404 task.not-found`), so no task leaves a deleted list (a move leaves its archived
  subtasks behind, which the job would otherwise miss). A batch that finds no root after its
  position while the list still holds a task out of the trash answers `rescan` (a safety net).
- The writes of the trash are behind a switch, `TRASH_WRITES_ENABLED` (`src/config/app-config.ts`,
  `false` by default; the `TrashWrites` port, bound in composition from `CONFIG`). The release
  before 0007 ignores `trash_entry_id` and `deleted_at`, so no trash entry and no tombstone may
  exist while a rollback to it is possible (`.claude/rules/migrations.md`). While it is `false`,
  "Supprimer la tâche" (`trashTaskInternal`) and "Vider la corbeille" (`emptyTrashInternal`) check
  it first, before the membership, and answer exactly as an unknown route of the kit does: `404`,
  `http.not-found`, title `Not Found`, detail `Cannot POST <url>` (after the internal-token guard
  and the validation of the request); the deletions of a list and of a space are switched by the
  spaces module. The restoration and the erasure of an entry, the page of the trash and the batches
  of the jobs are always served: they only act on what exists, so with the switch turned off again
  after use the trash is still erased on time and the tasks of deleted lists still reach it.
- Labels: one per label key, whatever the case, in the order of the first 128 code points of the
  folded key then the key (code point order); the spelling is the first in code point order among
  the visible tasks, so a list the actor has no role on leaks none. A search that folds to nothing
  matches nothing.

## Transactions

The report providers use one read-only `REPEATABLE READ` tenant transaction for the verified
membership, list visibility and report data. Sprint pages retain the observation and original
sprint schedule and recheck current list access and physical purges. A civil date skipped by
the requested time zone stays on the calendar axis with unknown actual points. Space and list
history comes from the Spaces public reporting providers, which join that same snapshot.

Task writes use the tenant transaction of the organization of the context
(`TenantTasksUnitOfWork`). It joins the transaction the `Idempotency-Key` interceptor opened for
a creation or the deduplicator opened for the removal of a member. The task, its collections,
its activity entries and their outbox rows commit together, and a refusal rolls them back.
The readings of the copy of the memberships, the operations of the spaces module (`FindVisibleList`,
`ListVisibleListIds` and the others, which read the roles of the actor) and `AllocateTaskKeys`
join the same transaction. The unit of work wakes the relay once its `run`
resolved when an event was appended (inside a joined transaction, before the outer commit, so the
rows leave at the next poll).

The queries (`GET` routes) run in `runReadOnly`, which prevents writes in the database. Task
detail, individual task reads, list pages, subtasks and My Tasks use `REPEATABLE READ` so the
resolved access, task rows, custom values and page totals share a snapshot. The operations of the
other modules a query calls join it. The kit refuses a join that asks for more than the running
transaction gives. Queries without a snapshot read each statement as committed when it started.
The access check runs in `runReadOnly` too. `FindTaskReference` and `FindTaskReferences` run in `run`, not
`runReadOnly`: they join the transaction of access-requests, which is read-write for a request
or a decision, and the kit refuses a read-only join over a read-write transaction; they write
nothing all the same.

Global lock order: one order for every writer of the service, whatever its module (the spaces and
access-requests modules follow it and point here), so that no two transactions wait on each other
in a cycle:

1. memberships `FOR SHARE`: the actor, then the people being assigned, mentioned or given access; an access
   request then takes its advisory lock and its attempts. Dependency writes take the organization
   graph advisory lock before the task rows;
2. trash entry rows `FOR UPDATE` (several in one statement by id, or `SKIP LOCKED` in the purge);
3. tasks: a writer of a tree (a move, an archive, a restoration, a deletion, an erasure, or a
   job batch) locks its participating tasks in one statement in ascending id; a task write of one task
   locks it by key, then the others it involves by id (below);
4. spaces, several in `(created_at, id)` order;
5. lists, several in one statement in ascending id;
6. `space_prefixes` (`AllocateTaskKeys`), then the access requests and the outbox.

Dependency writes acquire the graph lock in a separate statement in the read-committed
transaction. After locking both endpoints in ascending id and their placements in the common
order, they recheck access, the conditional anchor version and the current retained graph before
writing. The edge, both task versions and the outbox commit together. Physical purge only removes
edges. Dependency views and candidate pages share a read-only repeatable snapshot with their
effective list-role lookup.

Bulk actions authorize all explicitly selected tasks and check their versions again under one
ordered lock of the affected tasks. They hold every source and destination placement before
rechecking access and taking any prefix counters in ascending space id. Move and trash apply each
overlapping subtree once, while the response preserves the selection order. The selection is
limited to 50 distinct keys and the action to 1,000 affected rows, including copies and recurring
successors. Changes, activity, outbox and trash cleanup jobs commit together. A changed expansion
or watcher audience restarts discovery under a fresh savepoint before any write.

The task delete during purge cascades to watcher-override and comment rows; PostgreSQL takes the child-row
locks during that delete, after the task locks and before the subsequent space and list locks.
A comment write holds the acting membership and supplied recipient memberships, then its task,
then the task's space and list `FOR SHARE`. It subsequently inserts or updates the comment row,
its activity and outbox. A status change holds the task's space and list after its task lock.
A patch moving a task holds both placements in global order and rereads the actor's role.
Description-mention assignments lock supplied recipient memberships in user ID order before
the task or list. They check recipient visibility on the resulting list while the actor's
edit role and the placement are held.
Status and comment creation pre-read watcher candidates and hold their current memberships in
account order before the task. A reply's human author joins the same preflight. After locking the
task and the resulting placement the write checks visibility under those locks. A newly found
candidate rolls back the preflight savepoint and retries it, with at most three attempts. The
savepoint keeps the caller's idempotency reservation and is released before writing or emitting.
Every comment mutation holds the owning task before the comment row, so it cannot conflict
on a child row with a purge that already holds that task; the purge cascades child rows before it
locks spaces and lists. Watcher cleanup locks task rows in ascending id, reads membership without
a lock, then deletes the overrides under the owning task locks.
An explicit watcher write holds the actor and target memberships before locking the task. It then
holds the task's space and list, rechecks the actor's role and the target's read access, and writes
the override, task version and outbox together.

A row is locked in its final mode before the next level: no transaction takes a shared lock and
strengthens it later (the one strengthening left, the `FOR NO KEY UPDATE` of a deleted space to
the `FOR UPDATE` of its erasure, waits for no other writer). A level may be skipped, never taken
again after a later one: an erasure finishes every write of its tasks (the detachment included)
before it locks a list. A write that needs a role on a list checks it on rows read without a
lock first (a target the actor may not see answers at once, whatever another transaction holds),
then holds the space and the list and reads the role again under those locks when it erases or
deletes or moves a tree (`DeleteList`, `TrashTask`, archive, unarchive, move,
"Supprimer définitivement", "Vider la corbeille"): a revocation committed
while it waited is seen. A read that must not wait on a row the actor may not see (an access
request) takes `FOR SHARE SKIP LOCKED` instead. The known exceptions, answered `500` (`40P01`) by
PostgreSQL aborting one transaction (or a retry of a job batch), are: trees that changed and
are locked in a second pass
(below); and the approval of an access request, which locks its request row `FOR UPDATE` before
the membership of the requester and the space and the list of its target (`GrantRequestedAccess`,
`src/modules/access-requests/MODULE.md`), while a batch of a deletion job holds the tasks, the
list or the space and deletes the pending requests last. The two wait in a cycle only when an
approval read the list live before its deletion committed and reaches its locks after the batch
started, an interleaving that needs the approval to stall for the whole start of the job.

Lock order of a task write:

1. the memberships `FOR SHARE`: the actor, then the people being assigned;
2. the tasks `FOR NO KEY UPDATE`: a single-task write locks by key; an archive or move locks the
   live subtree and the destination parent for a move in one statement by id; an unarchive locks
   only the archive members and the root's parent outside the trash, also in one statement by id;
3. the spaces and lists held for placement or role checks, in the global order. Unarchive holds
   the space `FOR SHARE` and locks the list through `RestoreArchivedList`;
4. the `space_prefixes` row when allocating keys, which serializes the creations of a prefix
   until the commit.

A task write does not lock before it knows the actor may see and change the task: it reads the
task without a lock, checks the visibility of its list and `edit` on it, then locks it and reads
it again, and checks both again when the locked task is in another list (a move committed
meanwhile). An attachment does the same for the new parent. Single-task writes read the role once;
tree writes check it again under the placement locks. A refused subtask creation that inherits its
assignee locks no membership but the actor's. A move or an attachment locks the descendants in
ordered statements until the subtree read under the locks holds nothing unlocked, and carries only
the tasks that are still descendants then; a valid subtree has three levels and at most 650
descendants, which bounds the passes, and a larger one is a defect that answers 500. A subtask
created without `assigneeIds` reads the first assignee of the parent and locks that membership
before the parent; no membership is locked once the parent is, so the order cannot deadlock with a
removal. If the parent was reassigned in between, the subtask keeps the account that was read while
it is still one of the parent's assignees, and is created without assignee otherwise (accepted
race). The removal of a member locks its membership exclusively,
and no space and no task; each task batch of its clean-up job locks up to 500 tasks in ascending
id order in one statement, then reads the copy without lock. A sequential task lock that is not
globally ordered could still meet another writer that holds several: PostgreSQL then aborts one
transaction, and the request answers an error or the batch of the clean-up job is retried. The
412 is checked inside the transaction, after the visibility of the task and the role on its list,
and before the target of a move or an attachment and the domain rules.

An archive locks the membership of the actor `FOR SHARE`, then the live subtree in ascending id,
without checklists, and checks the role again under the space and list locks. The live members are written in one
`UPDATE ... FROM unnest(...)` guarded by each version (the row count checked, a failure naming the
root), with one outbox row per task. A concurrent subtask creation or move under a member either
commits first (the subtask is taken, the moved task is not) or reads the archived task under its
lock and answers `409`. Archive and unarchive return an immediate no-op when the initial read
and version check show the requested archive state already holds. A restoration locates the task
without a lock, then locks the archive members and the root's parent if it is outside the trash,
in one statement ordered by id and without checklists. It then holds its space `FOR SHARE`
and the list (`RestoreArchivedList` of spaces, deciding
on the locked list). Two restorations of
one archive through two members serialize on that statement; the second finds the archive empty
and reads the task again (live: `200` with its version), 3 attempts at most. A root that is no
longer in the list of the task located (the archive was restored, moved and archived again
meanwhile) also reads the task again, so the role is checked on its list as it is now, before
`If-Match`. A concurrent archive of the parent either commits first (the restoration detaches the
root) or waits and takes the restored root with it. The same bound and single update hold for a
restoration, whose answer reads the root again by key, with its checklist, after the write.

The trash follows the global lock order above:

- A deletion locks the membership, then the task with its tree in one ordered pass
  (`TrashTreeLocker`: the tree read in one recursive statement from the task, the task and its
  descendants locked in one statement ordered by id `FOR NO KEY UPDATE` without checklists, the
  tree read again under the locks until it holds nothing unlocked, 5 passes at most), the order of
  a batch of the deletion job; it does not lock the task by key first. Its refusals are checked on
  the task read without a lock, then again on the task as locked (`TaskLocator.confirm`). It
  inserts the entry, writes every task in one `UPDATE ... FROM unnest(...)` guarded by the
  versions (row count checked, a failure naming the entry) and enqueues its job, with one outbox
  row per task. After the tree it holds the space and list `FOR SHARE` and checks the current
  role; a list deleted while it waits is refused. If the tree disappears but the task is live on
  the fallback read, the transaction rolls back and retries the ordered acquisition at most three
  times, releasing any task locks first.
- A restoration locks the membership, the entry `FOR UPDATE` (checked again: there, not handed
  over, same list), every task of the entry `FOR NO KEY UPDATE` in one statement ordered by id
  (`tasks_trash_entry_index`, no checklists), then reads the parent of the root without a lock and
  locks it by `lockStanding` only when it is out of the trash (checked again under the lock), then
  the list (`LockDeletedList`: for a deleted list its space `FOR NO KEY UPDATE`, then the list
  `FOR UPDATE`, which waits for a deletion batch holding it `FOR SHARE`; nothing for a live list),
  checks under it that a deleted list holds no task out of the trash, then
  `RestoreDeletedList`, always called, and, when it brought the list back, checks again under the
  `FOR NO KEY UPDATE` it holds (a list read live had no lock); one bulk update guarded by the
  version of each task under its lock (two versions on for an archived member, restored then
  archived again), one delete of the entry. Two
  restorations, or a restoration and an erasure, of one entry serialize on its row: the second
  finds it gone and answers `trash-entry-not-found`; a job skips it. Rows of two entries (a
  parent in one, its child the root of another): a restoration locks its own entry's tasks and
  never a parent in the trash; an erasure locks its entry's tasks, then (by its detachment,
  `parent_id = null where parent_id = any(...)`) the children outside it, a condition PostgreSQL
  checks again on a row it waited for, so a root restored and detached meanwhile is not touched
  again. Neither waits for the other in a cycle: the erasure holds no list while it detaches.
- An erasure of one entry by a person reads the entry and the role of the person without a lock
  (an entry they may not restore answers at once), then locks the entry `FOR UPDATE` and its tasks
  `FOR UPDATE` ordered by id in one statement, then runs seven set-based statements whatever its
  size (four for the collections and the activity, the detachment, the tasks, the entry) and the
  outbox rows, the root first; once every task is written, one `LockTrashLists` in `erase` for the
  lists of its entries, live or deleted (their spaces `FOR NO KEY UPDATE` in `(created_at, id)`
  order, then the lists `FOR UPDATE` in ascending list id), under which the role of the person is
  read again (a revocation or a space made private while the erasure waited refuses it and rolls
  it back), then one new read of the task rows left in the lists deleted under the locks and, for
  each left without a task, `PurgeDeletedList` (which takes no stronger list lock). Two erasures
  of the last two entries of one list serialize on its row; the second reads the first one's
  deletes and erases the tombstone. An erasure and a deletion of its list serialize on the list
  too. Two deletion batches that both find the list empty serialize on it; the second reads it
  erased (`list-gone`).
- "Vider la corbeille" reads the lists the caller may edit without a lock, locks the entries of
  those lists still in the trash `FOR UPDATE` in one statement by id, then their lists and spaces
  `FOR SHARE` (`LockTrashLists` in `hold`), reads the role of the caller again under them, and
  hands over, in one statement by entry id, the entries of the lists still editable
  (O(entries they may restore)); no task; one `task.purge-trash` enqueued.
- A batch of the deletion job (`TrashDeletedListTasks`) reads up to 50 candidate roots in a range
  of `tasks_list_created_index`, reads the trees of all of them in one recursive statement, takes
  the roots in their order until their trees hold 500 tasks or more, locks every task of those
  trees in one statement ordered by id (`FOR NO KEY UPDATE`, no checklists), reads the trees again
  under the locks (a task that joined meanwhile is locked in one more statement), checks each root
  again (in the list, out of the trash, read as top-level), then holds the list `FOR SHARE` (tasks,
  then lists): a list no longer deleted writes nothing (`list-live`, or `list-gone` for an erased
  one); a restoration of an entry of the list waits for the job to finish, so only a list restored
  after its job is seen live. With no candidate left, the batch locks no task: it locks the list
  first in the modes of the erasure of its tombstone (`LockDeletedList`: its space
  `FOR NO KEY UPDATE`, then the list `FOR UPDATE`, never a shared lock it would strengthen later)
  and answers `list-live` or `list-gone` unless it is still deleted, `rescan` when the list still
  holds a task out of the trash, so the checks of the tasks left and the erasure of the tombstone
  (`PurgeDeletedList`) run under those locks. A batch of the purge (`PurgeTrashBatch`) locks up to
  20 entries `FOR UPDATE SKIP LOCKED` (handed over first, else due, oldest first) and erases at most
  500 tasks. For part of an oversized entry it orders the remaining forest breadth-first and
  locks the selected rows and all surviving rows with references into that part by id. It appends
  the events, detaches the surviving references and updates the count in the transaction that
  erases the selected rows. The number of detached rows can exceed the erasure limit. The final batch
  removes the entry and erases tombstones as a person's erasure does,
  without a role (`LockTrashLists` in `erase` with no viewer). A creation or a move holds its target
  list after its task locks and before the key counter, so a deletion of the list either committed
  first or waits for it and its job moves the new task too; a move to another list holds the list
  it leaves and the target in ascending list id, and an attachment to a parent in another list holds
  the list it leaves (`HoldList`), so a deletion of that list either committed first
  (`task-not-found`) or waits; a new subtask and an attachment lock their parent, which the job
  locks too.
- A tree that changes while the first statement acquires locks may require another ordered pass.
  That pass can overlap with another writer on a nested tree. PostgreSQL aborts one transaction
  on a deadlock (`40P01`), and the job runner can retry a failed batch.

Reads (`GET` routes) run in read-only transactions without locks (see above). The tasks of a list,
the groups, the counters of a list, the labels and "Mes tâches" read each statement as committed
when it started (the page and the total of a list are two statements); the overview and "Accueil"
run on one snapshot (`REPEATABLE READ`), so that their counters agree with each other. The
statements of a route do not depend on the page size or on the size of the organization: the tasks
of a list 6 to 11 (the summaries are skipped for an empty page), the groups 5 (the groups and the
total of the assignees come from one statement), the counters of a list 5, the overview 4, the
labels 3, "Mes tâches" 9, "Accueil" 12 (control statements of the transaction not counted). These
counts were taken in P3a, before grants. `FindVisibleList`, which every route of a list or a task
calls once per list it checks (the target of a move and the list of a new parent are lists too),
is now 3 or 4 statements: the list, its space and the prefix counter of `nextKey`, plus the read of the grants
of the actor, skipped when the rule of the organization or the ownership of the space already
gives `edit`; so such a route sends at most one statement more per list checked. The cross-list
routes call `ListVisibleListIds` where they called `ListVisibleSpaceIds` (its statements: spaces
MODULE.md). The access check is the copy of the memberships, one read of the task and
`FindVisibleList`: 5 or 6 statements. The archives pages run in one read-only snapshot
(`REPEATABLE READ`): the tab "Tâches" reads the copy, `ListVisibleListIds`, the page of roots
(`tasks_archive_root_index`, the lists of the actor a filter of its rows) with the five statements
of its summaries, the total, the member counts and `FindVisibleLists` for the lists of the page;
the tab "Listes" reads the copy, `ListArchivedLists` of spaces and one grouped count of the live
top-level tasks of the lists of the page.

What a request costs, per route (what grows with the data, whatever the page size; the numbers are
the medians of five calls through HTTP on the 75,000 tasks of `tests/task-queries.int-spec.ts`):

- Tasks of a list: O(tasks of the list) for the total and for every sort but the creation order,
  at every depth; the creation order reads about `limit` rows through the index. The large list
  (20,000 top-level tasks) answers in 19 ms (creation order), 40 ms (`dueDate`, `priority`), 85 ms
  (`name`), 125 to 130 ms (`search`) and 80 ms (`assignee=me,none`); Sprint 14 in 8 to 16 ms.
- Groups and counters of a list: O(tasks of the list), one statement each (16 to 36 ms on the large
  list, 8 to 10 ms on Sprint 14). The groups of the assignees are one grouped scan of the tasks
  joined to their assignees, with the total as an extra grouping set.
- Overview: O(tasks of the space) whatever `limit`: it reads every list of the space the actor has
  a role on whole, counts the tasks of all of them and slices the page in memory; `listCount` and
  `taskCount` are counted again on every page (29 ms for the space of the large list).
- Labels: O(label rows of the visible tasks), whatever `limit`, `search` or `cursor`: a join of
  `task_labels` and `tasks` grouped by label key (31 to 48 ms at 75,000 tasks), the fold running
  once per distinct key. Page 2 and a search cost the same as page 1.
- "Mes tâches" and "Accueil": O(assignments of the actor), lifetime ones included (the hash join of
  the assignments with their tasks; 50 to 80 ms for 10,006 assignments), "Accueil" doing it for the
  stats and the seven tasks and calling two spaces reads. A person with many assignments reads the
  whole `tasks` table, other organizations included, by that hash join, the choice of the planner
  by selectivity (about 10,000 of 104,278 rows: a Seq Scan, 4,100 buffers, 15 to 23 ms; the plans
  it refuses cost more: a bitmap scan, 3,750 buffers, 16 to 31 ms, a probe per assignment, 39,350
  buffers), the same in the shapes of P3a, P3b-1 PR 1 and PR 2; a person with about 100
  assignments probes `tasks_pkey` (437 buffers, 0.3 to 0.5 ms).
- The archived tasks of a list (`tests/archive-queries.int-spec.ts`): the first page in creation
  order of a list also reads, in `tasks_list_created_index`, the archived tasks older than its
  oldest live one (2,664 buffers, 0.75 ms with 6,000 archived tasks). Archived subtasks accumulate
  under a live parent, with no limit (the 25 count live subtasks only): the subtask reads and counts
  of the parent read them and filter them out after the heap fetch (`sameArchiveAsParent`).
- Archives: the tab "Tâches" reads a page of about `limit` roots by the walk of
  `tasks_archive_root_index` (5 to 7 buffers), and its total is O(roots the actor sees) (593
  buffers, 3.7 ms at 12,310 roots); the tab "Listes" has a total O(archived lists the actor sees)
  (spaces MODULE.md) and its `taskCount` is one grouped statement for the lists of the page.
- An archive or a restoration of a full tree, 651 tasks: one bulk update and 651 outbox appends of
  two round trips each, in one transaction (measured through HTTP by `tests/archives.int-spec.ts`:
  1,326 statements and 946 ms for the archive, 1,327 statements and 1,017 ms for the restoration,
  1,302 of them the outbox appends, on one connection), and
  up to 651 row locks held until the commit; a concurrent writer of one of them waits up to its 5 s
  `lock_timeout`, then answers `500` (`55P03`).
- The visibility filter of the cross-list statements (the labels page, the "Mes tâches" page and
  counts, the "Accueil" stats and tasks, the activity of a list and its total) is
  `tasks.list_id = ANY($listIds)`: one array parameter of every list of the organization the actor
  has a role on, unbounded (O(those lists)), each candidate row tested against it once. It
  replaced `tasks.space_id = ANY($spaceIds)` of P3a, a list being finer than a space. The plans and
  numbers above were measured with the space filter. With an array of 1,426 list ids on 30,000
  tasks (`tests/access.int-spec.ts`): the "Mes tâches" page and counts and the "Accueil" stats
  hash-join the 3,000 assignments of the member (`task_assignees_user_index`) with a Seq Scan of
  `tasks`, 1,221 buffers, 7 to 9 ms, as in P3a; the labels page reads `task_labels` and `tasks`
  whole, 1,330 buffers, 24 ms, as in P3a; the page of the activity of a list walks
  `activity_entries_list_index` with `tasks_pkey`, 36 buffers, 0.2 ms, and its total hash-joins
  the entries of the list with a Seq Scan of `tasks`, 1,033 buffers, 9 ms for 5,005 entries
  (O(tasks of the organization)).
- Every route that sorts or searches in SQL pays the fold of the name per row; the fold takes the
  short path for ASCII text.

The application role runs under a 10 s `statement_timeout` (and a 5 s `lock_timeout`): a query that
exceeds it is cancelled by PostgreSQL (SQLSTATE `57014`, "canceling statement due to statement
timeout") and the route answers `500 internal.unexpected`; a `57014` in the completion line of a
request therefore means a costly list query (a large list with a search or an unselective sort),
not a defect of the request. Only the statement is bounded: a request that sends several statements
can hold its connection longer than 10 s. The server span of a request carries its query string
(`url.query`: the `search` text, the labels) when OTLP is configured, because the
`startTelemetry` of `@cadenway/nest-common` passes no `redactedQueryParams`: a gap of
cadenway-service-kit, to be reported there.

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
- The effective role on a list is computed by the spaces module (decision 2 of P3b-1) and carried
  on each list it answers (`callerRole`); the rule that a task write needs `edit` on its list is a
  policy of this domain (`canWriteTasksOf`, "Who sees a task" of `openapi/public/tasks.yaml`),
  which `TaskEditGuard` applies for the locator, the creation and the move planner. The module
  keeps no copy of a grant. The cross-list reads filter `tasks.list_id`, not `tasks.space_id`: a
  list closed to the organization, or shared with a guest, is finer than its space, so the module
  no longer short-circuits a guest itself.
- The role on the list of the task is checked before `If-Match` (`404` → `403` → `409` → `412`). On a move
  or an attachment, a stale `If-Match` answers `412` before the `403` of the list the task goes to
  or of the list of the new parent: the contract gives no order between them, and the version of
  the task is checked first, as in P3a, where the target came after `If-Match`. The target is then
  checked as a whole: `422` when unseen, then `403` without `edit`. A patch that would change
  nothing still needs `edit`: the role is checked before the patch is applied.
- `role-insufficient` carries the role of the actor on a list, never `null`: the tasks routes act
  on lists only, and a list the actor has no role on is not found.
- The access check reads the task without its collections (`TaskReader.locationByKey`, one
  statement) rather than through `TaskLocator`, which loads the assignees, labels and checklist of
  the task, then goes through `FindVisibleList` for its list like every route of a task: the
  list, its space, the grants read when the rule of the organization or ownership does not give
  `edit`, and the prefix read of `nextKey`, which the check does not use (a dedicated spaces entry
  without the space view would save that statement; not needed at this cost).
- `FindTaskReferences` leaves out an id that is not a UUID rather than letting the `uuid[]` cast
  fail the transaction of the caller, and throws above 100 ids (a page of access requests).
- `PATCH /tasks/{taskKey}` requires `If-Match` whenever the body names `description`, also with
  `null` or the value the task has, and `*` satisfies it (open questions 5 and 16 of the design:
  the description is stored as sent).
- A subtask created without `assigneeIds` inherits the first assignee of
  its parent, and is created unassigned when that person is no longer an eligible member.
- The coalescing window is sliding and compares with the latest entry of the same kind whoever wrote
  it, so a change by another actor breaks the chain; an entry written with a move in the same patch
  records the list after the patch. A cursor walked across a merge may skip or repeat the merged
  entry, whose position moved.
- Except for tree writes and restoration, no lock on the space in a task write: a status hidden, a prefix changed or a space made private
  concurrently with a write is accepted (the key stays unique and under a prefix of the space).
- `PUT /assignees/{userId}` has a body, the empty object of the contract (`AssignTaskBody`): it is
  validated, so a missing body or an array answers `400`, and not read. The generated schema is not
  strict, so the members of an object body are dropped; making it strict is a change of the
  contract.
- Archives (decision 6 of the P3b-1 brief): the live condition is one mapper (`liveTask`,
  `archived_at is null`) that every collection statement uses, so the trash of a later version
  narrows it in one place; the subtask reads use the same-archive rule instead, by a join on the
  parent's primary key. `Task.requireChangeable` decides the `409` (the domain refuses every change
  of an archived task but the removal of a member), checked by `TaskLocator` on the locked task
  after the role and before `If-Match` (`LocateRequest.archived`: `refuse` for the writes,
  `allow` for the reads, the archive and the restoration). The archive and the restoration are
  set-based (one update for up to 651 tasks), not one `save` per task, and write no activity.
- The restoration answers the root, as the contract says, and checks `If-Match` on the task of the
  path. It always hands the list of the root to spaces (`RestoreArchivedList`), which locks it and
  restores it when it is archived, or answers `not-archived`: the decision is made on the locked
  list, not on the list read before the locks. A list archived after that lock waits for the commit
  and then holds the restored task (an archived list holds live tasks). A refusal of spaces (a
  grant withdrawn meanwhile) answers `404` or `403`.
- The root of an archive reads as detached while its parent is in another list (decision of the
  P3b-1 PR 2 review, beyond the contract): a move carries the live subtree only, so the live parent
  of an archived root may move away, and showing it would give a viewer of the list of the root the
  key, the name and the status of a task of a list they may not see. Reading the root as its
  restoration will leave it keeps "a subtask is always in the list of its parent" true in every
  answer. It is decided where the parent is read for a view (`showsParent`: the summaries, the
  view of a task, the reference of the detail), never in the domain state, which keeps the parent
  for the restoration. Question to report to cadenway-api-contracts: say it in `Task.parentKey`,
  `TaskSummary.parentKey` and the `parent` of the detail.
- The audit trail of an archive: while a task is archived its row says when, by whom and from
  which root (`archived_at`, `archived_by_type`, `archived_by_id`, `archive_root_id`); a
  restoration clears them and leaves nothing in the row (tasks have no `restored_at`). The events
  `task.archived.v1` and `task.unarchived.v1` name the actor and the `rootKey`, and are kept 7 days
  in the outbox and in the stream `EVENTS`. A durable trail is an open point.
- `SpaceDirectory.restoreArchivedList` takes the viewer, whose account is the actor of
  `list.unarchived.v1`, rather than a separate actor id: the routes act for the member only.
- The archives pages run in one snapshot so the page, the total and the counts agree; the cursor
  carries the archive instant and the id (`(archived_at desc, id desc)`), fingerprinted with the tab.
- The activity instant and `updatedAt` are the instant the transaction started (`now()`), taken
  once per run and truncated to the millisecond as the outbox stamps `occurredAt`, so the
  `archivedAt` of an archive is the `occurredAt` of its events. The clock is one copy per module
  (tasks, spaces, access-requests), the three truncating alike. A writer that waits for a lock keeps the instant it started with, so two changes of
  one task can commit in the reverse order of their instants; the version still orders them. This is
  accepted, and the 60-second coalescing compares the same instants.
- Trash (decisions 7 to 11 of the P3b-1 brief, as the review fixed them; beyond the contract): a
  deletion takes the archived subtasks of its list with their ancestor ("a task and its subtasks
  at every level"), and a subtask deleted before keeps its own entry; an archived task keeps its
  archive in the trash and comes back archived (the archives leave it out meanwhile), so the
  25-subtask and 3-level limits hold after a restoration; a task whose parent is in the trash
  reads as detached, as for a parent moved away, so a task in the trash never shows through a
  collection; the removal of a member unassigns a task in the trash without `task.updated.v1` (a
  consumer dropped it at `task.trashed.v1`, and `task.restored.v1` carries the assignees), so its
  `task.purged.v1` can come more than one version after its `task.trashed.v1` (the contract says
  "one more": to report to cadenway-api-contracts); an entry of a list whose deletion job is still
  moving its tasks cannot be restored until the job finished (`409 trash-entry.not-restorable-yet` when `reportNotReady=true`, otherwise `404 trash-entry.not-found`, the
  only refusal the contract declares; to report to cadenway-api-contracts: a code of its own would
  be clearer), so a restoration never exposes the tasks the job has not moved (checked under
  `LockDeletedList`, and again under the lock `RestoreDeletedList` holds on a list it brings back,
  since a list read live is not locked); an archived task restored from the trash comes back
  archived as of the restoration, by the person who restored it (one more version and its
  `task.archived.v1`); the `parentKey` of
  an entry made by the job is the parent as it reads once the batch is in the trash, so a root
  whose parent goes in the same batch reads as detached. `purgeAt` and the due cut-off come from
  one domain policy (`purgeAtOf`, `purgeDueBefore`), the statements compare `trashed_at` with the
  cut-off the application gives. The tasks of a task in the trash answer `task.trashed` from
  `TaskLocator`, which reads the entry and the role of the actor as if not deleted
  (`FindTrashList`) on the unlocked read and again on the locked one.
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
  comparison: `regexp_replace(normalize(translate(replace(replace(casefold(x COLLATE
"pg_unicode_fast"), 'œ', 'oe'), 'æ', 'ae'), 'øłđðħŧı', 'olddhti'), NFKD), <combining marks>, '',
'g')`. The `replace` and `translate` steps fold the letters NFKD leaves whole (`Œuvre` is found by
  `oeuvre` and sorts among the `o`); a text of only ASCII is just lower-cased, and a text without
  one of those letters skips the two steps. It needs PostgreSQL 18 (`casefold`, `pg_unicode_fast`)
  and a UTF8 database, and no extension; `strpos` avoids escaping `LIKE` wildcards. The key of a
  task is ASCII, so the search compares `lower(key)` with the folded text. The application fakes
  fold the same way.
- The cursor of `name` carries the first 128 code points of the folded name, and the cursor of the
  labels the first 128 of the folded key (`SORT_KEY_PREFIX_LENGTH`, one constant of the domain, re-exported
  by the application for the presentation layer, that the order, the cursor validators and the fakes share; the kit refuses a cursor over 2,048
  characters, a name has up to 300 and the fold expands, for example `U+FDFA` into eighteen
  letters). Two names equal on 128 folded code points fall back to the order of the list, two labels
  to the order of their keys.
- The cursor of the groups is `sort = [count]`, `id = value` for the three groupings; the groups
  are all computed on each request (bounded by the statuses, priorities or assignees of one list)
  and sliced in memory, as the overview slices its lists.
- Reversed sorts keep ties in ascending list order, `none` is always present, assignee ties go by
  account, and `dueFrom` after `dueTo` gives an empty result: the contract leaves these open.
- A label that contains a comma cannot be a `label` filter (comma-separated by the contract): to
  report to the contract owner.
- Left as they are, measured and documented: the overview reads every list of its space and slices
  in memory (`taskCount` needs the whole space anyway); the visible list ids go to the labels,
  "Mes tâches", "Accueil" and the activity of a list as one array, unbounded by the number of
  lists of the organization (their plans with an array of 1,426 list ids are in
  `tests/access.int-spec.ts`; the P3a numbers were measured with the space filter);
  `total` is counted again on every page, cursor pages included (the contract gives it on each
  page). The list page and total are separate statements within the same read snapshot.
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
