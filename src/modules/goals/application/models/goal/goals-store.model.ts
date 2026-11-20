import type { GoalLinkMeasurements } from '../../../domain/value-objects/goal/goal-link-measurements.value-object.js';
import type { GoalResult } from '../../../domain/value-objects/goal/goal-result.value-object.js';
import type { GoalRepository } from '../../ports/outbound/persistence/goal/goal-repository.port.js';
import type { GoalCaller } from './goal-caller.model.js';
import type { GoalViewer } from './goal-viewer.model.js';
import type { NewGoalResult } from './new-goal-result.model.js';

/** Transaction-bound persistence and access checks for goal operations. */
export interface GoalsStore {
  // #region Properties
  /** The members of this application contract. */
  readonly goals: GoalRepository;
  // #endregion

  // #region Methods
  /** Resolves the active membership, optionally holding it until commit. */
  findViewer(caller: GoalCaller, lock: boolean): Promise<GoalViewer | null>;

  /** Resolves a readable space and its own effective role, holding authorization on writes. */
  findScope(
    viewer: GoalViewer,
    spaceId: string,
    lock: boolean,
  ): Promise<'edit' | 'comment' | 'view' | null>;

  /** Resolves spaces readable through their own role for one bounded candidate page. */
  visibleSpaces(viewer: GoalViewer, spaceIds: readonly string[]): Promise<ReadonlySet<string>>;

  /** Checks that the selected owner is active and can read the goal's scope. */
  ownerCanReadScope(
    organizationId: string,
    ownerUserId: string,
    spaceId: string | null,
    lock: boolean,
  ): Promise<boolean>;

  /** Resolves currently readable list and milestone links in a bounded batch. Archived targets
   * remain eligible when ordinary reads expose them. List counts exclude deleted and cancelled tasks. */
  measureLinks(
    viewer: GoalViewer,
    results: readonly (GoalResult | NewGoalResult)[],
    lock: boolean,
    scopeSpaceId?: string | null,
  ): Promise<GoalLinkMeasurements>;
  // #endregion
}
