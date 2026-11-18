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
  }
}

/**
 * Function answerRefusals
 *
 * @description
 * Runs a use case and turns its `SpaceRefusal` into the problem of the contract; any other error
 * passes through to the `ProblemFilter` of the kit.
 *
 * @param {() => Promise<TResult>} work - The call of the use case.
 * @returns {Promise<TResult>} What the use case resolved with.
 * @throws {ProblemException} For a refusal of the use case.
 */
export async function answerRefusals<TResult>(work: () => Promise<TResult>): Promise<TResult> {
  try {
    return await work();
  } catch (error) {
    if (!(error instanceof SpaceRefusal)) {
      throw error;
    }
    const shape: ProblemShape = shapeOf(error.refusal);
    throw new ProblemException({
      status: shape.status,
      code: shape.code,
      ...(shape.details === undefined ? {} : { details: shape.details }),
    });
  }
}
