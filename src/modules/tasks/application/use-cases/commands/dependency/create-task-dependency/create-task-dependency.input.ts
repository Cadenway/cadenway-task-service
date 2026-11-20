import type { DependencyDirection } from '../../../../../domain/value-objects/dependency/dependency-direction.value-object.js';
import type { DependencyActor } from '../../../../models/dependency/dependency-actor.model.js';

/** A directed dependency to create from either endpoint. */
export interface CreateTaskDependencyInput extends DependencyActor {
  // #region Properties
  /** Key of the prospective counterpart. */
  readonly otherTaskKey: string;

  /** Orientation of the dependency relative to the anchor. */
  readonly direction: DependencyDirection;

  /** Accepted anchor versions, or null when the header accepts any version. */
  readonly expectedVersions: readonly number[] | null;
  // #endregion
}
