import type { RequestedTargetRef } from '../../../../application/models/access-request/requested-target-ref.model.js';
import type { CreateAccessRequestBody } from '../../dto/input/access-request/create-access-request-body.dto.js';

/**
 * Function toRequestedTarget
 *
 * @description
 * The one target of a validated body (`refuseTargetCount` refused none and several), the ids
 * lower-cased since the contract accepts a UUID in either case.
 *
 * @param {CreateAccessRequestBody} body - The validated body.
 * @returns {RequestedTargetRef} The target.
 * @throws {Error} When the body names no target, which the validation refused first.
 */
export function toRequestedTarget(body: CreateAccessRequestBody): RequestedTargetRef {
  if (body.spaceId !== undefined) {
    return { kind: 'space', spaceId: body.spaceId.toLowerCase() };
  }
  if (body.listId !== undefined) {
    return { kind: 'list', listId: body.listId.toLowerCase() };
  }
  if (body.taskKey !== undefined) {
    return { kind: 'task', taskKey: body.taskKey };
  }
  throw new Error('A validated access request names no target.');
}
