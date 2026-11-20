import type { GoalResult } from './goal-result.value-object.js';

/** Persistable state of a quarter-bound goal, including its placement and key results. */
export interface GoalState {
  // #region Properties
  /** Tenant, placement, metadata and versioned key results. */
  readonly organizationId: string;
  readonly id: string;
  readonly name: string;
  readonly quarter: string;
  readonly ownerUserId: string;
  readonly spaceId: string | null;
  readonly dueDate: string;
  readonly version: number;
  readonly results: readonly GoalResult[];
  // #endregion
}
