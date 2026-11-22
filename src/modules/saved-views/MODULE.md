# Saved views

## Purpose

Lists share up to 50 named views. A view saves explicit layout, server filters and sorting,
grouping and client presentation. The server stores `me` symbolically so the client can apply
the view for the current reader. An ungrouped view stores `groupBy: null`. Sheet sort changes
neither the server sort nor its task-query vocabulary.

## Public entry points

| Entry point                            | Consumers |
| -------------------------------------- | --------- |
| `saved-views.module`                   | favorites |
| `public/view/find-favorite-saved-view` | favorites |
| `public/view/remove-list-saved-views`  | spaces    |

`FindFavoriteSavedView` takes the current member and a saved-view UUID, and returns the target
UUID, its parent list ID, and its current name only if the target is visible and active.
`executeMany` resolves a bounded favorite page in batches. A caller about to create a favorite
sets `lock: true` in `execute` in the enclosing tenant transaction. The membership, list
placement and final view row remain protected until that operation commits.

`RemoveListSavedViews` hard-deletes the views of bounded batches of already-locked list IDs
synchronously in the transaction that tombstones the list or its space. It joins the caller's
transaction and returns the exact
removed IDs so the caller can clear corresponding favorite rows. It emits no individual view
facts because the parent deletion is the lifecycle fact. AppModule explicitly installs the narrow
storage module as a global provider so Spaces can inject this operation without loading the REST
module.

## Owned tables

| Table         | Key                     | Organization scoping           |
| ------------- | ----------------------- | ------------------------------ |
| `saved_views` | `(organization_id, id)` | Kit policy, enabled and forced |

A view has a UUID v7 and a position within its list. The tenant/list/order index serves append,
duplicate, ordered pagination and parent cleanup. The list ID references a different capability
through its published lifecycle seam. Views do not need an additional membership projection.

## HTTP and events

`GET` and `POST /internal/v1/lists/{listId}/saved-views`, `GET`, `PATCH` and `DELETE`
of the item, and `POST .../{viewId}/duplicate` follow the installed task-service contract.
The API gateway must authenticate a human actor with an organization. Every effective list
role can read, including when the list is archived. Only a current editor may write, and only
while the list is active. A replay requires current access to the list and the created view.
The copy's access follows its own lifetime in the same list.

Within a tenant transaction, writes lock current membership and parent placement first, then
the list's saved-view order and affected view rows. This serializes the per-list capacity check,
position allocation, and optimistic version conditions with permission changes and concurrent
deletion. Creation appends. A duplicate is inserted directly after its source and gets fresh
identity and version. A patch changes only explicit settings and an identical patch preserves
the version. Hidden custom column IDs and custom field sort are stored as presentation preferences.
The client may ignore unknown or retired IDs. Explicit deletion hard-deletes the view and its favorite references. It does not
return the deleted snapshot. The restored parent list never recreates deleted views.

Actual changes append the published `list.saved-view-changed.v1` fact to the outbox in the
same tenant transaction. The fact contains the affected IDs, action, actor and resulting version.
It contains neither view names nor configuration.

## Dependencies

- `organization-members` supplies current membership and an optional shared membership lock.
- `spaces` supplies current list visibility, effective role, archive status and parent locks.
- `favorites` exposes a narrow cleanup provider registered by AppModule for removing dependent rows.
- `@cadenway/nest-common` and `@cadenway/nest-messaging` supply tenant transactions, validation,
  HTTP protocol helpers and outbox publication.
