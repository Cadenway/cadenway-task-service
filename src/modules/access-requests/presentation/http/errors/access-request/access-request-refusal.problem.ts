import { ProblemException } from '@cadenway/nest-common';
import type { ProblemStatus } from '@cadenway/nest-common';
import type { Response } from 'express';

import { AccessRequestRefusal } from '../../../../application/models/access-request/access-request-refusal.model.js';
import type { AccessRequestRefusalReason } from '../../../../application/models/access-request/access-request-refusal-reason.model.js';

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
 * Maps a refusal of a use case to its problem (`OrganizationNotFound`, `AccessRequestNotFound`,
 * `AccessRequestDecided`, `AccessRequestLimitReached` and `GrantRefused` of the contract).
 *
 * @param {AccessRequestRefusalReason} refusal - The refusal.
 * @returns {ProblemShape} The problem of the contract.
 */
function shapeOf(refusal: AccessRequestRefusalReason): ProblemShape {
  switch (refusal.reason) {
    case 'organization-not-found':
      return { status: 404, code: 'organization.not-found' };
    case 'access-request-not-found':
      return { status: 404, code: 'access-request.not-found' };
    case 'already-decided':
      return {
        status: 409,
        code: 'access-request.already-decided',
        details: { state: refusal.status },
      };
    case 'limit-reached':
      return {
        status: 429,
        code: 'access-request.limit-reached',
        details: { nextAvailableAt: refusal.nextAvailableAt.toISOString() },
      };
    case 'grantee-invalid':
      return { status: 422, code: 'access.grantee-invalid', details: { userId: refusal.userId } };
    case 'guest-space-forbidden':
      return { status: 422, code: 'access.guest-space-forbidden' };
    case 'owner-unchangeable':
      return { status: 422, code: 'access.owner-unchangeable' };
    case 'grant-limit-reached':
      return { status: 422, code: 'access.grant-limit-reached' };
  }
}

/**
 * Function answerRefusals
 *
 * @description
 * Runs a use case and turns its `AccessRequestRefusal` into the problem of the contract; any other
 * error passes through to the `ProblemFilter` of the kit. For `429 access-request.limit-reached`,
 * the `Retry-After` header (whole seconds until `details.nextAvailableAt`, at least 1) is set on
 * the response given: `ProblemException` carries no header, and the filter of the kit keeps those
 * already set.
 *
 * @param {() => Promise<TResult>} work - The call of the use case.
 * @param {Response} [response] - The response of the route, for `Retry-After`.
 * @returns {Promise<TResult>} What the use case resolved with.
 * @throws {ProblemException} For a refusal of the use case.
 */
export async function answerRefusals<TResult>(
  work: () => Promise<TResult>,
  response?: Response,
): Promise<TResult> {
  try {
    return await work();
  } catch (error) {
    if (!(error instanceof AccessRequestRefusal)) {
      throw error;
    }
    if (error.refusal.reason === 'limit-reached' && response !== undefined) {
      response.setHeader('Retry-After', String(error.refusal.retryAfterSeconds));
    }
    const shape: ProblemShape = shapeOf(error.refusal);
    throw new ProblemException({
      status: shape.status,
      code: shape.code,
      ...(shape.details === undefined ? {} : { details: shape.details }),
    });
  }
}
