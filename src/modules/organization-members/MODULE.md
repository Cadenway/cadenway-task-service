# Organization members

## Purpose

The copy task-service keeps of the memberships of cadenway-organization-service: which account
belongs to which organization, with which role (`owner`, `admin`, `member`, `guest`), and who
owns each organization. Decision 4 of the P3a plan of the backend (the plan of the coordinating
session, outside the repositories) reads: roles and members come from task-service's own copy,
never from the `role` claim of the internal token. The modules of P3a ask this copy whether a user
is a current member of the organization of a request and with which role, and who the owner is.

It follows `member.joined.v1`, `member.role-changed.v1` and `member.removed.v1` and nothing else,
through the member-lifecycle module, which consumes them. organization-service owns the
organizations, the members and the invitations. This module owns no route and emits no event; the
consequences of a removal (handing its private spaces to the owner, unassigning the member)
belong to the modules that own those data, which the clean-up job of member-lifecycle calls after
the removal committed.

## Public entry points

| Entry point                                  | Consumers                                        |
| -------------------------------------------- | ------------------------------------------------ |
| `organization-members.module`                | spaces, member-lifecycle, tasks, access-requests |
| `public/membership/apply-membership-change`  | member-lifecycle                                 |
| `public/membership/find-organization-member` | spaces, tasks, access-requests                   |
| `public/membership/find-organization-owner`  | spaces                                           |
| `public/membership/list-active-members`      | tasks                                            |

`OrganizationMembersModule` exports each public provider with its input and output types.

- `ApplyMembershipChange` applies one member event to the copy; the handler of the
  member-lifecycle module calls it in the tenant transaction the deduplicator of the kit opened
  for the event.
- `FindOrganizationMember` (`{ organizationId, userId }` to `{ memberId, role }`, or `null` when
  the account is not a current member) and `FindOrganizationOwner` (`{ organizationId }` to
  `{ memberId, userId }`, or `null` until the join of the owner arrives) serve the access rules of
  the spaces module (the role of the actor, and of the person given a grant); the tasks module
  reads `FindOrganizationMember` for the role of the actor and the eligibility of the people it
  assigns; the access-requests module reads it for the role of the requester or of the person who
  answers, and for whether a former member joined again (the clean-up of their requests).
- `ListActiveMembers` pages only `userId` and `memberId` in user ID order. It selects each
  account's least privileged active membership before applying the list reader audience.

All run in the tenant transaction of their caller and join it, or open one for the
organization of the context; they must not be called from a system transaction (the kit refuses
to open a tenant transaction inside a system one). The caller passes the organization of its
verified context or of its event: row-level security hides any other, so another value finds
nothing.

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

None directly. The member-lifecycle module consumes `member.joined.v1`, `member.role-changed.v1`
and `member.removed.v1` (durable consumers `task-service__project-member-joined`,
`…-role-changed` and `…-removed`, redelivered for about 25 hours, see its `MODULE.md`) and
applies each with `ApplyMembershipChange`, in the tenant transaction the deduplicator of the kit
opened for the event: the copy, the other effects of the event and the processed id commit
together.

- Whichever of the three arrives first for a membership creates its copy (a removal seen first
  creates it removed).
- The three events travel on three subjects and arrive in any order. `ApplyMembershipChange`
  applies a membership by its stored `version` (`Membership.apply`): an older or equal version
  changes nothing, a removal always applies and stays applied, a late join or role change never
  brings it back. `claimVersion` of the kit cannot order them: it keys versions per consumer.
- The copy falls behind beyond the 7 days `EVENTS` keeps (the first deployment in an older
  environment, a restored database); the rebuild that would fill it does not exist yet (see the
  `MODULE.md` of member-lifecycle).

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
  never meets it. The handler of member-lifecycle lower-cases the ids, which the contract accepts in either case.
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
- Membership queries run in the tenant transaction of their
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
- The input of `ApplyMembershipChange` is a public contract of its own, the shape of the domain
  `MembershipChange` with the roles spelt out, so that the public entry exposes no private type.
- The member event handler, its schedule and its tests moved to member-lifecycle in P3a (PR 1 of
  the spaces), names and filters unchanged.
- `tests/organization-members.int-spec.ts` proves the behaviour above on real PostgreSQL and NATS
  under the exact-name grants.
