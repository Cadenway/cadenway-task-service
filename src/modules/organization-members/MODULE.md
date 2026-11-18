# Organization members

## Purpose

The copy task-service keeps of the memberships of cadenway-organization-service: which account
belongs to which organization, with which role (`owner`, `admin`, `member`, `guest`), and who
owns each organization. Decision 4 of the P3a plan of the backend (the plan of the coordinating
session, outside the repositories) reads: roles and members come from task-service's own copy,
never from the `role` claim of the internal token. The modules of P3a ask this copy whether a user
is a current member of the organization of a request and with which role, and who the owner is.

It follows `member.joined.v1`, `member.role-changed.v1` and `member.removed.v1` and nothing else.
organization-service owns the organizations, the members and the invitations. This module owns no
route and emits no event; the consequences of a removal (unassigning the member, handing its
private spaces to the owner) belong to the modules that own those data.

## Public entry points

| Entry point | Consumers |
| ----------- | --------- |
| None        | None      |

No module consumes the copy yet. The two readings the modules of P3a need are ready as use cases
of this module: `FindOrganizationMember` (`{ organizationId, userId }` to `{ memberId, role }`, or
`null` when the account is not a current member) and `FindOrganizationOwner`
(`{ organizationId }` to `{ memberId, userId }`, or `null` until the join of the owner arrives).
The strict architecture check admits a public entry and a Nest export only with an existing
consuming module: the change that adds the first consumer adds
`public/membership/find-organization-member` (or `-owner`) with the use case and its input and
output types, its row here with the consumer's name, and the provider in the `exports` of
`OrganizationMembersModule`; the consumer binds its own outbound port to that operation.

Both readings run in the tenant transaction of their caller and join it, or open one for the
organization of the context; they must not be called from a system transaction (the kit refuses
to open a tenant transaction inside a system one). The caller passes the organization of its
verified context: row-level security hides any other, so another value finds nothing.

## Owned tables

| Table                  | Key                                                | Organization scoping                                     |
| ---------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| `organization_members` | `(organization_id, id)`, `id` the `memberId` given | `organization_id`, policy of the kit, enabled and forced |

Created by `migrations/0001_organization_members.sql`, which forces its policy by hand. `id` is
the id organization-service gave the membership, not one PostgreSQL generates: a projection keeps
the id of its owner. `user_id` names an account of identity-service, without a foreign key.
`version` (`bigint`, as the integer of the contract) is the highest version of the membership
applied, `removed_at` marks a membership that ended; rows are never deleted, so a removal stays
applied when its events are read again. Index `(organization_id, user_id)`; the owner of an organization is read through its
`organization_id` prefix.

## API

None.

## Events emitted

None.

## Events consumed

| Event                    | Durable consumer                            | Effect                                     |
| ------------------------ | ------------------------------------------- | ------------------------------------------ |
| `member.joined.v1`       | `task-service__project-member-joined`       | Creates the membership, or nothing         |
| `member.role-changed.v1` | `task-service__project-member-role-changed` | Changes its role when its version is newer |
| `member.removed.v1`      | `task-service__project-member-removed`      | Marks it removed, for good                 |

Whichever of the three arrives first for a membership creates its copy (a removal seen first
creates it removed).

- One durable pull consumer of `EVENTS` per event, filtered on its `evt.` subject, registered by
  `MemberEventsHandler`. Each starts with the default `deliverPolicy: 'all'`: the contract
  (`asyncapi/organization-service.yaml`, "Memberships") requires a consumer that keeps a copy to
  read the whole history the stream holds, not only what is published after it subscribed, and
  the handler has no effect outside this database, so reading again is harmless. `'new'` would
  leave out every member who joined before the first deployment.
