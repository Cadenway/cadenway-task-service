import type { SavedView as SavedViewResponse } from '@cadenway/contracts/types/internal/task-service';
import {
  decodeCursor,
  encodeCursor,
  getOrganizationContext,
  parseIfMatch,
  ProblemException,
} from '@cadenway/nest-common';

import type { SavedViewCollection } from '../../../../application/models/view/saved-view-collection.model.js';
import type { SavedViewItem } from '../../../../application/models/view/saved-view-item.model.js';
import type { SavedViewPosition } from '../../../../application/models/view/saved-view-position.model.js';
import type { SavedViewWrite } from '../../../../application/models/view/saved-view-write.model.js';
import type { SavedViewSnapshot } from '../../../../application/projections/view/saved-view-snapshot.projection.js';
import { GetSavedViewInternalResponse } from '@cadenway/contracts/validators/internal/task-service';
import { invalidRequest } from '../../errors/view/saved-view.problem.js';

/** The resource identifiers accepted for tenant and caller values. */
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;

/** Reads the authenticated organization and user of the collection. */
export function toCollection(listId: string): SavedViewCollection {
  const context = getOrganizationContext();
  if (context?.actor.type !== 'user' || context.actor.id === null || !UUID.test(context.actor.id)) {
    throw new ProblemException({ status: 403, code: 'auth.actor-not-allowed' });
  }
  if (context.organizationId === null) {
    throw new ProblemException({ status: 403, code: 'auth.organization-required' });
  }
  return {
    organizationId: context.organizationId.toLowerCase(),
    actorUserId: context.actor.id.toLowerCase(),
    listId: listId.toLowerCase(),
  };
}

/** Canonicalizes the resource identifiers used by the read and write use cases. */
export function toItem(listId: string, viewId: string): SavedViewItem {
  return { ...toCollection(listId), viewId: viewId.toLowerCase() };
}

/** Maps an optional HTTP If-Match condition onto the version check of a write. */
export function toWrite(
  listId: string,
  viewId: string,
  header: string | undefined,
): SavedViewWrite {
  const condition = parseIfMatch(header);
  return {
    ...toItem(listId, viewId),
    expectedVersions: condition === undefined || condition === '*' ? null : condition,
  };
}

/** Restricts a cursor to the same organization and list, with a saved-view-specific format. */
function cursorScope(collection: SavedViewCollection): object {
  return {
    organizationId: collection.organizationId,
    listId: collection.listId,
    kind: 'saved-views',
  };
}

/** Validates the decoded cursor position before the position and id reach SQL. */
export function readViewCursor(
  collection: SavedViewCollection,
  cursor: string | undefined,
): SavedViewPosition | null {
  if (cursor === undefined) return null;
  const { sort, id } = decodeCursor(cursor, cursorScope(collection));
  const position = sort[0];
  if (
    sort.length !== 1 ||
    typeof position !== 'number' ||
    !Number.isSafeInteger(position) ||
    position < 1 ||
    !UUID.test(id)
  ) {
    throw invalidRequest(
      'query',
      'cursor',
      'invalid_cursor',
      'Expected the nextCursor of a previous page of this list.',
    );
  }
  return { position, id: id.toLowerCase() };
}

/** Encodes the last item of this page when more views follow it. */
export function writeViewCursor(
  collection: SavedViewCollection,
  next: SavedViewPosition | null,
): string | null {
  return next === null
    ? null
    : encodeCursor({ id: next.id, sort: [next.position] }, cursorScope(collection));
}

/** Returns the contract body without the tenant id or internal position. */
export function toSavedView(view: SavedViewSnapshot): SavedViewResponse {
  return GetSavedViewInternalResponse.parse({
    id: view.id,
    listId: view.listId,
    name: view.name,
    icon: view.icon,
    configuration: view.configuration,
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
    version: view.version,
  });
}
