# Domain and integration

[Documentation index](README.md) · [Repository instructions](../AGENTS.md)

**Status:** This page records the target design from repository instructions and skills. Its behavior has not been verified as implemented in this snapshot.

The tables and rules on this page are **target domain behavior**, not proof of a running service or an approved API. Source: `cw-task-domain` ([Claude](../.claude/skills/cw-task-domain/SKILL.md), [Codex](../.codex/skills/cw-task-domain/SKILL.md)). The linked mockup and guides remain the source for product details; confirm ambiguous values before implementation.

## What this service owns

The core of the product.

**Data**: Spaces (appearance, privacy, renamed or hidden statuses), lists and sprints, tasks, subtasks, checklist, dependencies, milestones, recurrence, labels, custom fields, templates, saved views, comments, time entries, approvals, activity log, goals and key results, intake forms, trash, archives, access grants of spaces and lists, access requests.

**API**: All of the above. Every change carries its `actor` (`user`, `automation`, `git` or `system`, `Actor` of the contracts) so the activity log can sign it "par GitHub".

**Events emitted**: `space.*`, `list.*`, `task.created`, `task.updated`, `task.status-changed`, `task.assigned`, `task.access-requested`, `task.access-request-decided`, `task.archived`, `task.unarchived`, `task.trashed`, `task.restored`, `task.purged`, `comment.created`, `approval.requested`, `approval.decided`, `milestone.reached`.

**Events consumed**: `member.joined`, `member.role-changed` and `member.removed`, the copy of the memberships that answers who is a member, with which role, and who owns the organization (decision 4 of the P3a plan: never the `role` claim of the internal token; the removal hands the private spaces of the member to the owner of the organization, removes their grants of spaces and lists and their pending access requests, and unassigns the member from every task), and later `organization.deleted`, which `@cadenway/contracts` does not define yet.

**External systems**: None.

**Mockup screens**: Every space view (list, board, calendar, Gantt, workload, sheet, intake form, activity, timesheet), the task detail and creation, Home, My tasks, Dashboards, Goals, Trash, Archives.

## Rules this service guards

- Next status: triage→todo, backlog→todo, todo→progress, progress→review, review→testing, testing→done, waiting→progress, blocked→progress; backlog, waiting, blocked and cancelled are chosen by hand.
- Cancelling requires a reason: duplicate, wontdo, scope, obsolete (with an optional note).
- A milestone has only todo (À venir), blocked (À risque), done (Atteint), cancelled; no duration, no estimate.
- Subtasks: 3 levels at most, 25 children at most; dependencies never form a cycle.
- Completing a recurring task creates the next occurrence (workdays skip the weekend), checklist unticked.
- Trash keeps a task and its subtasks 30 days; restore is possible until purge.
- Fast status clicks: only the final status of a burst is applied, logged and fed to automations.
- Each space may rename or hide statuses; todo and done stay mandatory.

## Notes

Documents, attachments metadata and automation rules belong to cadenway-document-service, cadenway-storage-service and cadenway-automation-service from the start.

Decided: access grants on spaces and lists (edit, comment, view), access requests, favorites and the state of the onboarding assistant belong to this service. cadenway-automation-service and cadenway-integration-service call its API for actions only, with the source `automation` or `git` and their own internal token; the realtime gateway calls it to check access before a socket joins a list or task room. Estimates are stored in whole minutes.

Everything above comes from the [repositories document](https://claude.ai/artifact/BPinmYxoF3mbK8w9BMB43N) and the
[integration guide](https://claude.ai/artifact/CpJHVCiFfF9j3KbHQ2S1Et). If the mockup disagrees with this guide, update the guide and its source skill for both assistants.

## Engineering standards

These skills fix the engineering standards this service follows. They are target conventions, not proof of an implementation in this snapshot.

| Skill                                                                                                                                                | What it fixes                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cw-database-conventions` ([Claude](../.claude/skills/cw-database-conventions/SKILL.md), [Codex](../.codex/skills/cw-database-conventions/SKILL.md)) | Plural snake_case tables, `id` from `uuidv7()`, `organization_id` first in tenant indexes, `version`, `timestamptz` dates, `text` with `CHECK` for enumerations, forced row-level security, a pool of 5 connections, timeouts per role. |
| `cw-logging-and-tracing` ([Claude](../.claude/skills/cw-logging-and-tracing/SKILL.md), [Codex](../.codex/skills/cw-logging-and-tracing/SKILL.md))    | JSON logs with fixed fields and masking, W3C `traceparent` over HTTP and NATS, the ESM start-up flags, metrics per route and lag alerts, health and shutdown semantics.                                                                 |
| `cw-jobs` ([Claude](../.claude/skills/cw-jobs/SKILL.md), [Codex](../.codex/skills/cw-jobs/SKILL.md))                                                 | Durable jobs on pg-boss through `@cadenway/nest-jobs`: enqueued in the use case transaction, one key per occurrence, bounded retries, a dead-letter queue.                                                                              |

## Contract and delivery sequence

The `cadenway-api-contracts` repository owns HTTP and event specifications. Consumers use published `@cadenway/contracts` packages and `@cadenway/nest-messaging`; do not redefine payloads or connect to another service's database. Change contracts first, then the producing service, followed by gateways and listeners, and finally the webapp. Planned event names on this page must be checked against the actual published specification before use.

## References

[Interactive mockup](https://claude.ai/artifact/KYRM7AnsYLiBLBLKy8i4HE), [integration guide](https://claude.ai/artifact/CpJHVCiFfF9j3KbHQ2S1Et), and [repositories and packages](https://claude.ai/artifact/BPinmYxoF3mbK8w9BMB43N). Use [AGENTS.md](../AGENTS.md) as the local source for ownership and hard limits.
