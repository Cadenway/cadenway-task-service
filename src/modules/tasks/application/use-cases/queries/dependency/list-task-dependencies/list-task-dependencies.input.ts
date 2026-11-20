import type { DependencyActor } from '../../../../models/dependency/dependency-actor.model.js';
import type { PagePosition } from '../../../../models/page/page-position.model.js';

/** Reads a page of visible dependencies of the anchor. */
export interface ListTaskDependenciesInput extends DependencyActor {
  // #region Properties
  /** Last row of the previous page, or null for the first page. */
  readonly after: PagePosition | null;

  /** Maximum number of returned dependencies. */
  readonly limit: number;
  // #endregion
}
