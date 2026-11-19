import { DomainError } from '../space/domain.error.js';

/**
 * Class OwnerUnchangeableError
 *
 * @description
 * A grant given to, or removed from, the owner of the space (decision 1 of P3b-1,
 * « Propriétaire », `422 access.owner-unchangeable`): the owner holds no grant and always has
 * `edit` on the space and on its lists.
 */
export class OwnerUnchangeableError extends DomainError {
  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Refuses the change without naming the owner.
   *
   * @constructor
   */
  public constructor() {
    super('The access of the owner of the space does not change.');
  }
  // #endregion
}
