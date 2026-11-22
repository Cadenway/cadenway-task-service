# Notification visibility

## Purpose

Resolves current visibility for Notification and Realtime through the Task service's owning
membership, space, list, task and comment capabilities.

## Public entry points

| Entry point | Consumers |
| ----------- | --------- |
| None        | None      |

## Owned tables

`notification_delivery_authorization_decisions` binds each organization and authorization
request to its exact recipient, task selector, deadlines, outcome and outbox event identity.
Migration `0019_notification_delivery_decisions.sql` adds the table with forced tenant RLS.

## API

`POST /internal/v1/notification-subjects/resolve` accepts at most 100 references from a signed
Gateway user with an active membership. It returns an uncached positional decision for each
reference. API Gateway may request authorized display information, including a bounded excerpt
for the exact live comment. Realtime Gateway can request visibility only.

## Events emitted

`task.notification-delivery-authorized.v1` carries the opaque correlation, outcome and
exclusive deadline. The recipient and resource remain in the binding.

## Events consumed

`notification.delivery-authorization-requested.v1` on `EVENTS`, through
`task-service__decide-notification-delivery-authorization`. The consumer verifies the
Notification system actor and transactionally schedules a tenant job for the correlation.
The job retains the same decision on replay of a correlation.

## Invariants

- A visibility decision is positional and uses the current membership and resource grants.
- Display data is returned only to API Gateway when explicitly requested and permitted.
- One organization and authorization request ID bind at most one outcome and outbox event.
- An authorization expires at its exclusive deadline, including after time spent waiting for locks.

## Transactions

HTTP reads share a read-only repeatable-read transaction. The event's deduplication transaction
enqueues a job whose tenant comes from that transaction. The worker obtains a current membership
proof from Organization before opening the decision transaction. That transaction reconciles the
proof with the projected membership and binds the decision and outbox fact in one repeatable-read
snapshot. Failed decisions retry from a new authority proof and snapshot while the request is
valid. A request past its expiry can only record a deny.

## Decisions

- Capability adapters read through their owners' public entry points inside the same snapshot.
- The job queue retries authority or transaction errors without issuing a permit.
- Responses and events carry only the fields needed by their respective consumers.
