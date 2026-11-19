import type { RequesterStanding } from '../../value-objects/access-request/requester-standing.value-object.js';

/**
 * Function isRequestStored
 *
 * @description
 * Whether a request for access is stored, which the answer never tells (decision 4 of P3b-1,
 * "Access requests" of `openapi/public/access.yaml` and the decisions beyond the brief of
 * cadenway-api-contracts#36): only when the target exists in the organization and the requester
 * has no role on it, on the space for a space, on its list for a list or a task. A guest's request
 * for a space is never stored, since a guest holds grants of lists only ("Elle ne verra que cette
 * liste", decision 1). One pending request per requester and target is kept by the store itself,
 * not here: asking again changes nothing.
 *
 * @param {RequesterStanding} standing - The target and what the requester has on it.
 * @returns {boolean} `true` when the request is stored.
 */
export function isRequestStored(standing: RequesterStanding): boolean {
  if (!standing.targetFound) {
    return false;
  }
  if (standing.target === 'space' && standing.requesterRole === 'guest') {
    return false;
  }
  return standing.roleOnTarget === null;
}
