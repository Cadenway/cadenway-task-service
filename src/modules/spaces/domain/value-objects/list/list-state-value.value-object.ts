/**
 * Type ListStateValue
 *
 * @description
 * Where a list stands, as `ListStateValue` of `openapi/internal/task-service.yaml` names it for the
 * list of an archived or trashed task: `active` for a list of the sidebar, `archived` for a list of
 * the archives ("Liste archivée"), `deleted` for a deleted list or a list of a deleted space
 * ("Liste supprimée"), which comes back when one of its tasks is restored.
 *
 * @type {'active' | 'archived' | 'deleted'}
 */
export type ListStateValue = 'active' | 'archived' | 'deleted';
