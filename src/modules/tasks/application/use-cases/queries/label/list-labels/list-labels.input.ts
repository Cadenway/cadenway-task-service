import type { LabelPosition } from '../../../../models/label/label-position.model.js';

/**
 * Interface ListLabelsInput
 *
 * @description
 * A page of the labels of the tasks the actor sees.
 */
export interface ListLabelsInput {
  // #region Properties
  /** The organization of the verified internal token. */
  readonly organizationId: string;

  /** The account of the actor of the internal token. */
  readonly actorUserId: string;

  /** The text to find in the labels, without regard to case or accents; `null` for every label. */
  readonly search: string | null;

  /** The last label of the previous page, `null` for the first page. */
  readonly after: LabelPosition | null;

  /** The size of the page, 1 to 100. */
  readonly limit: number;
  // #endregion
}
