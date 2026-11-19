import type { TaskList } from '../../../domain/aggregates/list/task-list.aggregate.js';
import type { AccessRole } from '../../../domain/value-objects/access/access-role.value-object.js';

/**
 * Type EditableListLookup
 *
 * @description
 * What `EditableListLocator.find` answers for a list an actor changes, without throwing, so that
 * each caller maps a refusal to its own answer ("Who changes what" of `openapi/public/spaces.yaml`,
 * "Who" of `openapi/public/archives.yaml`):
 *
 * - `locked`: the actor has `edit` on the list, which is locked `FOR NO KEY UPDATE` until the end
 *   of the transaction;
 * - `list-not-found`: the list does not exist, its space is not in the organization, or the actor
 *   has no role on it (`listRoleOf`);
 * - `role-insufficient`: the actor has `role` on the list, without `edit`.
 *
 * A refusal writes nothing; the row of a list that exists stays locked until the end of the
 * transaction whatever the outcome, as it is locked before it is read.
 *
 * @type {object}
 */
export type EditableListLookup =
  | { readonly outcome: 'locked'; readonly list: TaskList }
  | { readonly outcome: 'list-not-found' }
  | { readonly outcome: 'role-insufficient'; readonly role: AccessRole };
