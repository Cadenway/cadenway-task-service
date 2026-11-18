import type { LabelView } from '../../projections/label/label-view.projection.js';
import type { LabelPosition } from './label-position.model.js';

/**
 * Interface ListedLabel
 *
 * @description
 * A label a page read, with the position a next page would start after it.
 */
export interface ListedLabel {
  // #region Properties
  /** The label. */
  readonly label: LabelView;

  /** Where a page starts after this label. */
  readonly position: LabelPosition;
  // #endregion
}
