import { decodeCursor, encodeCursor } from '@cadenway/nest-common';
import type { CursorPosition } from '@cadenway/nest-common';
import type { DependencyDirection } from '@cadenway/contracts/types/internal/task-service';
import { createTaskInternalBodyNameMax } from '@cadenway/contracts/validators/internal/task-service';

import type { DependencyCandidatePosition } from '../../../../application/models/dependency/dependency-candidate-position.model.js';
import type { PagePosition } from '../../../../application/models/page/page-position.model.js';
import { invalidCursor, toCursor, toPosition } from '../page/page-cursor.mapper.js';

/** A task key in the published contract. */
const TASK_KEY: RegExp = /^([A-Z]{2,5})-([1-9][0-9]{0,8})$/u;

/** A surrogate that cannot be stored in a task name. */
const LONE_SURROGATE: RegExp = /\p{Surrogate}/u;

/** Task keys are unique within the authenticated organization. */
interface DependencyCursorScope {
  // #region Properties
  /** The organization from the authenticated request. */
  readonly organizationId: string;

  /** The anchor task key within the organization. */
  readonly taskKey: string;
  // #endregion
}

/** Encodes the last visible edge in the task-bound dependency collection. */
export function toDependencyCursor(
  position: PagePosition | null,
  scope: DependencyCursorScope,
): string | null {
  return toCursor(position, { collection: 'task-dependencies', ...scope });
}

/** Decodes the next page of the same task's visible dependency collection. */
export function toDependencyPosition(
  cursor: string | undefined,
  scope: DependencyCursorScope,
): PagePosition | null {
  return toPosition(cursor, { collection: 'task-dependencies', ...scope });
}

/** The anchor, direction and search determine the ordered candidate collection. */
function candidateFilters(
  scope: DependencyCursorScope,
  direction: DependencyDirection,
  search: string | null,
) {
  return { collection: 'dependency-candidates', ...scope, direction, search };
}

/** Encodes the last candidate, including its name and task key tie-breaker. */
export function toCandidateCursor(
  position: DependencyCandidatePosition | null,
  scope: DependencyCursorScope,
  direction: DependencyDirection,
  search: string | null,
): string | null {
  if (position === null) return null;
  const id = `${position.keyPrefix}-${String(position.keyNumber)}`;
  const filters = candidateFilters(scope, direction, search);
  const cursor = encodeCursor({ sort: [position.rank, position.name], id }, filters);
  // JSON escapes control characters to six bytes each. An encoded name keeps even a valid
  // 300-character name with many controls below the kit's 2,048-character cursor limit.
  return cursor.length <= 2048
    ? cursor
    : encodeCursor(
        {
          sort: [position.rank, 'utf8', Buffer.from(position.name, 'utf8').toString('base64url')],
          id,
        },
        filters,
      );
}

/** Decodes a candidate cursor and refuses positions that cannot be stored in PostgreSQL. */
export function toCandidatePosition(
  cursor: string | undefined,
  scope: DependencyCursorScope,
  direction: DependencyDirection,
  search: string | null,
): DependencyCandidatePosition | null {
  if (cursor === undefined) return null;
  const position: CursorPosition = decodeCursor(cursor, candidateFilters(scope, direction, search));
  const [rank, value, encoded] = position.sort;
  const bytes =
    position.sort.length === 3 && value === 'utf8' && typeof encoded === 'string'
      ? Buffer.from(encoded, 'base64url')
      : null;
  const name = bytes === null ? value : bytes.toString('utf8');
  const key: RegExpExecArray | null = TASK_KEY.exec(position.id);
  if (
    (position.sort.length !== 2 && bytes === null) ||
    (bytes !== null && bytes.toString('base64url') !== encoded) ||
    (bytes !== null && typeof name === 'string' && !Buffer.from(name, 'utf8').equals(bytes)) ||
    (rank !== 0 && rank !== 1) ||
    typeof name !== 'string' ||
    name.includes('\u0000') ||
    LONE_SURROGATE.test(name) ||
    Array.from(name).length > createTaskInternalBodyNameMax ||
    key?.[1] === undefined ||
    key[2] === undefined
  ) {
    throw invalidCursor();
  }
  return { rank, name, keyPrefix: key[1], keyNumber: Number(key[2]) };
}
