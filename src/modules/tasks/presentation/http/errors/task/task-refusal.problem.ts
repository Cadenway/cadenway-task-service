import { ProblemException } from '@cadenway/nest-common';
import type { ProblemStatus } from '@cadenway/nest-common';

import { TaskRefusal } from '../../../../application/models/task/task-refusal.model.js';
import type { TaskRefusalReason } from '../../../../application/models/task/task-refusal-reason.model.js';

/**
 * Interface ProblemShape
 *
 * @description
 * The status, code and details a refusal answers, as `openapi/internal/task-service.yaml` declares
 * them. The titles stay the English reason phrases of the statuses: the gateway answers the French
 * titles of the public specs.
 */
interface ProblemShape {
  // #region Properties
  /**
   * Property status
   *
   * @description
   * HTTP status of the problem.
   *
   * @type {ProblemStatus}
   * @readonly
   */
  readonly status: ProblemStatus;

  /**
   * Property code
   *
   * @description
   * Stable machine code of the contract.
   *
   * @type {string}
   * @readonly
   */
  readonly code: string;

  /**
   * Property details
   *
   * @description
   * The values the gateway forwards.
   *
   * @type {Readonly<Record<string, unknown>> | undefined}
   * @readonly
   */
  readonly details?: Readonly<Record<string, unknown>>;
  // #endregion
}

/**
 * Function shapeOf
 *
 * @description
 * Maps a refusal of a use case to its problem. What the actor does not see answers `404`, like
 * what does not exist, and what they see without the role a change needs `403
 * access.role-insufficient`, as "Visibility and roles" of the contract says. A change of an archived
 * task, or under an archived parent, answers `409 task.archived` with the key of the archived task
 * (`TaskArchived`, and `TaskCreationConflict` for a new subtask or checklist item). A task in the
 * trash answers `404 task.trashed` with its entry in `details` (`TaskNotFound`: the instants as ISO
 * 8601 texts, `trashedBy` an `Actor`), an entry the actor may not restore `404
 * trash-entry.not-found` (`TrashEntryNotFound`). A write of the trash while its switch is off
 * answers `404 http.not-found`, title `Not Found`: the answer of the kit for a route the service
 * does not have (see `answerRefusals`).
 *
 * @param {TaskRefusalReason} refusal - The refusal.
 * @returns {ProblemShape} The problem of the contract.
 */
function shapeOf(refusal: TaskRefusalReason): ProblemShape {
  switch (refusal.reason) {
    case 'organization-not-found':
      return { status: 404, code: 'organization.not-found' };
    case 'task-not-found':
      return { status: 404, code: 'task.not-found' };
    case 'list-not-found':
      return { status: 404, code: 'list.not-found' };
    case 'space-not-found':
      return { status: 404, code: 'space.not-found' };
    case 'user-not-found':
      return { status: 404, code: 'user.not-found' };
    case 'checklist-item-not-found':
      return { status: 404, code: 'checklist-item.not-found' };
    case 'role-insufficient':
      return {
        status: 403,
        code: 'access.role-insufficient',
        details: { role: refusal.role, requiredRole: 'edit' },
      };
    case 'task-archived':
      return { status: 409, code: 'task.archived', details: { key: refusal.key } };
    case 'task-trashed':
      return {
        status: 404,
        code: 'task.trashed',
        details: {
          key: refusal.key,
          name: refusal.name,
          entryId: refusal.entryId,
          rootKey: refusal.rootKey,
          trashedAt: refusal.trashedAt.toISOString(),
          trashedBy: { type: refusal.trashedBy.type, id: refusal.trashedBy.id },
          purgeAt: refusal.purgeAt.toISOString(),
        },
      };
    case 'trash-entry-not-restorable-yet':
      return { status: 409, code: 'trash-entry.not-restorable-yet' };
    case 'trash-entry-not-found':
      return { status: 404, code: 'trash-entry.not-found' };
    case 'trash-writes-disabled':
      return { status: 404, code: 'http.not-found' };

    case 'version-mismatch':
      return {
        status: 412,
        code: 'request.version-mismatch',
        details: { version: refusal.version },
      };
    case 'status-hidden':
      return { status: 422, code: 'task.status-hidden', details: { status: refusal.status } };
    case 'cancel-reason-required':
      return { status: 422, code: 'task.cancel-reason-required' };
    case 'cancel-reason-unexpected':
      return { status: 422, code: 'task.cancel-reason-unexpected' };
    case 'assignee-invalid':
      return {
        status: 422,
        code: 'task.assignee-invalid',
        details: { userIds: [...refusal.userIds] },
      };
    case 'assignee-limit-reached':
      return { status: 422, code: 'task.assignee-limit-reached' };
    case 'label-limit-reached':
      return { status: 422, code: 'task.label-limit-reached' };
    case 'checklist-limit-reached':
      return { status: 422, code: 'task.checklist-limit-reached' };
    case 'start-date-invalid':
      return { status: 422, code: 'task.start-date-invalid' };
    case 'list-invalid':
      return { status: 422, code: 'task.list-invalid' };
    case 'parent-invalid':
      return {
        status: 422,
        code: 'task.parent-invalid',
        details: { parentKey: refusal.parentKey },
      };
    case 'subtask-depth-exceeded':
      return { status: 422, code: 'task.subtask-depth-exceeded' };
    case 'subtask-limit-reached':
      return { status: 422, code: 'task.subtask-limit-reached' };
  }
}

/**
 * Interface RequestedRoute
 *
 * @description
 * The method and the URL of a request as Express gives them, which the answer for a route the
 * service does not have names.
 */
export interface RequestedRoute {
  // #region Properties
  /** The HTTP method. */
  readonly method: string;

  /** The URL as requested, the query included (`originalUrl` of Express). */
  readonly originalUrl: string;
  // #endregion
}

/**
 * Function answerRefusals
 *
 * @description
 * Runs a use case and turns its `TaskRefusal` into the problem of the contract; any other error
 * passes through to the `ProblemFilter` of the kit. A write of the trash refused while its switch
 * is off (`trash-writes-disabled`) answers exactly as the kit and NestJS answer a route the
 * service does not have: `404`, `type` `about:blank`, title `Not Found`, code `http.not-found`
 * and, with the route of the request, the detail `Cannot <METHOD> <url>` of the router of NestJS.
 *
 * @param {() => Promise<TResult>} work - The call of the use case.
 * @param {RequestedRoute} [route] - The route of the request, for the answer of an unknown route.
 * @returns {Promise<TResult>} What the use case resolved with.
 * @throws {ProblemException} For a refusal of the use case.
 */
export async function answerRefusals<TResult>(
  work: () => Promise<TResult>,
  route?: RequestedRoute,
): Promise<TResult> {
  try {
    return await work();
  } catch (error) {
    if (!(error instanceof TaskRefusal)) {
      throw error;
    }
    const shape: ProblemShape = shapeOf(error.refusal);
    const unknownRoute: boolean = error.refusal.reason === 'trash-writes-disabled';
    throw new ProblemException({
      status: shape.status,
      code: shape.code,
      ...(unknownRoute && route !== undefined
        ? { detail: `Cannot ${route.method} ${route.originalUrl}` }
        : {}),
      ...(shape.details === undefined ? {} : { details: shape.details }),
    });
  }
}
