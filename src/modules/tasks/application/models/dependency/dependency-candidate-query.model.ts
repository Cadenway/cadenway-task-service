import type { DependencyDirection } from '../../../domain/value-objects/dependency/dependency-direction.value-object.js';
import type { DependencyCandidatePosition } from './dependency-candidate-position.model.js';

/** Scope, direction, search and position for an editable candidate page. */
export interface DependencyCandidateQuery {
  // #region Properties
  /** Organization of the current transaction. */
  readonly organizationId: string;

  /** Task from which a dependency is being considered. */
  readonly anchorId: string;

  /** List of the anchor, whose candidates sort first. */
  readonly anchorListId: string;

  /** List ids on which the caller may edit tasks. */
  readonly editableListIds: readonly string[];

  /** Direction of the prospective edge from the anchor. */
  readonly direction: DependencyDirection;

  /** Existing task search text, or null for no search. */
  readonly search: string | null;

  /** Last row of the previous page, or null for the first page. */
  readonly after: DependencyCandidatePosition | null;

  /** Maximum number of returned tasks. */
  readonly limit: number;
  // #endregion
}
