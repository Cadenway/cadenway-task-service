import { listRoleOf } from '../../../domain/policies/access/access-role.policy.js';
import type { AccessRole } from '../../../domain/value-objects/access/access-role.value-object.js';
import type { Viewer } from '../../../domain/value-objects/member/viewer.value-object.js';
import type { ListWithGrants } from '../../models/access/list-with-grants.model.js';
import type { ListView } from '../../projections/list/list-view.projection.js';

/**
 * Function toListViews
 *
 * @description
 * Computes the role of a member on each list a collection read for them, with `listRoleOf`, and
 * keeps the lists they have a role on, in the same order. The query already kept those lists
 * only, with the one visibility condition of the infrastructure; a row the policy refuses all the
 * same is left out (fail closed).
 *
 * @param {readonly ListWithGrants[]} rows - The lists, their space and the grants of the member.
 * @param {Viewer} viewer - The member and its role in the organization.
 * @returns {ListView[]} The lists with the role of the member.
 */
export function toListViews(rows: readonly ListWithGrants[], viewer: Viewer): ListView[] {
  const views: ListView[] = [];
  for (const row of rows) {
    const callerRole: AccessRole | null = listRoleOf(
      row.space,
      row.list.snapshot,
      viewer,
      row.grants,
    );
    if (callerRole !== null) {
      views.push({ list: row.list.snapshot, callerRole });
    }
  }
  return views;
}
