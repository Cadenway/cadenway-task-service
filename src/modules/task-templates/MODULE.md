# Task templates

## Purpose

Owns the shared task template library of each space. A template captures a task's title,
description, priority, labels, ordered checklist text and names of live direct subtasks.
Clients use the normal task creation route to instantiate a snapshot. Built-in presets are
client-side.

## Public entry points

| Entry point                                        | Consumers |
| -------------------------------------------------- | --------- |
| `task-templates.module`                            | spaces    |
| `public/template/remove-space-task-templates`      | spaces    |
| `public/template/read-space-task-template-sources` | spaces    |

`RemoveSpaceTaskTemplates` deletes the library in the caller's tenant transaction during
space deletion. A space deletion already invalidates its whole library.

## Owned tables

`task_templates` stores template identity, its tenant and space, snapshot, creation time and
version, and the source list ID recorded for new templates. The tenant policy is forced. Queries additionally scope by space. The library index
orders by creation time and ID.

## API

`GET` and `POST /internal/v1/spaces/{spaceId}/task-templates`, and `GET` and `DELETE` at its
`/{templateId}` resource, follow the internal task-service contract. Reads require a user with
a space role. Writes require edit, and POST also requires edit on the source list. The
collection accepts the contract limit and an opaque cursor bound to the tenant, space and
order. POST accepts the standard idempotency key, returns the ETag and Location, and DELETE
accepts If-Match. A creation replay requires that the caller can still read the stored template
in the same space library.

## Events emitted

`space.task-template-changed.v1` with the organization, actor, space, template, action and
post-change revision. It contains no task content.

## Events consumed

None.

## Invariants

- The library holds at most 50 templates.
- A user with access to a list alone cannot see the library.
- The source is a live editable task in the library's space.
- An organization-visible library cannot receive a snapshot from a restricted list.
- Before a private space can be made organization-visible, each existing template must have a
  known, live source list in that space with organization access. A removed source, a restricted
  source or a legacy snapshot with unknown provenance keeps the library private. The owner can
  remove the affected templates before publishing the space.
- Client snapshots have no links to the source task or list, subtask IDs, checklist IDs, checkmarks,
  assignees, dates, milestones, recurrence, subscribers or mentions.

## Transactions

Reads resolve space access and fetch data from one repeatable-read tenant snapshot. Creation
locks the membership, the source task, the space and source list in that order and rechecks
space and list roles and audience under the locks. The space write lock serializes capacity
checks and explicit deletes; each explicit mutation appends its event in the same transaction.

## Decisions

P3b-2 decisions 19 and 20 define the source content and the library's audience. The immutable
snapshot has its own version, so subsequent edits to a task do not change a saved template.
