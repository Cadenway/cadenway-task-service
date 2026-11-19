import type { PlacedList } from './placed-list.model.js';

/**
 * Interface ArchivedLists
 *
 * @description
 * A page of the archived lists an actor has a role on, as the spaces module answers it, the most
 * recently archived first, with their number.
 */
export interface ArchivedLists {
  // #region Properties
  /** The lists of the page, each with the role of the actor and its archive. */
  readonly lists: readonly PlacedList[];

  /** How many archived lists the actor has a role on, every page included. */
  readonly total: number;
  // #endregion
}
