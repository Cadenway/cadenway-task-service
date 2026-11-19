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
- Events emitted by this service: `space.*`, `list.*`, `task.created`, `task.updated`, `task.status-changed`, `task.assigned`, `task.access-requested`, `task.access-request-decided`, `task.trashed`, `task.restored`, `task.purged`, `comment.created`, `approval.requested`, `approval.decided`, `milestone.reached`.
