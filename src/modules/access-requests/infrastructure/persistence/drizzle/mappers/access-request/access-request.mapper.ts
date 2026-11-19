import { AccessRequest } from '../../../../../domain/aggregates/access-request/access-request.aggregate.js';
import { isAccessRole } from '../../../../../domain/value-objects/access/access-role.value-object.js';
import type { AccessRole } from '../../../../../domain/value-objects/access/access-role.value-object.js';
import { isAccessRequestStatus } from '../../../../../domain/value-objects/access-request/access-request-status.value-object.js';
import type { AccessRequestStatus } from '../../../../../domain/value-objects/access-request/access-request-status.value-object.js';
import { isAccessRequestTarget } from '../../../../../domain/value-objects/access-request/access-request-target.value-object.js';
import type { AccessRequestTarget } from '../../../../../domain/value-objects/access-request/access-request-target.value-object.js';
import type { RequestActor } from '../../../../../domain/value-objects/access-request/request-actor.value-object.js';
import type { accessRequests } from '../../schemas/access-request/access-request.schema.js';

/**
 * Type AccessRequestRow
 *
 * @description
 * A row of `access_requests`.
 *
 * @type {typeof accessRequests.$inferSelect}
 */
export type AccessRequestRow = typeof accessRequests.$inferSelect;

/**
 * Function toTarget
 *
 * @description
 * Narrows the stored target; the `CHECK` constraint of the table admits three values only.
 *
 * @param {string} value - The stored text.
 * @returns {AccessRequestTarget} The target.
 * @throws {Error} When the row holds another value, a defect of the data.
 */
function toTarget(value: string): AccessRequestTarget {
  if (!isAccessRequestTarget(value)) {
    throw new Error('An access request has an unknown target.');
  }
  return value;
}

/**
 * Function toStatus
 *
 * @description
 * Narrows the stored state; the `CHECK` constraint of the table admits three values only.
 *
 * @param {string} value - The stored text.
 * @returns {AccessRequestStatus} The status.
 * @throws {Error} When the row holds another value, a defect of the data.
 */
function toStatus(value: string): AccessRequestStatus {
  if (!isAccessRequestStatus(value)) {
    throw new Error('An access request has an unknown state.');
  }
  return value;
}

/**
 * Function toRole
 *
 * @description
 * Narrows the stored role of an approval.
 *
 * @param {string | null} value - The stored text, `null` for none.
 * @returns {AccessRole | null} The role.
 * @throws {Error} When the row holds another value, a defect of the data.
 */
function toRole(value: string | null): AccessRole | null {
  if (value === null) {
    return null;
  }
  if (!isAccessRole(value)) {
    throw new Error('An access request has an unknown role.');
  }
  return value;
}

/**
 * Function toDecidedBy
 *
 * @description
 * Reads who answered a request from its two columns, `null` while pending.
 *
 * @param {string | null} type - `decided_by_type`.
 * @param {string | null} id - `decided_by_id`.
 * @returns {RequestActor | null} The actor.
 * @throws {Error} When the type is not one of the contract, a defect of the data.
 */
function toDecidedBy(type: string | null, id: string | null): RequestActor | null {
  if (type === null || id === null) {
    return null;
  }
  if (type !== 'user' && type !== 'automation' && type !== 'git' && type !== 'system') {
    throw new Error('An access request was answered by an unknown actor type.');
  }
  return { type, id };
}

/**
 * Function toAccessRequest
 *
 * @description
 * Restores a request from its row; the domain checks every invariant again.
 *
 * @param {AccessRequestRow} row - The row.
 * @returns {AccessRequest} The request.
 * @throws {Error} When the row breaks an invariant, a defect of the data.
 */
export function toAccessRequest(row: AccessRequestRow): AccessRequest {
  return AccessRequest.restore({
    organizationId: row.organizationId,
    id: row.id,
    target: toTarget(row.target),
    targetId: row.targetId,
    spaceId: row.spaceId,
    listId: row.listId,
    taskId: row.taskId,
    taskKey: row.taskKey,
    requesterUserId: row.requesterUserId,
    message: row.message,
    status: toStatus(row.state),
    role: toRole(row.role),
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
    decidedBy: toDecidedBy(row.decidedByType, row.decidedById),
  });
}
