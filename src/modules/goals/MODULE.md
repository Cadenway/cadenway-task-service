# Goals

## Purpose

Owns quarterly goals, their key results, and the actor-specific progress and health projections.
The linked lists and milestones remain owned by their ordinary modules.

## Public entry points

None.

## Owned tables

`goals` stores the tenant, quarter, fixed scope, owner, version and bounded key results. Tenant
reads filter by organization. Quarter pages use the creation time and ID index.

## API

The internal task-service contract defines nine operations across `/internal/v1/goals`,
`/{goalId}`, `/{goalId}/results` and `/{goalId}/results/{resultId}`. Goal and result writes share
the goal ETag. Creation accepts a tenant-scoped idempotency key. Replays require the original
verified actor and current access. Quarter cursors bind the actor, organization, quarter and
reference date.

## Events emitted

None.

## Events consumed

None.

## Invariants

- A goal has a fixed quarter and scope, a due date within its quarter and at most 20 results.
- Current full members can read organization goals. Only owners and admins can write them.
- Space goals require an effective role on the space itself. Writes require `edit`, and the
  selected owner must currently be able to read the scope.
- Linked results are returned and counted only while the caller can read their targets. Archived
  targets follow ordinary read visibility. A no-change mutation preserves the version.

## Transactions

Read authorization, linked values and goal data share one repeatable-read tenant snapshot. The
quarter summary uses all visible goals and linked results. The summary and the page share a single
scan in bounded batches. Guests have no organization or direct-space goal scope, so their list
returns an empty summary without reading candidate goals. A write locks the relevant permissions, goal and linked targets for the current transaction. Linked writes
lock the goal before milestone tasks, then hold the scope and target spaces together in the common
space order, then lists. They resolve access again under the locks. Goal and key result changes
persist atomically in the same aggregate.

## Decisions

Progress weights each visible result equally. Health thresholds use unrounded progress against the
expected calendar progress of the quarter. Access failures for missing or hidden goals and
linked results share the same response.
