# Member lifecycle

## Purpose

Follows the members of each organization for task-service: it consumes `member.joined.v1`,
`member.role-changed.v1` and `member.removed.v1` of organization-service and, for each event, in one
tenant transaction:

- applies it to the copy of the memberships (`ApplyMembershipChange` of organization-members);
- for a removal, hands the private spaces the former member owned to the owner of the organization
  (`HandOverPrivateSpaces` of spaces), or leaves them awaiting an owner while the copy does not hold
  that owner, then enqueues the job that removes the member from the assignees of every task,
  closed tasks included (`ScheduleMemberUnassignment` of tasks); the job runs after the commit;
- for a join or a role change that gives the role `owner`, hands the spaces awaiting an owner to
  that owner (`HandOverAwaitingSpaces` of spaces).

It owns no data, no route and no event of its own. A module of its own rather than a part of
organization-members: the spaces and tasks modules read the copy, so the copy cannot call
them without a module cycle; this module depends on all of them and none depends on it.

## Public entry points

| Entry point | Consumers |
| ----------- | --------- |
| None        | None      |

## Owned tables

None. The copy belongs to organization-members, the spaces to spaces.

## API

None.

## Events emitted

None of its own: the handover appends `space.updated.v1` through the outbox of the spaces module,
in the transaction of the event. The unassignment job the removal enqueues appends one
`task.updated.v1` per task (`changed: ['assigneeIds']`, actor `{ type: 'system', id: 'task-service' }`)
through the outbox of the tasks module, in the transaction of each of its batches, after the event.

## Events consumed

| Event                    | Durable consumer                            | Effect                                                       |
| ------------------------ | ------------------------------------------- | ------------------------------------------------------------ |
| `member.joined.v1`       | `task-service__project-member-joined`       | Applies the join; an owner receives the spaces awaiting one  |
| `member.role-changed.v1` | `task-service__project-member-role-changed` | Applies the role change; the same for the role `owner`       |
| `member.removed.v1`      | `task-service__project-member-removed`      | Applies the removal, hands the spaces over, enqueues the job |

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
  copy, the handover with its outbox rows, the unassignment job and the processed id commit
  together. A transient failure (the database unavailable, a lock timeout) rolls the whole unit
  back, the change of the copy and the job included, and the event is redelivered on the schedule
  below.
- A removal always commits (decision revised by the coordinating session for P3a: a revocation
  must never wait for cleanup). It touches no task: the unassignment is one job row inserted in its
  transaction, so its cost does not grow with the assignments of the member, and the job does the
  work afterwards in batches (the tasks module documents its bound, its retries and its dead
  letter). An owner of the organization unknown to the copy (its `member.joined.v1` has
  not arrived, or the copy is incomplete) is not a transient failure: the removal commits, the
  private spaces of the former member are left awaiting an owner (`spaces.awaiting_owner`), seen by
  nobody, the former owner included, and the handler logs once the warning "A removed member owned
  private spaces while the owner of the organization is unknown: they await an owner." (no personal
  data; the kit adds the organization and the trace). The `member.joined.v1` or
  `member.role-changed.v1` that makes someone owner hands them over in its own transaction
  (`space.updated.v1`, `changed: ['ownerUserId']`, actor `system`). Check:
  `organization_members` of that organization has no row with the role `owner` and no
  `removed_at`. Remedy: have organization-service requeue the `member.joined.v1` of the owner
  (`requeueOutboxEvents`).
- Order: the three events travel on three subjects and arrive in any order; the copy applies them
  by the version of the membership (organization-members). The handover reads the copy after the
  removal: it hands nothing over while the account is still a member under another membership (a
  removal of an old membership that arrives after a new join), and it is idempotent, since the
  former member owns no private space once they passed.
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
  of this service counts the events waiting. Once the removal committed, its unassignment has the
  signals of its job (the failed attempts logged by the kit, the dead-letter queue
  `task.unassign-removed-member.dead-letter` and its watch), listed in the MODULE.md of tasks with
  what an operator does about them.
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
- A removal of the copy commits whatever the spaces or the tasks need; only a transient failure
  redelivers it.
- A removal enqueues exactly one unassignment job per membership and version, in its transaction;
  the job removes the former member from every task after the commit, unless the copy holds them
  as a member again by then. A join or a role change enqueues nothing, so a member who becomes a
  guest keeps the tasks they hold.

## Transactions

`ApplyMemberEvent` runs in its `MemberEventUnitOfWork`, which joins the tenant transaction the
deduplicator of the kit opened for the organization of the event; `ApplyMembershipChange`,
`HandOverPrivateSpaces`, `HandOverAwaitingSpaces` and `ScheduleMemberUnassignment` join it too
through their tenant runners, the last one inserting its job through the connection of that
transaction. Nothing is committed unless all of them resolve; an owner unknown to the copy is not
a failure. The unassignment job runs later, in transactions of its own.

## Decisions

- The handler moved here from organization-members in P3a (PR 1 of the spaces), with its names,
  filters and schedule unchanged, so that the effects of a removal on other modules run in the
  transaction of the event without a module cycle.
- `ApplyMemberEvent` owns its transaction through `MemberEventUnitOfWork` (the tenant runner), so
  that a caller other than the handler, a rebuild for example, keeps the copy and its effects in
  one transaction too.
- The handover locks the private spaces of the former member first and asks for the owner of the
  organization only when there is one to hand over: a removal never waits for an owner it does not
  need.
- The unassignment of a removed member is a job of the tasks module enqueued in the transaction
  of the removal (decision of the coordinating session for PR 2 of P3a, one code path): the first
  version of PR 2 unassigned inline, in batches of 500 tasks, which bounded "a removal always
  commits" by the 25 s handler budget of the kit. The job is keyed by the membership and its
  version, so a redelivery enqueues nothing new.
- The first version of PR 1 rolled the removal back while the owner of the organization was
  unknown, so the removed member stayed a member for up to about 25 h 43 min; the coordinating
  session revised it: the removal commits and the spaces fail closed, awaiting an owner.
- `tests/organization-members.int-spec.ts` proves the copy and the broker grants on real
  PostgreSQL and NATS; `tests/spaces.int-spec.ts` proves the handover, the removal committed while
  the owner is unknown with its spaces seen by nobody, their handover on the later owner event, and
  that a transient failure (a lock timeout) rolls the removal of the copy back until a redelivery
  succeeds. `tests/tasks.int-spec.ts` proves that a removal commits with its unassignment job and
  that a redelivered one enqueues nothing. `member-events-handler.provider.spec.ts` pins the
  production schedule and the three handler names.
