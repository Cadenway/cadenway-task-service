# Member lifecycle

## Purpose

Follows the members of each organization for task-service: it consumes `member.joined.v1`,
`member.role-changed.v1` and `member.removed.v1` of organization-service and, for each event, in one
tenant transaction:

- applies it to the copy of the memberships (`ApplyMembershipChange` of organization-members);
- for a removal, enqueues the `task.clean-up-removed-member` job, which runs after the commit: it
  hands the private spaces the former member owned to the owner of the organization
  (`HandOverPrivateSpaces` of spaces), or leaves them awaiting an owner while the copy does not
  hold that owner, then removes the member from the assignees of every task, closed tasks included
  (`UnassignRemovedMember` of tasks), batch after batch (`CleanUpRemovedMember`);
- for a join or a role change that gives the role `owner`, hands the spaces awaiting an owner to
  that owner (`HandOverAwaitingSpaces` of spaces).

It owns no data, no route and no event of its own, and one job queue,
`task.clean-up-removed-member`, with its dead-letter queue (`src/config/job-queues.ts`). A module of its own rather than a part of
organization-members: the spaces and tasks modules read the copy, so the copy cannot call
them without a module cycle; this module depends on all of them and none depends on it.

## Public entry points

| Entry point | Consumers |
| ----------- | --------- |
| None        | None      |

## Owned tables

None. The copy belongs to organization-members, the spaces to spaces, the tasks to tasks. The jobs
live in the `pgboss` schema of `@cadenway/nest-jobs`, provisioned by `src/migrate.ts`; their
payload holds the account id and the `traceparent` of the removal, the organization travels in the
envelope of the kit.

## API

None.

## Events emitted

None of its own. The clean-up job appends, through the outboxes of the other modules and in the
transaction of each of its batches, one `space.updated.v1` per private space it hands over
(`changed: ['ownerUserId']`) and one `task.updated.v1` per task it changes
(`changed: ['assigneeIds']`), both by the actor `{ type: 'system', id: 'task-service' }`. The
handover of the awaiting spaces to an arriving owner appends `space.updated.v1` in the transaction
of the event.

## Events consumed

| Event                    | Durable consumer                            | Effect                                                      |
| ------------------------ | ------------------------------------------- | ----------------------------------------------------------- |
| `member.joined.v1`       | `task-service__project-member-joined`       | Applies the join; an owner receives the spaces awaiting one |
| `member.role-changed.v1` | `task-service__project-member-role-changed` | Applies the role change; the same for the role `owner`      |
| `member.removed.v1`      | `task-service__project-member-removed`      | Applies the removal and enqueues its clean-up job           |

- One durable pull consumer of `EVENTS` per event, filtered on its `evt.` subject, registered by
  `MemberEventsHandler`. The names, the filters and `service: 'task-service'` are the ones
  organization-members registered before them, unchanged when the handler moved here: the durable
  consumers on the broker are the same, with their position. Each starts with the default
  `deliverPolicy: 'all'`: the contract (`asyncapi/organization-service.yaml`, "Memberships")
  requires a consumer that keeps a copy to read the whole history the stream holds, and every
  effect is in this database, ordered by version and applied once per event id, so reading again
  is harmless. `'new'` would leave out every member who joined before the first deployment.
