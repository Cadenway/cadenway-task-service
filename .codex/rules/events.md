---
paths:
  - 'src/**/*.events.ts'
  - 'src/**/*.handler.ts'
  - 'src/**/*.publisher.ts'
  - 'src/**/events/**'
---

# Events

- Under V2, put incoming events in `presentation/messaging/handlers/<event-family>/` and job
  handlers in `presentation/jobs/handlers/<job-family>/`.

- Event names: `<entity>.<past-tense-fact>.v<version>`; the payload is the AsyncAPI schema of the
  installed `@cadenway/contracts`.
- Publish only through the outbox of `@cadenway/nest-messaging`, in the use case transaction. Never a
  direct NATS client.
- Use the existing consumer deduplicator and call the owning use case. For database effects, keep
  the deduplication record and changes in the same transaction so a failure leaves the delivery
  eligible for retry. For example, a redelivered member-removal event must not record the
  unassignment twice. Keep any effect outside the database idempotent too.
- Handlers write only this service's data.
- A shape change is a new version; the old one keeps being emitted until every consumer moved.
- A subtree emits one event per task, the root first. A restoration from the trash emits the
  `space.restored.v1` / `list.restored.v1` of what comes back with it, each followed by the full
  `space.access-changed.v1` / `list.access-changed.v1` of its grants, then `task.restored.v1` per task,
  each task that comes back archived followed by its `task.archived.v1`; a tombstone and a task in the
  trash emit nothing until they come back.
- Events emitted by this service: `space.*`, `list.*`, `task.created`, `task.updated`, `task.status-changed`, `task.assigned`, `task.access-requested`, `task.access-request-decided`, `task.archived`, `task.unarchived`, `task.trashed`, `task.restored`, `task.purged`, `task.notification-delivery-authorized`, `comment.created`, `approval.requested`, `approval.decided`, `milestone.reached`.
