# Deletion lifecycle

## Purpose

Runs the background work of the deletions and of the trash for task-service ("Jobs" of
`openapi/internal/task-service.yaml`; "Erasing" of `openapi/public/trash.yaml`), as the workers of
four job queues and one daily schedule:

- `task.trash-deleted-tasks` (`MoveDeletedTasksToTrash`): after a list or a space was deleted, it
  moves the tasks of each deleted list to the trash, one entry per task that reads as top-level
  with its subtasks at every level, archived ones included (`TrashDeletedListTasks` of tasks), batch
  after batch; it drops the pending access requests of the space, of each list and of the tasks it
  moves (`DropTargetAccessRequests` of access-requests), each in a transaction that read the target
  deleted under its lock; then it erases a deleted space left without a list (`PurgeDeletedSpace`
  of spaces);
- `task.drop-trashed-task-requests` (`DropTrashedTaskRequests`): after "Supprimer la tâche", it
  drops the pending requests of the tasks of the entry that are still in the trash or erased
  (`ListUntrashedTaskIds` of tasks tells the others);
- `task.purge-trash` (`PurgeTrash`): it erases the entries of one organization handed over by
  "Vider la corbeille", then those deleted 30 days ago or more, then the tombstones of the lists
  and spaces left without a task, batch after batch (`PurgeTrashBatch` of tasks);
- `task.schedule-trash-purge` (`ScheduleTrashPurge`): every day at 03:00 UTC, it enqueues one
  `task.purge-trash` per organization with an entry due or handed over
  (`ListOrganizationsWithTrashToPurge` of tasks).

It owns no data, no route, no event and no rule of the trash: the entries, the erasure and the
retention belong to tasks, the tombstones of the lists and spaces to spaces, the requests to
access-requests. A module of its own, like member-lifecycle: access-requests depends on spaces and
tasks, and tasks on spaces, so none of them can call the others for these jobs without a module
cycle; this module depends on the three and none depends on it.

## Public entry points

| Entry point | Consumers |
| ----------- | --------- |
| None        | None      |

## Owned tables

None. The jobs live in the `pgboss` schema of `@cadenway/nest-jobs`, provisioned by
`src/migrate.ts` with the queues of `src/config/job-queues.ts`; the organization of a job travels
in the envelope of the kit, its payload holds ids and the `traceparent` of what enqueued it, never
a name or a message.

| Queue                             | Enqueued by, in the transaction of                     | Occurrence key                                         | Payload                     |
| --------------------------------- | ------------------------------------------------------ | ------------------------------------------------------ | --------------------------- |
| `task.trash-deleted-tasks`        | spaces: `deleteListInternal`, `deleteSpaceInternal`    | `list:<listId>:<version>`, `space:<spaceId>:<version>` | `{ listId }`, `{ spaceId }` |
| `task.drop-trashed-task-requests` | tasks: `trashTaskInternal`                             | `entry:<entryId>`                                      | `{ taskIds }`               |
| `task.purge-trash`                | tasks: `emptyTrashInternal`; this module: the schedule | none; `scheduled:<job id of the schedule>`             | `{}`                        |
| `task.schedule-trash-purge`       | the durable schedule `0 3 * * *`, `UTC`, key `daily`   | none (one job per occurrence)                          | none                        |

## API

None.

## Events emitted

None of its own. Through the outboxes of the other modules, in the transaction of each batch: one
`task.trashed.v1` per task a deletion job moves (with the actor of the deletion, read on the list)
and one `task.purged.v1` per task the purge erases (actor `{ type: 'system', id: 'task-service' }`
for an entry due, the person who emptied the trash for an entry handed over). A dropped access
request and an erased tombstone emit nothing: the contract defines no event for them.

## Events consumed

None. The four queues above, whose jobs the producers enqueue in their own transactions, and the
schedule this module registers.

## Invariants

