# Platform

## Purpose

Gives the tables of the service kit their place in this service's own migrations. drizzle-kit reads
`src/modules/*/infrastructure/persistence/drizzle/schemas/*/*.schema.ts` only. A kit table enters the migration history through a schema re-export in this module. It owns:

- `outbox_events`, `processed_events` and `event_versions`, defined by
  `@cadenway/nest-messaging/outbox/schema`;
- `idempotency_keys`, defined by `@cadenway/nest-common/database`.

Product data and rules belong to the business modules. The kit defines these tables and implements
the request interceptor and the event infrastructure. Platform schedules physical cleanup of
expired HTTP receipts in the service's own database.

## Public entry points

No other capability imports this one. The kit reads and writes the tables by name through the
transaction runners. The application composition uses `outboxRelayIndicator` from
`platform.module.ts` to check the standalone relay's table privileges.

## Owned tables

| Table              | Defined by                        | Organization scoping                                                         |
| ------------------ | --------------------------------- | ---------------------------------------------------------------------------- |
| `outbox_events`    | `@cadenway/nest-messaging/outbox` | `organization_id`, null for an event outside any organization; policy forced |
| `processed_events` | `@cadenway/nest-messaging/outbox` | None: consumer and event id only, no organization data, no policy            |
| `event_versions`   | `@cadenway/nest-messaging/outbox` | `organization_id`, part of the unique key; policy forced                     |
| `idempotency_keys` | `@cadenway/nest-common/database`  | `organization_id`, part of the unique key; policy forced                     |

Created by `migrations/0000_platform_tables.sql`, owned by the migrator role `task_migrator`. The
application role `task_app` reads and writes their rows and holds no DDL right on them.

## API

None. The `Idempotency-Key` interceptor of `DatabaseModule` (`idempotency: true`) stores the key and
the response of a route marked `@Idempotent()` in `idempotency_keys`; no route exists yet.

## Events emitted

Business modules append their published events with `OutboxWriter.append`. The legacy API relay
publishes pending rows until the standalone relay is activated.

## Events consumed

None. `processed_events` and `event_versions` record what the handlers of the business modules
consumed, through the PostgreSQL deduplicator of `OutboxModule`. The API keeps the deduplicator
active when the standalone relay publishes.

## Invariants

- No business rule, column, index or policy of this service is added to these tables: they keep the
  definition of the installed kit version.
- Row-level security is enabled and forced on `outbox_events`, `event_versions` and
  `idempotency_keys`; `processed_events` has none.
- Only a migration, run by the migrator role, changes their structure.

## Transactions

The rows are written inside the units of work of others: an outbox row in the
transaction of the use case that changes the data (tenant runner, or system runner for an event
without organization), a processed id and a version in the transaction of the handler, an
idempotency key in the transaction the interceptor opens for its route. The dedicated relay claims
rows in a short system transaction, publishes outside the transaction and settles in another.
The active relay also purges sent rows after 7 days and processed ids after 14. `0026_outbox_leases`
expands the schema for the dedicated relay, and `src/migrate.ts` finishes the index and validation
outside Drizzle's migration transaction.

### Jobs

`task.purge-idempotency-receipts` runs every minute in UTC as a system job. The migrator provisions
its queue and dead-letter queue with the other Task queues. The worker deletes up to 500 receipts
past the kit's expiry per system transaction, then continues in a new transaction. Locked receipts
are picked up by a later occurrence. The foreign key removes bulk replay scopes with their parent
receipt. Bulk writers lock the existing parent before updating the scope to match the order used by
cleanup. A failed or interrupted run leaves committed batches deleted for the next occurrence.

## Decisions

- Named `platform` because it holds the plumbing every Cadenway backend shares, not one capability:
  `outbox` or `messaging` would leave out `idempotency_keys`, and `kit` would suggest that the code
  of the kit lives here, when only its tables do.
- drizzle-kit enables row-level security but does not force it: the `FORCE ROW LEVEL SECURITY`
  statements of the migration are written by hand, as the READMEs of both kit packages require. A
  kit version that changes a table is applied with `pnpm migration:generate` in a new migration,
  following the note of its changeset; a forced policy on a new tenant table is added by hand again.
- `tests/service-wiring.int-spec.ts` proves that `src/migrate.ts` applies the migration as the
  migrator role, that the policies are forced, that the application role reads and writes the rows
  of its organization only and runs no DDL, and that the relay runs against an empty outbox.
