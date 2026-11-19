import type { TrashPosition } from '../../../../models/trash/trash-position.model.js';

/**
 * Interface ListTrashEntriesInput
 *
 * @description
 * A page of the trash of the actor ("Corbeille").
 */
export interface ListTrashEntriesInput {
  // #region Properties
  /** The organization of the verified internal token. */
  readonly organizationId: string;

  /** The account of the actor of the internal token. */
  readonly actorUserId: string;

  /** The last entry of the previous page, `null` for the first. */
  readonly after: TrashPosition | null;

  /** How many entries at most, 1 to 100. */
  readonly limit: number;
  // #endregion
}