- Every job runs in the organization of its envelope, lower-cased (`runJobInOrganization` of
  `src/app.module.ts`), except the schedule, which has none; every write to a table of an
  organization runs in a tenant transaction of that organization. The only work across
  organizations is the read of the organizations with trash to erase, ids only, plus a system
  transaction that inserts job rows and nothing else.
- The pending requests of a target are dropped only in a transaction that read the target deleted,
  or in the trash, under its lock: the space in the transaction of `ListDeletedSpaceLists` (space
  `FOR SHARE`, `spaceDeleted`), a list in its first batch that saw it deleted (`trashed` or
  `none-left`, list `FOR SHARE`), the tasks of a batch in that batch, the tasks of an entry under
  the `FOR SHARE` lock `ListUntrashedTaskIds` takes on them, only those it does not find out of the
  trash. A restoration that came first keeps them; one that comes during the drop waits for it.
- A batch of a deletion job moves its tasks to the trash and drops the pending requests of the list
  and of those tasks in one transaction: all commit or none does.
- A deletion job writes nothing in a list that is no longer deleted: a restoration from the trash
  stops it on that list, and the tasks it had not moved yet stay live there. The other deleted lists
  of a restored space still go to the trash.
- Only pending access requests are dropped; answered requests stay, and archived targets keep
  their requests, as the contract stores requests for archived targets.
- The purge erases only entries handed over by "Vider la corbeille" or deleted 30 days ago or more
  (the tasks module decides which), and a tombstone only once no task references it.
- Every job is idempotent: a root moved to the trash is no longer a candidate, an erased entry is
  gone, a dropped request is gone, so an attempt run again resumes from what is left and changes
  nothing once nothing is left.

## Transactions

`DeletionUnitOfWork` owns the tenant transaction of each step of a deletion job and of the job of a
trash entry; the public operations of tasks, spaces and access-requests the step calls join it
(their own units of work run on the same tenant runner), with the outbox rows they append. Their
units of work wake the outbox relay when they resolve, before this transaction commits, so the
events of a batch leave at the next poll of the relay, within a second of the commit.

**The deletion job.** `MoveDeletedTasksToTrash`, for a list or a space:

1. for a space, one transaction: `ListDeletedSpaceLists` holds the space `FOR SHARE`, reads
   whether it is still deleted and its deleted lists not erased yet, by id, O(lists of the space),
   and when it is still deleted `DropTargetAccessRequests` deletes the pending space requests, one
   statement; for a list, the list itself;
2. for each list, batch after batch, from its first root, then after the last root of the previous
   batch (kept in memory by the attempt): one transaction in which `TrashDeletedListTasks` locks the
   trees of its candidate roots and stops adding roots once the batch holds 500 tasks or more (up to
   50 roots; an entry holds at most 651 live tasks plus its archived subtasks, which the product
   does not limit), then holds the list `FOR SHARE`, writes the entries and the tasks; then, in the
   first batch that saw the list deleted, `DropTargetAccessRequests` deletes its pending list
   requests, and in every `trashed` batch the pending requests of the tasks it moved (the adapter
   gives them to `DropTargetAccessRequests` 2,000 at a time, its bound). `list-live` and `none-left` end the list; `none-left` erases the tombstone of the
   list, and of its space, when no task references it any more;
3. for a space not erased by its last list, one transaction: `PurgeDeletedSpace`, which erases it
   when no list row of it is left (`not-empty` while a deleted list of it still holds entries: the
   purge erases both with the last of them).

Lock order within a batch: tasks, then the list `FOR SHARE`, then the access requests (row locks of
the delete). An approval locks its request, then the list it grants on, but only after it read the
list live (`FindAccessTarget`), which a deleted list held by the batch is not: the two never wait for
each other in opposite orders. A pending request an answer holds makes the delete wait 5 s at most
(the lock timeout of the application role), then it is answered and stays.

