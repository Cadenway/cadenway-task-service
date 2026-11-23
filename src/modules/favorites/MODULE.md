# Favorites

## Purpose

Owns the private collection of favorites for each user and organization. Target names and access
remain the responsibility of Spaces and Saved Views.

## Public entry points

| Entry point                                    | Consumers           |
| ---------------------------------------------- | ------------------- |
| `favorites.module`                             | member-lifecycle    |
| `composition/modules/favorites-storage.module` | saved-views, spaces |
| `public/purge/purge-target-favorites`          | saved-views, spaces |
| `public/purge/purge-member-favorites`          | member-lifecycle    |

`PurgeTargetFavorites` clears the references to physically removed resources while their owner
holds the target placement in the same tenant transaction. `PurgeMemberFavorites` clears the
departed account's personal collection and respects a newer active membership.

## Owned tables

`favorites` stores target identity, favorite identity, user, version and creation time under
forced organization RLS. Owner queries also constrain `user_id`.

## API

`GET` and `POST /internal/v1/me/favorites` list and add favorites. `GET` and
`DELETE /internal/v1/me/favorites/{favoriteId}` read and remove one. The verified gateway token
supplies the user and organization. The write contract supports an optional idempotency key on
creation and an optional `If-Match` on removal. A creation replay requires that the favorite
still belongs to the caller and that the caller can still read its active target.

## Events emitted

None.

## Events consumed

None. Member Lifecycle calls the cleanup operation when applying a membership removal.

## Invariants

- Only an actor with an active projected membership can access favorites. Resources still follow
  their owners' usual visibility, including an accessible space shell and the parent list of a saved view.
- Each user and organization has at most 200 stored favorites, including hidden entries, and at
  most one favorite per target kind and ID.
- Readable, active targets are returned in creation-time and ID order with live names and public
  paths. Cursor boundaries belong to one organization and user.
- Archive, soft deletion and temporary access loss can hide a favorite without removing it.
  Permanent deletion of the target removes its references.

## Transactions

Reads use one snapshot for membership, owner rows and batched visibility. Creation takes the
owner's advisory lock before locking the active membership and target, and joins any transaction
opened by the idempotency interceptor. Removed-member cleanup takes the same owner lock before
checking membership, including when there is no active row to lock. Target cleanup joins the
target owner's transaction, and favorite deletion holds the active membership and target.
Target writes preflight visibility before holding a placement and recheck it under the lock.
A held space uses `FOR NO KEY UPDATE` because a list grant can be the user's sole access to the space.

## Decisions

A favorite stores only the target identity. Target lookups are bounded by the collection limit.
No events or activity entries describe these private preferences.
