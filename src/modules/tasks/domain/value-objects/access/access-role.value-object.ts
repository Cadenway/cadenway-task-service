/**
 * Type AccessRole
 *
 * @description
 * The effective role of a member on a list or a space, as the spaces module computes it ("Access"
 * of `openapi/public/spaces.yaml`, decision 2 of P3b-1), ranked `edit` > `comment` > `view`. Who
 * may read and change the tasks of a list with it is the task write policy
 * (`canWriteTasksOf`).
 *
 * @type {'edit' | 'comment' | 'view'}
 */
export type AccessRole = 'edit' | 'comment' | 'view';
