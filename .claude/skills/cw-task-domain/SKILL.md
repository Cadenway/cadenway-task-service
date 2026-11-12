---
name: cw-task-domain
description: "The data, rules, events and screens cadenway-task-service owns, taken from the mockup, the integration guide and the repositories document. Load it before naming, modeling or testing anything in this service."
---

# task-service domain

## What this service owns

The core of the product.

**Data**: Spaces (appearance, privacy, renamed or hidden statuses), lists and sprints, tasks, subtasks, checklist, dependencies, milestones, recurrence, labels, custom fields, templates, saved views, comments, time entries, approvals, activity log, goals and key results, intake forms, trash, archives.

**API**: All of the above. A status change accepts a source (`user`, `automation`, `git`) so the activity log can sign it "par GitHub".

**Events emitted**: `space.*`, `list.*`, `task.created`, `task.updated`, `task.status-changed`, `task.assigned`, `task.trashed`, `task.restored`, `task.purged`, `comment.created`, `approval.requested`, `approval.decided`, `milestone.reached`.

**Events consumed**: `organization.deleted`, `member.removed` (unassigns the member).

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

At start-up this service also carries documents, attachments metadata and automation rules as modules; they are extracted later into their own repositories.

Everything above comes from the [repositories document](https://claude.ai/artifact/BPinmYxoF3mbK8w9BMB43N) and the
[integration guide](https://claude.ai/artifact/CpJHVCiFfF9j3KbHQ2S1Et). When the mockup and this skill disagree, the mockup wins and
this skill is corrected in the same change.
