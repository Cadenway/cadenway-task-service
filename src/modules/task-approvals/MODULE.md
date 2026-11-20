# Task approvals

## Purpose

Keeps the current approval and previous rounds of a task. Tasks own visibility, placement,
version, status and recurrence. Task comments own the reason submitted with a request for changes.

## Public entry points

This module exposes the four internal approval routes to the API gateway. It exports no provider.

## Owned tables

`task_approval_rounds` and `task_approval_reviewers` share tenant-scoped foreign keys and forced
row-level security. A task has at most one current round and a round has at most twenty reviewers.
Closing a round preserves its votes. Physical purge of the task removes every round and reviewer.

## HTTP operations

| Operation                          | Success          |
| ---------------------------------- | ---------------- |
| `getTaskApprovalInternal`          | `200`, task ETag |
| `requestTaskApprovalInternal`      | `200`, task ETag |
| `voteOnTaskApprovalInternal`       | `200`, task ETag |
| `withdrawTaskApprovalVoteInternal` | `204`, task ETag |

Read routes allow an archived task if it is visible. A milestone returns no current round. Writes
require edit access and the current task version. Only designated reviewers who still have edit
access may vote. A reviewer withdraws an existing vote before casting a new one. Withdrawal
without a recorded vote preserves the task version. Read projections and quorum decisions omit
reviewers who no longer have edit access.

## Transactions and events

The task module holds the task, its placement, and the applicable memberships. It uses its
existing status and recurrence policies for transitions caused by approval. A request for changes
creates a comment and moves to `progress`. Unanimous approval moves to `done` when at least one
eligible reviewer remains. If status validation or a write fails, the round, vote, comment,
activity, task and outbox appends roll back together. The events `approval.requested.v1` and
`approval.decided.v1` carry identifiers and the final task version. Comment text stays in the
comment module.
