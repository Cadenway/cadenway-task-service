import type { DependencyDirection } from '../../../../../domain/value-objects/dependency/dependency-direction.value-object.js';
import type { DependencyActor } from '../../../../models/dependency/dependency-actor.model.js';
import type { DependencyCandidatePosition } from '../../../../models/dependency/dependency-candidate-position.model.js';

/** Searches for editable counterparts of the requested dependency direction. */
export interface ListDependencyCandidatesInput extends DependencyActor {
  // #region Properties
  /** Orientation of a prospective dependency relative to the anchor. */
  readonly direction: DependencyDirection;

  /** Existing task search text, or null for no search. */
  readonly search: string | null;

  /** Last row of the previous page, or null for the first page. */
  readonly after: DependencyCandidatePosition | null;

  /** Maximum number of returned tasks. */
  readonly limit: number;
  // #endregion
}
