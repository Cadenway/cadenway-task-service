/**
 * Type HoldListOutput
 *
 * @description
 * Where a list held `FOR SHARE` until the end of the transaction stands:
 *
 * - `live`: neither the list nor its space is deleted, archived or not;
 * - `deleted`: the list or its space is deleted; `deletedBy` is who deleted the list, or its space
 *   (`Actor` of `openapi/internal/task-service.yaml`);
 * - `not-found`: the organization has no such list (unknown or erased).
 *
 * @type {object}
 */
export type HoldListOutput =
  | { readonly outcome: 'live' }
  | {
      readonly outcome: 'deleted';
      readonly deletedBy: {
        readonly type: 'user' | 'automation' | 'git' | 'system';
        readonly id: string;
      };
    }
  | { readonly outcome: 'not-found' };
