import type { JobQueueDeclaration } from '@cadenway/nest-jobs/provisioning';

/**
 * Constant CLEAN_UP_REMOVED_MEMBER_QUEUE
 *
 * @description
 * Queue of the clean-up after a member left an organization (`CleanUpRemovedMember` of the
 * member-lifecycle module): the handover of their private spaces, then their unassignment from
 * every task. One job per removal, enqueued in the tenant transaction of `member.removed.v1`, whose
 * payload is the account (and the `traceparent` of the removal, when there is one) and whose
 * occurrence key is the membership and its version after the removal, so the same removal is
 * never enqueued twice.
 *
 * @type {string}
 */
export const CLEAN_UP_REMOVED_MEMBER_QUEUE: string = 'task.clean-up-removed-member';

/**
 * Constant TRASH_DELETED_TASKS_QUEUE
 *
 * @description
 * Queue of the move to the trash of the tasks of a deleted list or space (`MoveDeletedTasksToTrash`
 * of the deletion-lifecycle module): one entry per top-level task and per archive, in bounded
 * batches, with the actor of the deletion, and the pending access requests of the list or the
 * space and of the tasks it moves dropped as it goes. One job per deletion, enqueued by the spaces
 * module in the tenant transaction of the deletion, whose payload is `{ listId }` or `{ spaceId }`
 * (and the `traceparent` of the deletion, when there is one), and whose occurrence key is the list
 * or the space and its version after the deletion, so the same deletion is never enqueued twice.
 *
 * @type {string}
 */
export const TRASH_DELETED_TASKS_QUEUE: string = 'task.trash-deleted-tasks';

/**
 * Constant DROP_TRASHED_TASK_REQUESTS_QUEUE
 *
 * @description
 * Queue of the dropping of the pending access requests of the tasks of one trash entry
 * (`DropTrashedTaskRequests` of the deletion-lifecycle module), enqueued by the tasks module in
 * the tenant transaction of "Supprimer la tâche"; its payload is `{ taskIds }`, the tasks of the
 * entry (its root and every subtask of it, archived ones included, and the `traceparent`), and its
 * occurrence key is the entry; the handler drops only the ids no longer found out of the trash.
 *
 * @type {string}
 */
export const DROP_TRASHED_TASK_REQUESTS_QUEUE: string = 'task.drop-trashed-task-requests';

/**
 * Constant PURGE_TRASH_QUEUE
 *
 * @description
 * Queue of the erasure of the trash of one organization (`PurgeTrash` of the deletion-lifecycle
 * module): the entries "Vider la corbeille" handed over, then those deleted 30 days ago or more,
 * in bounded batches, then the tombstones of the deleted lists and spaces left without a task.
 * Enqueued by the tasks module in the transaction of "Vider la corbeille" (without occurrence key:
 * two jobs of one organization share the work through `for update skip locked`), and by the daily
 * schedule for each organization with something to erase (occurrence key `scheduled:<job id of
 * the schedule>`). The payload holds the `traceparent` only.
 *
 * @type {string}
 */
export const PURGE_TRASH_QUEUE: string = 'task.purge-trash';

/**
 * Constant SCHEDULE_TRASH_PURGE_QUEUE
 *
 * @description
 * Queue of the daily schedule of the purge (`ScheduleTrashPurge` of the deletion-lifecycle
 * module), at 03:00 UTC: a job without organization that finds, in a system transaction, the
 * organizations holding entries to erase, and enqueues one `task.purge-trash` job for each.
 *
 * @type {string}
 */
export const SCHEDULE_TRASH_PURGE_QUEUE: string = 'task.schedule-trash-purge';

/** System-only queue of the minutely intake receipt retention job. */
export const PURGE_INTAKE_RECEIPTS_QUEUE: string = 'task.purge-intake-receipts';

/**
 * Constant jobQueues
 *
 * @description
 * Every queue of this service, given as is to `provisionJobs` (`src/migrate.ts`, as the migrator
 * role) and to `JobsRuntimeModule` (`src/app.module.ts`, as the application role): a queue
 * missing from the database stops the start-up, and a changed declaration reaches the database at
 * the next migration run. Every payload holds ids only.
 *
 * `task.clean-up-removed-member` walks the private spaces of one account in batches of 100, then
 * its assignments in batches of 500, each batch in its own transaction, so a failed attempt keeps
 * the batches it committed and the next one resumes from what is left:
 *
 * - 8 retries with backoff from 10 seconds, capped at 30 minutes: a lock timeout on a space or a
 *   task held by a request is retried within 20 seconds, and the last attempt starts 42 to 72
 *   minutes after the first failure, which outlasts a restart or a short outage of PostgreSQL; a
 *   permanent error (a malformed job) costs that whole schedule before its dead letter;
 * - an attempt is failed after 15 minutes (the default of the kit): the job of 1,200 assignments
 *   finished within 2 seconds of the commit of its removal in `tests/tasks.int-spec.ts`, the poll
 *   of the worker included, so an attempt should cover hundreds of thousands (an extrapolation, not
 *   measured at that size); the handler starts no batch once its signal aborts, and the retry goes
 *   on from what is left;
 * - a job that waited 14 days without starting is deleted (the default) without a dead letter: the
 *   work must not be dropped before an operator could see it;
 * - a finished job is kept 7 days, the retention of `EVENTS`, so a removal requeued while the
 *   stream still holds it finds its occurrence and enqueues nothing;
 * - a job given up becomes a dead letter of `task.clean-up-removed-member.dead-letter`, kept 14
 *   days (the MODULE.md of the member-lifecycle module says what an operator does with it).
 *
 * The four queues of the trash and of the deletions (`task.trash-deleted-tasks`,
 * `task.drop-trashed-task-requests`, `task.purge-trash`, `task.schedule-trash-purge`) take the same
 * settings, for the same reasons: their handlers commit batch after batch (a batch of a deletion or
 * of the purge stops taking roots or entries once it holds 500 tasks: 651 live tasks at most beyond
 * that, plus the archived subtasks of its entries, which the product does not limit), are idempotent, start no batch once their signal
 * aborts and resume from what is left; their dead letters are described in the MODULE.md of the
 * deletion-lifecycle module.
 * Intake receipt cleanup uses the same retries and deletes batches of at most 500 rows per
 * system transaction. Its next occurrence also picks up receipts skipped by a concurrent writer.
 *
 * @type {readonly JobQueueDeclaration[]}
 */
export const jobQueues: readonly JobQueueDeclaration[] = [
  CLEAN_UP_REMOVED_MEMBER_QUEUE,
  TRASH_DELETED_TASKS_QUEUE,
  DROP_TRASHED_TASK_REQUESTS_QUEUE,
  PURGE_TRASH_QUEUE,
  SCHEDULE_TRASH_PURGE_QUEUE,
  PURGE_INTAKE_RECEIPTS_QUEUE,
].map((name: string): JobQueueDeclaration => ({
  name,
  retryLimit: 8,
  retryDelaySeconds: 10,
  retryBackoff: true,
  retryDelayMaxSeconds: 1_800,
  expireInSeconds: 900,
  retentionSeconds: 1_209_600,
  deleteAfterSeconds: 604_800,
  deadLetterRetentionSeconds: 1_209_600,
}));
