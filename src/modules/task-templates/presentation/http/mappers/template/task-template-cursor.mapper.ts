import { decodeCursor, encodeCursor, ProblemException } from '@cadenway/nest-common';

import type { TaskTemplateCaller } from '../../../../application/models/template/task-template-caller.model.js';
import type { TaskTemplatePosition } from '../../../../application/models/template/task-template-position.model.js';

const UUID: RegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const STORED_INSTANT: RegExp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

/** Reads a cursor issued for this organization, space and order. */
export function decodeTemplateCursor(
  cursor: string | undefined,
  caller: TaskTemplateCaller,
): TaskTemplatePosition | null {
  if (cursor === undefined) {
    return null;
  }
  const { sort, id } = decodeCursor(cursor, templateOrder(caller));
  const [createdAt] = sort;
  if (
    sort.length !== 1 ||
    typeof createdAt !== 'string' ||
    !isStoredInstant(createdAt) ||
    !UUID.test(id)
  ) {
    throw new ProblemException({
      status: 400,
      code: 'request.invalid',
      detail: 'The request does not match its contract.',
      details: {
        issues: [
          {
            in: 'query',
            path: 'cursor',
            code: 'invalid_cursor',
            message: 'Expected the nextCursor of a previous page of this collection.',
          },
        ],
      },
    });
  }
  return { createdAt, id: id.toLowerCase() };
}

/** Issues the exclusive position of the last returned template. */
export function encodeTemplateCursor(
  position: TaskTemplatePosition,
  caller: TaskTemplateCaller,
): string {
  return encodeCursor({ sort: [position.createdAt], id: position.id }, templateOrder(caller));
}

function templateOrder(caller: TaskTemplateCaller): readonly string[] {
  return ['task-templates', caller.organizationId, caller.spaceId, 'createdAt,id:asc'];
}

function isStoredInstant(text: string): boolean {
  const value = new Date(text);
  return (
    STORED_INSTANT.test(text) &&
    !Number.isNaN(value.getTime()) &&
    value.getUTCFullYear() >= 1970 &&
    value.toISOString() === text
  );
}
