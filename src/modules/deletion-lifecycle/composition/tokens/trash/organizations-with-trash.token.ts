/**
 * Constant ORGANIZATIONS_WITH_TRASH
 *
 * @description
 * Identifies the `OrganizationsWithTrash` port of the module, bound to the public
 * `ListOrganizationsWithTrashToPurge` of the tasks module.
 *
 * @type {unique symbol}
 */
export const ORGANIZATIONS_WITH_TRASH: unique symbol = Symbol('OrganizationsWithTrash');
