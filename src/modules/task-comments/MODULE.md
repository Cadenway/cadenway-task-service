# Task comments

## Purpose

Owns comment persistence, reads, creation, edits and deletion. Tasks and access rules belong to the tasks and spaces
modules.

## Public entry points

| Entry point                                   | Consumers      |
| --------------------------------------------- | -------------- |
| `task-comments.module`                        | task-approvals |
| `public/comment/allocate-approval-comment-id` | task-approvals |
| `public/comment/create-approval-comment`      | task-approvals |

An approval can reserve a comment identifier, then persist its comment after the owning task has
passed its status policy. These operations join the transaction holding the task lock and reuse the
version assigned by the task module. Creation writes the activity and the text-free outbox fact.

## Owned tables

`task_comments`, keyed by `(organization_id, id)`, uses forced tenant row-level security.
The `(organization_id, task_id, created_at, id)` index serves live pages, and the task foreign key
cascades on purge. Migration `0009_collaboration.sql` creates the table.

## API

- `POST /internal/v1/tasks/{taskKey}/comments`: creates a live comment with `201`, `Location`,
  ETag and optional `Idempotency-Key`. A `comment` or `edit` role is required; reply targets must
  be live comments on the same task. Structured mention recipients must be current members with read access.
- `PATCH /internal/v1/tasks/{taskKey}/comments/{commentId}`: author-only edit, with required
  comment-version If-Match and a new ETag. Replacing text clears spans unless replacements are supplied.
- `DELETE /internal/v1/tasks/{taskKey}/comments/{commentId}`: author-only tombstone, with optional
  comment-version If-Match.
- `GET /internal/v1/tasks/{taskKey}/comments`: live comments oldest first, cursor pagination and total.
- `GET /internal/v1/tasks/{taskKey}/comments/{commentId}`: one live comment and its ETag.

All routes require an internal gateway user and a visible task. An invisible task answers
`task.not-found`; a missing, deleted or unrelated comment answers `comment.not-found`.
A task in a restorable trash entry answers `task.trashed` with its entry details to an eligible
editor. A comment patch requires a JSON body, including when the submitted patch is `{}`.

## Events emitted

`comment.created.v1` through the outbox in the creation transaction, without text. Eligible human
reply targets, unique mention recipients and effective eligible watchers are included.
`comment.updated.v1` carries added and removed mention IDs; `comment.deleted.v1` carries no text.
The contract assigns suppression of the actor, including self mentions, to the planned notification
consumer; this service does not send notifications.

## Events consumed

None.

## Invariants

The repository and domain check 1 to 5,000 Unicode code points and nonblank text. The mention
policy checks at most 20 non-overlapping code-point ranges beginning with `@`. Recipient checks follow
role and author checks. Tombstones retain identity and reply references without text or spans.

## Transactions

A write locks the acting membership, recipient memberships in account order, the task, then the
space and list. Creation includes watcher candidates and the human reply author in that preflight.
It checks the final placement and repeats the preflight if a new candidate appears while it acquires
the task lock. It then validates the reply and inserts the comment, activity and outbox fact in one
transaction. An edit or
deletion checks the role before author and comment version, updates the comment and its activity,
and appends its event in the same transaction. The task lock serializes comment writes; no
separate comment lock is acquired.

The reads use a tenant-scoped read-only repeatable-read transaction, including task visibility,
the page and its total. The repository binds to its caller's tenant transaction; every read and
write names organization and task. Updates check the prior version. It acquires no lock beyond the database writes; callers
must lock the task before comment writes in the global order in tasks/MODULE.md.

## Decisions

The creation use case authorizes through tasks and validates reply targets; the database task foreign key cascades on purge. Rolling back the deployment leaves the
additive tables in place for the previous version; Drizzle has no generated down migration.
