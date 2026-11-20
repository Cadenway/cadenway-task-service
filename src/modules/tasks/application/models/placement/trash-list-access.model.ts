import type { AccessRole } from '../../../domain/value-objects/access/access-role.value-object.js';
import type { TrashList } from './trash-list.model.js';

/**
 * Interface TrashListAccess
 *
 * @description
 * A list of the trash with the role the actor would have on it as if neither the list nor its
 * space were deleted ("for a deleted list, the role they would have on it", "Who" of
 * `openapi/public/trash.yaml`), as the spaces module computes it.
 */
export interface TrashListAccess {
  // #region Properties
  /** The list. */
  readonly list: TrashList;

  /** The role of the actor on it, as if it were not deleted. */
  readonly role: AccessRole;
  // #endregion
}