- Grants: the `task` NATS user may create, read, pull from and acknowledge on these three
  consumers only, by their exact names and filters
  ([cadenway-ops#30](https://github.com/Cadenway/cadenway-ops/pull/30),
  `compose/nats/nats-server.conf`, copied into `compose.dev.yaml`). A renamed handler, or one that
  consumes another event, is a new consumer: its grant reaches cadenway-ops and every environment
  before the release that adds it, which otherwise fails at start-up. No second consumer may take
  the same filter.
- One unit: the deduplicator of `OutboxModule` runs each delivery in the tenant transaction of the
  organization of its envelope and records `(consumer, event id)` in `processed_events` there;
  `ApplyMemberEvent` runs in its own `MemberEventUnitOfWork`, which joins that transaction, and the
  copy, the clean-up job of a removal (or the handover of the awaiting spaces to an arriving owner,
  with its outbox rows) and the processed id commit together. A transient failure (the database
  unavailable, a lock timeout) rolls the whole unit back, the change of the copy and the job
  included, and the event is redelivered on the schedule below.
- A removal always commits and touches no space and no task (decision revised by the coordinating
  session for P3a, then again in PR 2: a revocation must never wait for cleanup). It writes the copy
  and one job row, so its cost does not grow with what the member owned; the job does the work
  afterwards, in batches. Until the job reaches a private space, the space stays owned by a person
  who is no longer a member, so nobody sees it, the owner and the admins of the organization
  included (fail closed); until it reaches a task, the task still lists the former member among its
  assignees (the MODULE.md of tasks has the note for the contract). An owner of the organization
  unknown to the copy (its `member.joined.v1` has not arrived, or the copy is incomplete) is not a
  failure: the job leaves the private spaces of the former member awaiting an owner
  (`spaces.awaiting_owner`), seen by nobody, the former owner included, and logs once the warning
  "A removed member owned private spaces while the owner of the organization is unknown: they
  await an owner." with the job id (no personal data). The `member.joined.v1` or
  `member.role-changed.v1` that makes someone owner hands them over in its own transaction
  (`space.updated.v1`, `changed: ['ownerUserId']`, actor `system`). Check:
  `organization_members` of that organization has no row with the role `owner` and no
  `removed_at`. Remedy: have organization-service requeue the `member.joined.v1` of the owner
  (`requeueOutboxEvents`).
- Order: the three events travel on three subjects and arrive in any order; the copy applies them
  by the version of the membership (organization-members). Each batch of the job reads the copy
  after its locks: it changes nothing, and the job stops for good, while the account is a member again
  (a re-join, or a removal of an old membership that arrives after a new join), and it is
  idempotent, since a space or a task it processed leaves what the next batch reads.
- Redelivery schedule, shared by the three consumers (decision 3 of the P2b security follow-ups,
  the schedule of the security projections, which the memberships module of identity-service
  documents too): 1 s, 5 s, 30 s, 2 min, 10 min, 30 min, then every hour, 32 deliveries. The 31
  failed deliveries wait 92,556 s, about 25 h 43 min, before the dead letter, against 2 min 36 s for
  the default of the kit: a role change or a removal given up would leave a member with access it
  lost. `memberEventsRedeliveryProvider` binds it to `MEMBER_EVENTS_REDELIVERY`; the kit sets
  `max_deliver` 32 on each durable consumer and refuses at start-up a schedule that would not end
  within half the seven-day retention of `EVENTS`.
- Limits of that schedule, which the kit does not check: a waiting message is among the oldest of
  `EVENTS`, which drops its oldest messages first past its 1 GiB cap, so a removal dropped while it
  waits is lost without a dead letter; each waiting message counts towards the 1,000
  unacknowledged messages of its consumer. A failure that cannot pass by itself (a
  `MembershipMismatchError` of the copy) also waits the whole schedule before its dead letter. The
  kit logs each failed delivery as a warning naming the consumer, and its `errorClass` is a fixed
  category (`Error` for every failure of the modules or of PostgreSQL), so a warning does not tell
  a defect from an outage: warnings that go on once PostgreSQL answers point at a defect of the
  events. The warning carries no organization: the kit writes it outside the context of the event.
- Signals for operators, outside this service: the warnings `event handler failed: will retry` and
  `event handler timed out: will retry` (a `HandlerTimeoutError`: the delivery went past the 25 s
  `handlerTimeoutMs` of the kit and was abandoned and rolled back) of these three consumers; the
  warning `The removal of a member failed.` of this service, once per failed delivery of a removal,
  with the error under `err` (its message and its SQLSTATE) and the `deliveryCount`, which tells a
  lock wait or a statement timeout from another database error; any message on
  `dlq.task-service__project-member-*`; and, on the broker,
  `num_ack_pending`, `num_redelivered` and `num_pending` of the three durable consumers. No metric
  of this service counts the events waiting. Once the removal committed, its clean-up has the
  signals of its job, below.
- Rollout: a later change of the schedule is rolled out with a deployment that replaces every
  replica: a replica on another limit treats its own last delivery as final.
- After the last delivery the event becomes a dead letter in `EVENTS_DLQ`
  (`dlq.task-service__project-member-<event>.evt.member.<event>.v1`), copied by the dead-letter
  worker of notification-service. Every dead letter of these consumers is an incident: an operator
  reads it, fixes the cause, and has organization-service requeue the event
  (`requeueOutboxEvents`, within the 7 days its outbox keeps sent rows).

**Beyond the retention of the stream.** `EVENTS` keeps 7 days. The durable consumers keep their
position, so the copy falls behind only when this service consumes nothing for longer than that,
or when its database starts after the first member events left the stream: the first deployment in
an environment where organization-service has run for more than 7 days, or a restored database.
The memberships older than that are then missing from the copy, and their members are answered as
non-members (`404 organization.not-found`). The remedy is a rebuild: organization-service re-emits
its current memberships with `RebuildEmitter` on `rebuild.task.membership`, received with
`EventConsumers.onRebuild` and applied with the same rules. None of it exists yet: the item schema
belongs to cadenway-api-contracts, the emitter to organization-service, the receiver to this
service; the `task` user already subscribes to `rebuild.task.>`, and organization-service's NATS
user would need the right to publish `rebuild.task.membership`. Until then the service must not
ship to an environment whose copy is incomplete, and a removal or role change lost on the way stays
unapplied, with no later correction.

## Invariants

- The durable consumer names, their filters and their schedule never change without a grant in
  cadenway-ops first.
- A removal is applied to the copy before anything that depends on it, in the same transaction.
- A private space passes to the owner of the organization only when its owner is no longer a
  member of the organization; it awaits that owner, seen by nobody, while the copy does not hold
  one.
- A removal of the copy commits whatever the spaces or the tasks hold; only a transient failure
  redelivers it.
- A removal enqueues exactly one clean-up job per membership and version, in its transaction; the
  job hands the private spaces over, then removes the former member from every task, after the
  commit, unless the copy holds them as a member again when a batch runs. A join or a role change
  enqueues nothing, so a member who becomes a guest keeps the tasks they hold.
- A private space of a former member is seen by nobody until the job hands it over.

## Transactions

`ApplyMemberEvent` runs in its `MemberEventUnitOfWork`, which joins the tenant transaction the
deduplicator of the kit opened for the organization of the event; `ApplyMembershipChange` and
`HandOverAwaitingSpaces` join it too through their tenant runners, and the clean-up job is
inserted through the connection of that transaction. Nothing is committed unless all of them
resolve; an owner unknown to the copy is not a failure.

**The clean-up job.** `ApplyMemberEvent` inserts one row of `task.clean-up-removed-member`
(`JobsRemovedMemberCleanUpQueue`), so the job exists if and only if the copy and the processed id
commit with it, and a worker cannot see it before. Its occurrence key is `<memberId>:<membership
version after the removal>`, scoped by the kit to the organization of the transaction: a removal
delivered again, or requeued by organization-service while the job row is kept (7 days after it
finished), enqueues nothing; the removal of a later membership of the same account is a new
occurrence. The kit scopes the key to the organization as the envelope spelled it, so the same
removal requeued with another spelling of the organization would enqueue a second job, which finds
nothing left to do. The payload also carries the `traceparent` of the delivery of the removal.

`CleanUpRemovedMemberHandler` runs each job in the organization context of its envelope,
lower-cased (`runJobInOrganization` of `src/app.module.ts`), inside a `process
task.clean-up-removed-member` span whose parent is the delivery of the removal, so the rows the job
appends carry the `traceparent` of that trace. It validates the ids with the pattern of the tenant
runner of the kit (any 8-4-4-4-12 hexadecimal id, in either case). `CleanUpRemovedMember` then
loops within the attempt, each batch in its own tenant transaction:

1. `HandOverPrivateSpaces` (spaces): up to 100 private spaces, until a batch finds none;
2. `UnassignRemovedMember` (tasks): up to 500 tasks after the last task id of the previous batch,
   until a batch finds none.

It stops only on an empty batch, never on a short one, and for good on a batch that finds the
account a member again. It starts no batch once the signal of its attempt aborted (the 15-minute
expiration of the queue, or a shutdown past the 8 s `shutdownTimeoutMs` of the runtime, under the
10 s default grace period of Docker: a batch takes about a second, and the handler stops at a batch
boundary). A failed batch (the database, a lock or statement timeout) rolls back alone: the batches
before it stay committed, the attempt fails, and pg-boss retries the job 8 times with backoff from
10 s, capped at 30 min (the last attempt starts 42 to 72 minutes after the first failure when the
attempts fail fast). A retry starts again from the spaces and tasks still owned or assigned, so
nothing is written twice. A permanent error (a malformed job, a defect) costs that whole schedule
before its dead letter. After the last attempt the job becomes a dead letter of
`task.clean-up-removed-member.dead-letter`, kept 14 days. The spaces module documents the cost of a
space batch, the tasks module the nine statements of a task batch.

The runtime of the jobs keeps a pool of 2 connections of its own beside the 5 of the application
pool: 7 connections per replica.

**Signals for operators.** The kit logs each failed attempt (`JobsService`, a warning while it will
be retried, an error on the last attempt, naming the dead-letter queue), with the job id, the
queue, the attempt and the error, never the payload; a crashed attempt is retried silently after
its expiration. The dead-letter watch logs an error with the count of retained dead letters every
60 s while the queue holds one, once per replica (each replica sees the same stock). A finished job
logs `removed member clean-up job handled` (`CleanUpRemovedMemberHandler`) with the job id, the
attempt, the outcome (`completed` or `member-again`), the numbers of spaces handed over and left
awaiting, of tasks changed and of batches committed, no account. Not covered:

- readiness does not cover the job runtime: a replica whose worker stopped polling stays ready;
- no metric counts the waiting jobs or the attempts that run long;
- a job that never started (no replica with the worker ran for 14 days, `retentionSeconds`) is
  deleted without a dead letter;
- start-up fails with `JobsNotProvisionedError` while the `pgboss` schema, a grant or the queue is
  missing: remedy, run the migration container (`node dist/migrate.js`), which provisions them;
- rollback: the release before PR 2 has no worker for this queue, so an enqueued job waits; it is
  deleted after 14 days unless a release with the worker returns, and then the former member stays
  owner of their private spaces (seen by nobody) and assigned to their tasks. Check: the query of
  rows of `task_assignees` for the account below.

**What an operator does with a dead letter.** Every dead letter is an incident; it can leave a
removed member owner of private spaces nobody sees and assigned to tasks for good. As the migrator
role, which owns the `pgboss` schema (checked against pg-boss 12.38 and the schema of
`tests/tasks.int-spec.ts`, which runs these statements):

1. Read the dead letters, their error and what they concern:

   ```sql
   select id, source_id, created_on, source_retry_count, source_output,
          data ->> 'organizationId' as organization_id,
          data -> 'payload' ->> 'userId' as user_id
     from pgboss.job
    where name = 'task.clean-up-removed-member.dead-letter'
    order by created_on;
   ```

   Check what is left, as the migrator role with `select set_config('app.system_access', 'on',
true)` in the same transaction: `select count(*) from spaces where organization_id = $1 and
visibility = 'private' and owner_user_id = $2 and not awaiting_owner` and `select count(*) from
task_assignees where organization_id = $1 and user_id = $2`, while `organization_members` holds
   no active membership of the account (`removed_at is null`).

2. Fix the cause, then replay. While the failed original is kept (7 days after its last attempt,
   `deleteAfterSeconds`), give it one more attempt, as `retry()` of pg-boss does:

   ```sql
   update pgboss.job
      set state = 'retry', retry_limit = retry_limit + 1, completed_on = null,
          start_after = pgboss.job_now(), keep_until = pgboss.job_now() + interval '14 days'
    where name = 'task.clean-up-removed-member' and id = $source_id and state = 'failed';
   ```

   Once the original is gone, enqueue the same envelope again under its occurrence id, with the
   settings of the queue:

   ```sql
   insert into pgboss.job (id, name, data, policy, retry_limit, retry_delay, retry_backoff,
          retry_delay_max, expire_seconds, deletion_seconds, keep_until, dead_letter)
   select d.source_id, q.name, d.data, q.policy, q.retry_limit, q.retry_delay, q.retry_backoff,
          q.retry_delay_max, q.expire_seconds, q.deletion_seconds,
          pgboss.job_now() + q.retention_seconds * interval '1 second', q.dead_letter
     from pgboss.job d join pgboss.queue q on q.name = 'task.clean-up-removed-member'
    where d.name = 'task.clean-up-removed-member.dead-letter' and d.id = $dead_letter_id
   on conflict do nothing;
   ```

   It inserts nothing while the original is kept: use the update then. The job is idempotent and
   resumes from what is left; a requeued `member.removed.v1` does not help, since the deduplicator
   skips its event id and, while the job row is kept, its occurrence key does too.

3. Once the job completed, delete the dead letter, so that the watch stops reporting it:

   ```sql
   delete from pgboss.job
    where name = 'task.clean-up-removed-member.dead-letter' and id = $dead_letter_id;
   ```

A reconciliation job that finds former members still owning private spaces or assigned to tasks
does not exist yet (follow-up of PR 2); until then the procedure above is the only remedy.

**An organization id in upper case.** The contract accepts a UUID in either case, and the kit
builds the context of an event, its deduplicator transaction and the envelope of a job from the raw
envelope value. A removal in upper case commits on its first delivery: it appends no event, and the
job runs lower-cased. A `member.joined.v1` or `member.role-changed.v1` in upper case that makes
someone owner while spaces await one still fails at each delivery: its handover appends
`space.updated.v1` with the lower-case organization in a transaction that carries the raw
spelling, which the outbox writer refuses. A gap of the kit, not fixed here.

## Decisions

- The handler moved here from organization-members in P3a (PR 1 of the spaces), with its names,
  filters and schedule unchanged, so that the effects of a member event on other modules are
  orchestrated without a module cycle.
- `ApplyMemberEvent` owns its transaction through `MemberEventUnitOfWork` (the tenant runner), so
  that a caller other than the handler, a rebuild for example, keeps the copy and its effects in
  one transaction too.
- A batch of the handover locks the private spaces of the former member first and asks for the
  owner of the organization only when there is one to hand over: the job never waits for an owner
  it does not need.
- The clean-up after a removed member is a job of this module enqueued in the transaction of the
  removal (decision of the coordinating session for PR 2 of P3a, one code path, revised again in
  PR 2): the removal commits the copy and the job, nothing else, and the job hands the private
  spaces over, then unassigns the tasks, in bounded batches. The job orchestrates two modules, so it
  belongs to the orchestrator; the spaces and tasks modules expose one batch per call and own no
  queue. The first version of PR 2 unassigned inline in batches of 500, which bounded "a removal
  always commits" by the 25 s handler budget of the kit; the second one kept the handover inline,
  unbounded (one update and one outbox append per private space), and owned the job in tasks.
- The occurrence key is the membership and its version, not the account and the version: versions
  count per membership, so two successive memberships of one account can both end at version 2.
- The spaces come first: a private space of a former member is seen by nobody until it is handed
  over, while a task still assigned to them stays visible to the others, so the spaces are the
  longer harm.
- The first version of PR 1 rolled the removal back while the owner of the organization was
  unknown, so the removed member stayed a member for up to about 25 h 43 min; the coordinating
  session revised it: the removal commits and the spaces fail closed, awaiting an owner. Decision
  revised again by the coordinating session in PR 2: the removal no longer hands over at all, the
  clean-up job does, and the spaces it has not reached yet fail closed too.
- `tests/organization-members.int-spec.ts` proves the copy and the broker grants on real
  PostgreSQL and NATS; `tests/spaces.int-spec.ts` proves that the removal commits with the copy and
  the job only, that the private spaces are seen by nobody, the owner and the admin included,
  while the job is held, then pass to the owner with `space.updated.v1` by the system, that they
  await an owner the copy does not hold and pass to the later owner, that a re-join keeps them, and
  that a lock fails the batch of the job and not the removal. `tests/tasks.int-spec.ts` proves the
  unassignment by the job, a redelivered removal that enqueues nothing, a re-join that stops the
  job and keeps the space and the tasks, a removal in upper case, the trace of the job and the
  dead-letter SQL above. A dead letter reached through the whole retry schedule is not provoked
  (about an hour); it is seeded by SQL. `member-events-handler.provider.spec.ts` pins the
  production schedule and the three handler names.
