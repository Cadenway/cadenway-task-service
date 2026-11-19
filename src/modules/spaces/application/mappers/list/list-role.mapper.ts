import { listRoleOf } from '../../../domain/policies/access/access-role.policy.js';
import type { AccessRole } from '../../../domain/value-objects/access/access-role.value-object.js';
import type { Viewer } from '../../../domain/value-objects/member/viewer.value-object.js';
import type { ListAccess } from '../../models/access/list-access.model.js';

/**
 * Function toListRoles
 *
 * @description
 * Computes the role of a member on each list of a lean collection, with `listRoleOf`, and keeps
 * the lists they have a role on, in the same order. The query already kept those lists only, with
 * the one visibility condition of the infrastructure; a row the policy refuses all the same is
 * left out (fail closed).
 *
 * @param {readonly ListAccess[]} rows - What the role reads of each list.
 * @param {Viewer} viewer - The member and its role in the organization.
 * @returns {{ readonly listId: string; readonly callerRole: AccessRole }[]} The lists with the
 * role of the member.
 */
export function toListRoles(
  rows: readonly ListAccess[],
  viewer: Viewer,
): { readonly listId: string; readonly callerRole: AccessRole }[] {
  const roles: { readonly listId: string; readonly callerRole: AccessRole }[] = [];
  for (const row of rows) {
    const callerRole: AccessRole | null = listRoleOf(
      row.space,
      { organizationAccess: row.organizationAccess },
      viewer,
      row.grants,
    );
    if (callerRole !== null) {
      roles.push({ listId: row.listId, callerRole });
    }
  }
  return roles;
}