**The job of a trash entry.** `DropTrashedTaskRequests`: one transaction, `ListUntrashedTaskIds`
locks the tasks of the entry `FOR SHARE` until the commit and reads those out of the trash, then one
delete of the pending requests of the others (none when the whole entry is out of the trash). Lock
order: the tasks, then the access requests, as in a deletion batch; a restoration of the entry
locks its tasks first, so it waits for the drop, or the drop waits for it and reads the tasks back
out of the trash. The adapters give the tasks to both operations 2,000 at a time (their bound): an
entry holds at most 651 live tasks and the archived subtasks of its root, which the product does
not limit.

**The purge.** `PurgeTrash` calls `PurgeTrashBatch` until `none-left`, each batch in a tenant
transaction of its own: up to 20 entries, `for update skip locked`, until 500 tasks or more, with
their assignees, labels, checklist items and activity, set-based. Two purge jobs of one
organization (an emptied trash and the schedule) share the entries through the skipped locks: a
batch skips the entries the other job holds, so no entry is erased twice.

**The schedule.** `ScheduleTrashPurge` pages `ListOrganizationsWithTrashToPurge` by id, 1,000 at a
time, each page in a read-only system transaction of the tasks module (the only cross-organization
read), then enqueues the page in one system transaction of `TrashPurgeScheduleUnitOfWork`
(`SystemTransactionRunner` of the kit, `JobProducer.enqueue({ client, organizationId }, …)` per
organization, ids lower-cased), which inserts job rows only, until a page shorter than 1,000. The
key `scheduled:<job id>` makes a retried occurrence enqueue nothing for the organizations its first
attempt enqueued while their jobs are kept (7 days after they finished); an organization already
purged by an earlier job of the day gets a job that finds `none-left`.

