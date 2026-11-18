# Outbox and events reference

## Publishing

1. The use case appends the event inside its own transaction, with the schemas of the contract
   (`eventSchemas` of `@cadenway/contracts/events/<spec>`) and the injected `OutboxWriter`.
   PostgreSQL assigns the event id (`uuidv7()`) and the instant; the payload is validated before
   the row is written:

   ```ts
   await this.outbox.append(tx, eventSchemas, 'task.status-changed.v1', {
     organizationId,
     actor: { type: 'user', id: userId },
     version,
     key: 'CAD-482', // a task is named by its key outside task-service, never by its id
     status,
     previousStatus,
     // … the rest of the payload of asyncapi/task-service.yaml
   });
   ```
2. An event with an organization is appended in a tenant transaction of that organization; one
   without (`organizationId: null`) in a system transaction only: row-level security refuses it in
   a tenant one.
3. The relay publishes the row after the commit, on `evt.<event-name>` with `Nats-Msg-Id` set to the
   event id and the `traceparent` of the use case. `relay.wake()` after the commit publishes now
   instead of at the next poll (one second).
4. Never publish directly: a crash between commit and publish would lose the event. `EventPublisher`
   is for an application without a database (the API gateway).

## Consuming

1. Register the handler from `onApplicationBootstrap` of a handler in
   `presentation/messaging/handlers/<event-family>/`, with the injected `EventConsumers`. It gets the durable consumer `task-service__<handler>`,
   filtered on the one subject of its event:

   ```ts
   await this.consumers.subscribe({
     handler: 'unassign-member',
     schemas: eventSchemas,
     event: 'member.removed.v1',
     handle: async (payload, { claimVersion }) => {
       /* call the use case */
     },
   });
   ```
2. The deduplicator of `OutboxModule` records `(consumer, event id)` in `processed_events` in the
   handler's transaction (tenant runner for an event with an organization): a redelivery of a
   handled event is skipped. A `run` of the same runner inside the handler joins that transaction.
3. Call a use case; it is idempotent for anything outside the database (an e-mail, a call).
4. A rejection is retried after 1 s, 5 s, 30 s and 2 min; the fifth failure, or a payload that does
   not match its schema, becomes a dead letter in `EVENTS_DLQ`, copied by notification-service.
   A security projection (the copy of the memberships) passes its own `redelivery` schedule to
   `subscribe`, at least 24 hours before the dead letter. Document in MODULE.md what an operator
   does with it.
5. A handler with outside effects registers with `deliverPolicy: 'new'`; the default `all` delivers
   up to seven days of events to a new consumer.

## Changing an event

- Additive field: minor change in cadenway-api-contracts; consumers ignore unknown fields.
- Any other change: a new name `.v2`, emitted alongside `.v1` until every consumer moved.

## Version and order

- Every event carries `version`, the version of the aggregate after the change, and `actor`
  (`{ type: 'user' | 'automation' | 'git' | 'system', id }`).
- Delivery is at least once and order is not guaranteed: `claimVersion(aggregateKey)` in the handler
  context (a key such as `task:<id>`) resolves to `false` for a version already applied to that
  aggregate in that organization.
- Never derive order from arrival time.

## What the kit and the broker own

Subjects (`evt.<name>`), durable pull consumers (`<service>__<handler>`), `Nats-Msg-Id`
deduplication, the retry schedule, the dead-letter copy and `traceparent` propagation belong to
`@cadenway/nest-messaging`. The three streams (`EVENTS`, `EVENTS_RESTRICTED`, `EVENTS_DLQ`) and the
permissions of the `task` user (publish `evt.space.>`, `evt.list.>`, `evt.task.>`, `evt.comment.>`,
`evt.approval.>`, `evt.milestone.>`, subscribe `_INBOX.task.>` and `rebuild.task.>`, and the four
subjects of each of its durable consumers by exact name) belong to cadenway-ops
(`docs/messaging.md`, "Adding a consumer"). A new handler is a new consumer: its grant is merged
there and reaches every environment before the release that adds it, which otherwise fails at
start-up, and `compose.dev.yaml` copies it. This service runs with `manageStreams: false` and
`deadLetterWorker: false`: never declare a stream or a subject here. An event of a new
entity needs its `evt.<entity>.>` in cadenway-ops first.

## Rebuilding a consumer

Outbox rows are kept 7 days. A consumer that fell further behind is rebuilt: the owning service
re-emits the current state of its entities with `RebuildEmitter` on `rebuild.<consumer>.<entity>`
(`rebuild.search.task`), unacknowledged, the only mode the permissions allow. A service that emits
events documents that use case in MODULE.md.