- Grants: the `task` NATS user may create, read, pull from and acknowledge on these three
  consumers only, by their exact names and filters
  ([cadenway-ops#30](https://github.com/Cadenway/cadenway-ops/pull/30),
  `compose/nats/nats-server.conf`, copied into `compose.dev.yaml`). A renamed handler, or one that
  consumes another event, is a new consumer: its grant reaches cadenway-ops and every environment
  before the release that adds it, which otherwise fails at start-up.
- Deduplication: the deduplicator of `OutboxModule` runs each delivery in the tenant transaction of
  the organization of its envelope and records `(consumer, event id)` in `processed_events` there;
  a redelivery is skipped. The copy and the processed id commit together.
- Order: the three events travel on three subjects and arrive in any order. The use case applies a
  membership by its stored `version` (`Membership.apply`): an older or equal version changes
  nothing, a removal always applies and stays applied, a late join or role change never brings it
  back. `claimVersion` of the kit cannot order them: it keys versions per consumer.
- Redelivery schedule, shared by the three consumers (decision 3 of the P2b security follow-ups,
  the schedule of the security projections, which the memberships module of identity-service
  documents too): 1 s, 5 s, 30 s,
  2 min, 10 min, 30 min, then every hour, 32 deliveries. The 31 failed deliveries wait 92,556 s,
  about 25 h 43 min, before the dead letter, against 2 min 36 s for the default of the kit: the
  copy outlasts an outage of the database shorter than a day, and a role change or a removal given
  up would leave a member with access it lost. `memberEventsRedeliveryProvider` binds it to
  `MEMBER_EVENTS_REDELIVERY`; the kit sets `max_deliver` 32 on each durable consumer and refuses at
  start-up a schedule that would not end within half the seven-day retention of `EVENTS`.
- Limits of that schedule, which the kit does not check: a waiting message is among the oldest of
  `EVENTS`, which drops its oldest messages first past its 1 GiB cap, so a removal dropped while it
  waits is lost without a dead letter; each waiting message counts towards the 1,000
  unacknowledged messages of its consumer. A failure that cannot pass by itself
  (`MembershipMismatchError`) also waits the whole schedule before its dead letter. The kit logs
  each failed delivery as a warning naming the consumer, and its `errorClass` is a fixed category
  (`Error` for every failure of this module or of PostgreSQL), so a warning does not tell a defect
  from an outage: warnings that go on once PostgreSQL answers point at a defect of the events.
- Signals for operators, outside this service: the warnings `event handler failed: will retry` of
  these three consumers; any message on `dlq.task-service__project-member-*`; and, on the broker,
  `num_ack_pending`, `num_redelivered` and `num_pending` of the three durable consumers. No metric
  of this service counts the events waiting.
- Rollout: the first release creates the consumers with the schedule. A later change of the
  schedule is rolled out with a deployment that replaces every replica: a replica on another
  limit treats its own last delivery as final.
- After the last delivery the event becomes a dead letter in `EVENTS_DLQ`
  (`dlq.task-service__project-member-<event>.evt.member.<event>.v1`), copied by the dead-letter
  worker of notification-service. Every dead letter of these consumers is an incident: an operator
  reads it, fixes the cause, and has organization-service requeue the event
  (`requeueOutboxEvents`, within the 7 days its outbox keeps sent rows).

**Beyond the retention of the stream.** `EVENTS` keeps 7 days. The durable consumers keep their
position, so the copy falls behind only when this service consumes nothing for longer than that,
or when its database starts after the first member events left the stream: the first deployment of
this module in an environment where organization-service has run for more than 7 days, or a
restored database. The memberships older than that are then missing from the copy, and their
members are answered as non-members. The remedy is a rebuild: organization-service re-emits its
current memberships with `RebuildEmitter` on `rebuild.task.membership`, received here with
`EventConsumers.onRebuild` and applied with the same rules. None of it exists yet: the item schema
belongs to cadenway-api-contracts, the emitter to organization-service, the receiver to this
module. The `task` user already subscribes to `rebuild.task.>`; organization-service's NATS user
would need the right to publish `rebuild.task.membership`. Until a rebuild exists, the first module
that authorizes requests from this copy must not ship to an environment whose copy is incomplete,
and a removal or role change lost on the way (dropped by the byte cap, dead-lettered and not
requeued within 7 days) stays unapplied, with no later correction.

## Invariants

- A membership is active from its first `member.joined.v1` or `member.role-changed.v1` until its
  `member.removed.v1`; a removed membership stays removed, and a person who joins again gets a new
  `memberId`, hence a new row.
- The role is the role of the highest version applied.
- A membership never moves, an assumption of this module the contract implies without stating it:
  a join or a role change that names another account than the stored copy is refused
  (`MembershipMismatchError`); a removal that does still ends the membership its id names, which
  keeps its own account (the copy fails closed). A `memberId` stored under another organization is
  invisible to the tenant transaction of the event and keyed apart by `organization_id`, so it
  never meets it. The handler lower-cases the ids, which the contract accepts in either case.
- The copy applies the roles organization-service sends: it does not check again that a role
  change never touches `owner`.
- The owner of an organization is its active membership with the role `owner`. Under the v1 events
  organization-service gives that role to the creator only, the role never becomes nor stops being
  `owner` (`member.role-changed.v1`), and the owner never leaves (`member.removed.v1`): one owner
  per organization. The public contracts announce a transfer of ownership for a later version
  (`openapi/public/members.yaml`); it cannot travel on `member.role-changed.v1`, so this module
  subscribes to its event when it is published, or `FindOrganizationOwner` keeps answering the
  previous owner.
- Should two active memberships of one account coexist (a removal still on its way while the
  person has joined again under a new `memberId`), `FindOrganizationMember` answers the least
  privileged of them (`leastPrivilegedMembership`): the copy cannot tell the current one from the
  order the events reached it, and a stale membership never grants more than the current one.
- A membership organization-service created a few seconds ago may not be here yet: callers answer
  as for a non-member, and `FindOrganizationOwner` answers `null` until the join of the owner
  arrives.

## Transactions

- `ApplyMembershipChange` runs in the tenant transaction the deduplicator of the kit opened for the
  organization of the event (`TenantMembershipsUnitOfWork` joins it). It locks the row; two events
  of a new membership handled at once both insert it with `on conflict do nothing`, the second
  then locks the stored row and applies itself.
- `FindOrganizationMember` and `FindOrganizationOwner` run in the tenant transaction of their
  caller and join it, so row-level security limits them to the organization of the context, which
  each query also names.

## Decisions

- Named `organization-members` after what it copies; the aggregate is the membership, as in the
  contract (`memberId`).
- The primary key starts with `organization_id`, as every index a tenant query uses: the projected
  `memberId` is unique per organization, which is all a tenant transaction can see.
- The owner is read through the `(organization_id, user_id)` index, filtered on the role: its cost
  grows with the members of one organization. A partial index waits for a query plan that needs
  it.
- No outbox: the module emits nothing. No system transaction: every caller acts for one
  organization.
- The application input of `ApplyMembershipChange` is the domain `MembershipChange`: the event
  carries nothing the domain does not use.
- `tests/organization-members.int-spec.ts` proves the behaviour above on real PostgreSQL and NATS
  under the exact-name grants; `member-events-handler.provider.spec.ts` pins the production
  schedule the three consumers subscribe with.
