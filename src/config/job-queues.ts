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
 * @type {readonly JobQueueDeclaration[]}
 */
export const jobQueues: readonly JobQueueDeclaration[] = [
  {
    name: CLEAN_UP_REMOVED_MEMBER_QUEUE,
    retryLimit: 8,
    retryDelaySeconds: 10,
    retryBackoff: true,
    retryDelayMaxSeconds: 1_800,
    expireInSeconds: 900,
    retentionSeconds: 1_209_600,
    deleteAfterSeconds: 604_800,
    deadLetterRetentionSeconds: 1_209_600,
  },
];
