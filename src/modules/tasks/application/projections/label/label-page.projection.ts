import type { LabelPosition } from '../../models/label/label-position.model.js';
import type { LabelView } from './label-view.projection.js';

/**
 * Interface LabelPage
 *
 * @description
 * One page of labels, each label once, in the order of its folded name.
 */
export interface LabelPage {
  // #region Properties
  /** The labels of the page. */
  readonly items: readonly LabelView[];

  /** Where the next page starts, `null` on the last page. */
  readonly next: LabelPosition | null;
  // #endregion
}
