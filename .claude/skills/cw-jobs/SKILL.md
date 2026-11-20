---
name: cw-jobs
description: "How to run durable background work with @cadenway/nest-jobs (pg-boss in the service database): the job enqueued in the use case transaction, one key per occurrence, bounded retries, the dead-letter queue. Load it before scheduling, enqueueing or handling a job."
---

# Jobs

Durable background work runs on `pg-boss` through `@cadenway/nest-jobs`, in this service's own
database. `@nestjs/schedule`, BullMQ and in-process timers are not used: none of them survives a
restart, and ESLint refuses the first two.

## Enqueueing

1. The use case enqueues the job **inside its transaction**, next to the state change and the outbox
   record: all commit or none does.
2. One job per outgoing effect: one email, one webhook call. Its idempotency key is the id of the
   send.
3. A job that belongs to an occurrence (a reminder, a digest, a due-date alert) carries a unique key
   for that occurrence; enqueueing it twice is a no-op.

## Scheduled work

- The business table is the source of truth (`due_at`, `sent_at`), not the queue.
- A recurring job claims the due rows with `FOR UPDATE SKIP LOCKED` and enqueues one job per row, so
  a missed or doubled tick changes nothing.

## Handling

In V2, place handlers under `presentation/jobs/handlers/<family>/`.

1. A handler calls a use case; the use case is idempotent on the job key.
2. Delivery is at least once and never lost. "Never twice" cannot be guaranteed over SMTP or HTTP:
   make a duplicate harmless rather than assuming it away.
3. Retries are bounded, with backoff. A job that exhausts them goes to the dead-letter queue;
   MODULE.md says what an operator does with it.

## Not for

- Events between services: they go through the outbox (`cw-outbox-and-events`).
- Work on another service's data: a job only touches this service's database.

## In this service

`@cadenway/nest-jobs` 0.3.1 is installed. `JobsRuntimeModule` of `@cadenway/nest-jobs/runtime`
(producer, worker and scheduler, a pool of 2 connections) is registered once in
`src/app.module.ts` and runs each handler in the organization context of its job. The queues are
declared once in `src/config/job-queues.ts`, and `src/migrate.ts` provisions the `pgboss` schema,
the queues and the grants of `task_app` with `provisionJobs` of `@cadenway/nest-jobs/provisioning`,
as the migrator role. Never depend on `pg-boss` directly.

In V2, an enqueuing port lives in `application/ports/outbound/jobs/<area>/`, its adapter on
`JobProducer` in `infrastructure/jobs/pg-boss/<area>/`, bound to the transaction of the unit of
work, and the worker in `presentation/jobs/handlers/<family>/`, built by a provider of
`composition/` that passes it the queue name (presentation does not import `src/config/`).

The member-lifecycle module enqueues `task.clean-up-removed-member` in the transaction of
`member.removed.v1`; its worker hands the private spaces of the former member over, removes their grants, drops
their access requests, then unassigns
them from their tasks, in batches the spaces and tasks modules expose (its `MODULE.md`, with the
retries, the dead-letter queue and the SQL an operator runs about them).

The deletion-lifecycle module runs the workers of the trash and of the deletions, in batches the
spaces, tasks and access-requests modules expose: `task.trash-deleted-tasks` (enqueued by the spaces
module with the deletion of a list or a space), `task.drop-trashed-task-requests` and
`task.purge-trash` (enqueued by the tasks module with "Supprimer la tâche" and "Vider la
corbeille"), and the daily schedule `task.schedule-trash-purge` (03:00 UTC), whose job has no
organization and enqueues one `task.purge-trash` per organization from a system transaction (its
`MODULE.md`, with the dead letters).
