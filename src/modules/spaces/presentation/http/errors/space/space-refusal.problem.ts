import { ProblemException } from '@cadenway/nest-common';
import type { ProblemStatus } from '@cadenway/nest-common';

import { SpaceRefusal } from '../../../../application/models/space/space-refusal.model.js';
import type { SpaceRefusalReason } from '../../../../application/models/space/space-refusal-reason.model.js';

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
 * what does not exist, as "Visibility" of the contract says.
 *
 * @param {SpaceRefusalReason} refusal - The refusal.
 * @returns {ProblemShape} The problem of the contract.
 */
function shapeOf(refusal: SpaceRefusalReason): ProblemShape {
  switch (refusal.reason) {
    case 'organization-not-found':
      return { status: 404, code: 'organization.not-found' };
    case 'role-forbidden':
      return { status: 403, code: 'organization.role-forbidden' };
    case 'space-not-found':
      return { status: 404, code: 'space.not-found' };
    case 'list-not-found':
      return { status: 404, code: 'list.not-found' };
    case 'prefix-taken':
      return { status: 409, code: 'space.prefix-taken', details: { prefix: refusal.prefix } };
    case 'visibility-forbidden':
      return { status: 403, code: 'space.visibility-forbidden' };
    case 'status-required':
      return { status: 422, code: 'space.status-required', details: { status: refusal.status } };
    case 'sprint-dates-invalid':
      return { status: 422, code: 'list.sprint-dates-invalid' };
    case 'version-mismatch':
      return {
        status: 412,
        code: 'request.version-mismatch',
        details: { version: refusal.version },
      };
    case 'role-insufficient':
      return {
        status: 403,
        code: 'access.role-insufficient',
        details: { role: refusal.role, requiredRole: 'edit' },
      };
    case 'manage-forbidden':
      return { status: 403, code: 'space.manage-forbidden' };
    case 'grantee-invalid':
      return { status: 422, code: 'access.grantee-invalid', details: { userId: refusal.userId } };
    case 'guest-space-forbidden':
      return { status: 422, code: 'access.guest-space-forbidden' };
    case 'owner-unchangeable':
      return { status: 422, code: 'access.owner-unchangeable' };
    case 'grant-limit-reached':
      return { status: 422, code: 'access.grant-limit-reached' };
    case 'trash-writes-disabled':
      // The answer of the kit for an unknown route (title `Not Found`), as the release before,
      // which has no such route, answers.
      return { status: 404, code: 'http.not-found' };
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
  /**
   * Property method
   *
   * @description
   * The HTTP method.
   *
   * @type {string}
   * @readonly
   */
  readonly method: string;

  /**
   * Property originalUrl
   *
   * @description
   * The URL as requested, the query included (`originalUrl` of Express).
   *
   * @type {string}
   * @readonly
   */
  readonly originalUrl: string;
  // #endregion
}

/**
 * Function answerRefusals
 *
 * @description
 * Runs a use case and turns its `SpaceRefusal` into the problem of the contract; any other error
 * passes through to the `ProblemFilter` of the kit. A deletion refused while the writes of the
 * trash are off (`trash-writes-disabled`) answers exactly as the kit and NestJS answer a route the
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
    if (!(error instanceof SpaceRefusal)) {
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