**Retries.** An attempt is failed after 15 minutes (`expireInSeconds` 900 of the queue), or at a
shutdown past the 8 s `shutdownTimeoutMs` of the runtime; its signal then aborts, and every use case
starts no step after it. A crashed attempt (the process died) stays active until those 15 minutes
passed, then the supervision of the runtime fails it and the job is retried, silently: no line is
logged for that attempt. A failed step rolls back alone: the steps before it stay committed, the
attempt fails with a `DeletionStepError` naming the step (`lists`, `tasks`, `space`, `requests`,
`purge` or `schedule`) and the batches committed before it, the error of the step as its `cause`,
and pg-boss retries the job 8 times with backoff from 10 s, capped at 30 min (the settings of
`src/config/job-queues.ts`). The message of a `DeletionStepError` holds no SQL text and no
parameter: a database error is described by its PostgreSQL message and SQLSTATE ("canceling
statement due to lock timeout (SQLSTATE 55P03)"), the message of a data exception (class 22) left
out, never by the message of the `DrizzleQueryError` that wraps it. A permanent error (a malformed
job, a defect) costs that whole schedule before its dead letter, kept 14 days in
`<queue>.dead-letter`. A job that waited 14 days without starting is deleted without a dead letter.
The runtime of the jobs keeps its pool of 2 connections beside the 5 of the application.

**Signals for operators.** The kit logs each failed attempt once (`JobsService`: a warning while it
will be retried, an error on the last attempt, naming the dead-letter queue), with the job id, the
queue, the attempt and the error, never the payload; pg-boss stores that message with the job and
its dead letter. The span `process <queue>` of the attempt records the `DeletionStepError` and the
attributes `deletion.step` and `deletion.batches`. A finished job logs, inside its span (so the line
carries its trace), with its job id and attempt, `deleted tasks trash job handled` (the kind of
target, the outcome `completed` or `list-live`, `entries`, `tasks`, `requestsDropped`,
`listsPurged`, `spacePurged`, and `batches`: the batches of tasks committed, `trashed` ones, without
the closing call of each list, the read of a space or its erasure), `trashed task requests job
handled` (`tasks`, `untrashed`, `dropped`), `trash purge job handled` (`entries`, `tasks`,
`listsPurged`, `spacesPurged`, `batches`: the batches that erased something) or `trash purge
schedule job handled` (`organizations`, `enqueued`, `pages`); no id of a list, a task or a person.
The dead-letter watch of the runtime logs an error with the count of retained dead letters every
60 s while a queue holds one, once per replica (each replica sees the same stock). Start-up fails
with `JobsNotProvisionedError` while the `pgboss` schema, a grant or one of the queues is missing:
run the migration container (`node dist/migrate.js`), which provisions them. Not covered: readiness
does not cover the job runtime; no metric counts the waiting jobs or the lag; a missed occurrence
of the schedule (no replica running at 03:00 UTC) is not caught up, and the next one takes what is
due. As the migrator role, the schedule, the jobs waiting and their lag:

```sql
select name, key, cron, timezone, updated_on, last_job_id
  from pgboss.schedule where name = 'task.schedule-trash-purge';
select name, state, count(*), min(created_on) as oldest, max(retry_count) as most_retries
  from pgboss.job
 where name in ('task.trash-deleted-tasks', 'task.drop-trashed-task-requests',
                'task.purge-trash', 'task.schedule-trash-purge')
   and state in ('created', 'retry', 'active')
 group by name, state order by name, state;
```

A row in `created` older than a few minutes means no replica polls the queue; an `active` row older
than 15 minutes is an attempt the supervision will fail.

**Rollback.** A release before these workers has no worker for the four queues and does not
declare them: their jobs wait in the `pgboss` schema (deleted after 14 days without a dead letter),
the schedule row stays (the start-up of that release warns about a stored schedule whose queue it
does not declare), and that release shows the deleted lists and spaces and the tasks in the trash
as live, since it reads neither (the tasks module documents the rollback of
`migrations/0007_trash.sql`). Roll forward instead; a release with the workers resumes every waiting
job from what is left.

**What an operator does with a dead letter.** Every dead letter is an incident: the tasks of a
deleted list stay out of sight but out of the trash, pending requests of a deleted target stay
(hidden, since the target is not found), or due entries stay in the trash past their `purgeAt`. As
the migrator role, which owns the `pgboss` schema (the statements of member-lifecycle, checked
against pg-boss 12.38), with `$queue` one of the four queues:

1. Read the dead letters, their error and what they concern:

   ```sql
   select id, source_id, created_on, source_retry_count, source_output,
          data ->> 'organizationId' as organization_id, data -> 'payload' as payload
     from pgboss.job
    where name = $queue || '.dead-letter'
    order by created_on;
   ```

   Check what is left, as the migrator role, `$1` the organization, after this in the same
   transaction: `select set_config('app.system_access', 'on', true)`.

   ```sql
   -- task.trash-deleted-tasks: the tasks of the deleted list (or of the deleted lists of the space) not in the trash
   select count(*) from tasks t join lists l on l.organization_id = t.organization_id and l.id = t.list_id
    where t.organization_id = $1 and t.trash_entry_id is null and l.deleted_at is not null
      and (l.id = $list_id or l.space_id = $space_id);
   -- task.trash-deleted-tasks and task.drop-trashed-task-requests: the pending requests left
   select count(*) from access_requests
    where organization_id = $1 and state = 'pending'
      and ((target = 'task' and target_id = any($task_ids::uuid[]))
        or (target = 'list' and target_id = $list_id)
        or (target = 'space' and target_id = $space_id));
   -- task.purge-trash: the entries handed over or due
   select count(*) from trash_entries
    where organization_id = $1
      and (purge_requested_at is not null or trashed_at <= now() - interval '30 days');
   ```

   A dead letter of `task.schedule-trash-purge` concerns every organization: the next occurrence
   enqueues what is due, since the entries are the source of truth.

2. Fix the cause, then replay. While the failed original is kept (7 days after its last attempt),
   give it one more attempt, as `retry()` of pg-boss does:

   ```sql
   update pgboss.job
      set state = 'retry', retry_limit = retry_limit + 1, completed_on = null,
          start_after = pgboss.job_now(), keep_until = pgboss.job_now() + interval '14 days'
    where name = $queue and id = $source_id and state = 'failed';
   ```

   Once the original is gone, enqueue the same envelope again under its occurrence id, with the
   settings of the queue (it inserts nothing while the original is kept):

   ```sql
   insert into pgboss.job (id, name, data, policy, retry_limit, retry_delay, retry_backoff,
          retry_delay_max, expire_seconds, deletion_seconds, keep_until, dead_letter)
   select d.source_id, q.name, d.data, q.policy, q.retry_limit, q.retry_delay, q.retry_backoff,
          q.retry_delay_max, q.expire_seconds, q.deletion_seconds,
          pgboss.job_now() + q.retention_seconds * interval '1 second', q.dead_letter
     from pgboss.job d join pgboss.queue q on q.name = $queue
    where d.name = $queue || '.dead-letter' and d.id = $dead_letter_id
   on conflict do nothing;
   ```

   Every job resumes from what is left.

3. Once the job completed, delete the dead letter, so that the watch stops reporting it:

   ```sql
   delete from pgboss.job where name = $queue || '.dead-letter' and id = $dead_letter_id;
   ```

## Decisions

- The jobs of the trash belong to an orchestrator, as the clean-up of a removed member does
  (decision of the coordinating session for P3b-1 PR 3): the deletion job crosses three modules,
  and the tasks and spaces modules expose one batch per call, own no worker and enqueue through
  their own job ports in the transactions of the deletions, of "Supprimer la tâche" and of "Vider la
  corbeille".
- The pending requests of a deleted target are dropped by the jobs, not in the transaction of the
  deletion ("its pending access requests ... are dropped" of `deleteListInternal` and
  `deleteSpaceInternal`): a deletion stays O(lists of the space) whatever the requests, and the
  requests are hidden from the commit on, since the target is no longer found. Review fix of PR 3
  (security): each is dropped in a transaction that read its target still deleted or in the trash
  under its lock, so a restoration that came before the job keeps the requests of what it brought
  back; the space drops its space requests only, each list its own list requests. The job of a
  trash entry reads its tasks under a `FOR SHARE` lock (`ListUntrashedTaskIds`, follow-up review of
  PR 3), so a restoration and the drop are serialized on the tasks, the tasks before the access
  requests in both: a request is dropped only for a task still in the trash at the commit.
- The schedule runs once a day at 03:00 UTC under one key, registered by every replica at start-up
  (the same row, one job per occurrence): the entries are due by `trashed_at`, so the hour only
  sets when the erasures of the day run, and an entry can stay in the trash up to a day past its
  `purgeAt`. It enqueues one purge job per organization rather than erasing across organizations,
  so every erasure runs in a tenant transaction under row-level security; its enqueue is a system
  unit of work of its own (`TrashPurgeScheduleUnitOfWork`) that inserts job rows only.
- The space of a space deletion is erased at the end of its job only when no list row is left (a
  space deleted without lists, or whose lists held no task); otherwise the purge erases it with the
  last entry of its lists.
- The error of a failed step describes a database error by its PostgreSQL message and SQLSTATE,
  recognized by its shape as the logging of the kit does, so that neither the log line of the kit,
  nor the output pg-boss stores with the job and its dead letter, nor the span carries SQL text or
  parameters (review fix of PR 3, observability); the original error stays the `cause`, in the
  process only.
- `tests/trash.int-spec.ts` is the contract test of the payloads of the four queues: every producer
  (the deletion of a list and of a space, "Supprimer la tâche", "Vider la corbeille" and the
  schedule) runs through the real worker of this module on PostgreSQL, and the spec asserts that
  no job is left failed and no dead letter is left.
- Not proven here: the statements, the locks and the plans of the batches (the integration suite
  of the test writer, `tests/`); the unit specs prove the order of the steps, the transactions of
  the batches and of the drops, the stops, the `DeletionStepError` of a failed step and its message
  without SQL, the handlers, the payload validation, the trace and the log inside the span, the
  schedule and the occurrence keys.
