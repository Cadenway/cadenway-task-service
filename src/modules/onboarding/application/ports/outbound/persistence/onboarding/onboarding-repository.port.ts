import type { Onboarding } from '../../../../../domain/aggregates/onboarding/onboarding.aggregate.js';
import type { OnboardingState } from '../../../../../domain/value-objects/onboarding/onboarding-state.value-object.js';

/** State operations in the caller's tenant transaction. */
export interface OnboardingRepository {
  // #region Methods
  /** Runs the requested operation. */
  createInitial(organizationId: string, userId: string): Promise<void>;
  find(organizationId: string, userId: string, lock: boolean): Promise<Onboarding | null>;
  save(state: OnboardingState, expectedVersion: number): Promise<boolean>;
  recordFirstTask(organizationId: string, userId: string, spaceId: string): Promise<boolean>;
  // #endregion
}
