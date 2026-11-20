import type { PagePosition } from '../../models/page/page-position.model.js';
import type { DependencyView } from './dependency.projection.js';

/** Visible dependencies in stable creation order. */
export interface DependencyPageView {
  // #region Properties
  /** The visible rows in this page. */
  readonly items: readonly DependencyView[];

  /** Last row of this page when another visible page exists. */
  readonly next: PagePosition | null;
  // #endregion
}
