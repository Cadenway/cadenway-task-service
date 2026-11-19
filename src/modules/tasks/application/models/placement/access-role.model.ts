/**
 * Type AccessRole
 *
 * @description
 * The effective role of a member on a list or a space, as the spaces module computes it ("Access"
 * of `openapi/public/spaces.yaml`, decision 2 of P3b-1), ranked `edit` > `comment` > `view`: a
 * read of a task needs any role on its list, a change of a task needs `edit` on it.
 *
 * @type {'edit' | 'comment' | 'view'}
 */
export type AccessRole = 'edit' | 'comment' | 'view';
