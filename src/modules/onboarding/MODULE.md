# Onboarding

## Purpose

Keeps the first-launch wizard and checklist private to the current organization member. Finishing
reuses normal space, list and task creation rules for the selected preset. Invitation delivery
stays with organization-service. Onboarding records only the reported success marker.

## Public entry points

| Entry point                                      | Consumers |
| ------------------------------------------------ | --------- |
| `public/onboarding/record-first-onboarding-task` | tasks     |

The state module exports the progress marker without depending on tasks or spaces. The HTTP
module depends on their public provisioning entry points. Normal root task creation can record the
marker for the same member and provisioned space before its transaction commits. Sample tasks,
copies, occurrences and direct subtask creation do not advance this checklist item.

## Owned tables

`onboarding_states` is keyed by `(organization_id, user_id)` and uses forced row-level security.
The version protects wizard and checklist changes. A new member sees the initial state until the
first mutation. A member who leaves cannot read or replay their former state.

## HTTP operations

| Operation                           | Success                              |
| ----------------------------------- | ------------------------------------ |
| `getOnboardingInternal`             | `200`, state ETag                    |
| `updateOnboardingInternal`          | `200`, state ETag                    |
| `updateOnboardingChecklistInternal` | `200`, state ETag                    |
| `finishOnboardingInternal`          | `201`, state ETag and space Location |

The path user is the verified actor. Dismissal is available to any current member. Provisioning
requires the ordinary space creation permission. Conditional writes use the onboarding ETag.
A keyed finish checks membership and role before the idempotency interceptor replays its response.

## Transactions and events

Finish holds membership and the actor's onboarding state. It records provisioning only after
the normal commands create the space, named lists and samples. Resource writes, state and
ordinary `space.created.v1`, `list.created.v1` and `task.created.v1` facts share the transaction.
A failure rolls back all of them, including the prefix reservation. Onboarding emits no event of
its own.
