# List intake

## Purpose

Manage a list's request form, grant access to the active publication by its opaque key, and keep
the requester contact separate from ordinary task data. The tasks module owns the submitted tasks
and their normal task activity and events. Attachments belong to storage.

## Public entry points

| Entry point                              | Consumers |
| ---------------------------------------- | --------- |
| `public/form/revoke-deleted-list-intake` | spaces    |
| `public/form/purge-deleted-list-intake`  | spaces    |
| `public/form/purge-intake-contacts`      | tasks     |

The storage module exports only these lifecycle operations. Each joins the transaction of its
resource owner.

## Owned tables

| Table                 | Responsibility                                                                |
| --------------------- | ----------------------------------------------------------------------------- |
| `intake_forms`        | One versioned draft and its active publication per organization and list.     |
| `intake_publications` | Unique historical publication-key digests and their owning lists.             |
| `intake_submissions`  | Fingerprints and opaque receipts scoped to a publication and idempotency key. |
| `intake_contacts`     | An optional contact email keyed by tenant and stable task ID.                 |

## API

The API gateway calls seven internal operations. The list configuration read, patch, publish and
disable routes and the task contact read require a verified user and organization. The public form
read and submission require its verified system actor without an organization. The configuration
routes return an ETag. Anonymous submissions use the publication-scoped idempotency receipt.

## Events emitted

`intake.attachment-claimed.v1` and `intake.attachment-released.v1` record mutually exclusive
terminal decisions for a tenant, publication and attachment. Claims include the permanent task key.
The outbox rows and terminal reservations share a transaction. Task creation records ordinary
task facts in that transaction too.

## Events consumed

`intake.attachment-verified.v1` moves an exact, pending and unexpired reservation to verified.
The durable `task-service__verify-intake-attachment` replays retained Storage facts and joins
their deduplication transaction. Terminal, missing and expired reservations leave no change.
The messaging kit retries transactional failures. At dead letter, inspect the failure and replay
the original fact while the reservation is active. An expired reservation follows its normal
release path.

## Invariants

The management actor must be an active member with list edit access. A published form can be used
only while its list is active and its defaults are eligible. A default assignee must be eligible
for assignment and able to read the list. Contact reads require edit access to the task's current
placement. Contacts stay out of ordinary task projections, activity and event payloads.

## Transactions

The system publication lookup resolves only the tenant and list. It closes before the tenant
transaction rechecks the exact key and lifecycle. Contact reads use one repeatable-read snapshot
for access and contact data. An editor checks access before waiting for an exclusive settings
lock, then rechecks access under the write locks. Submissions take a compatible shared settings
lock after their nonblocking claim. Both paths hold membership, placement and form locks in
that order. The claim is scoped to the tenant, publication and request key. One write transaction
covers the ordinary task, its events, the separate contact and the receipt.

Logical list and space deletion revoke affected publications while holding the list tombstones.
Physical list deletion removes the settings and keeps the key reservations. Physical task
deletion removes the private contacts alongside the tasks.

## Decisions

Archiving suspends delivery until the list is active again. Disabling or removing the list revokes
the key. A later publication uses a fresh key. A matching successful request can replay its opaque
receipt for 24 hours while the same publication stays eligible.
After that window, the minute UTC system schedule `task.purge-intake-receipts` physically removes
expired receipts in batches of at most 500 per transaction. Concurrent rewrites and other cleanup
workers skip locked rows for that occurrence. The cleanup leaves active receipts and publication
key reservations intact. A failed attempt retries, then reaches
`task.purge-intake-receipts.dead-letter`; the next occurrence retries the remaining expired rows.
