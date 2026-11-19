import type { AccessRole } from '../../value-objects/access/access-role.value-object.js';

/**
 * Function canWriteTasksOf
 *
 * @description
 * Whether a member with a role on a list may create and change its tasks: "Who has `edit` on the
 * list creates and changes its tasks; anyone else who sees it reads them and gets
 * `403 access.role-insufficient` for a change" ("Who sees a task" of `openapi/public/tasks.yaml`,
 * decision 2 of P3b-1). Reading needs any role. It applies to the list of the task, the list a
 * task is created in or moved to, and the list of a new parent. Any role but `edit` fails closed,
 * a role a later contract adds included (`x-extensible-enum` of `AccessRoleValue`: an unknown one
 * reads as `view`).
 *
 * @param {AccessRole} role - The role of the member on the list.
 * @returns {boolean} Whether the member may write the tasks of the list.
 */
export function canWriteTasksOf(role: AccessRole): boolean {
  return role === 'edit';
}
