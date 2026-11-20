import type { OnboardingActor } from '../../models/onboarding/onboarding-actor.model.js';
import { OnboardingRefusal } from '../../models/onboarding/onboarding-refusal.model.js';
import type { OnboardingMembers } from '../../ports/outbound/membership/onboarding/onboarding-members.port.js';

/** Checks the caller and current membership before reading personal state. */
export class OnboardingAccess {
  // #region Constructor
  /** Initializes the operation. */
  public constructor(private readonly members: OnboardingMembers) {}
  // #endregion

  // #region Methods
  /** Runs the requested operation. */
  public async require(actor: OnboardingActor, lock: boolean, provision = false): Promise<void> {
    if (actor.userId.toLowerCase() !== actor.actorUserId.toLowerCase()) {
      throw new OnboardingRefusal('user-not-found');
    }
    const membership = await this.members.find(actor.organizationId, actor.actorUserId, lock);
    if (membership === null) throw new OnboardingRefusal('organization-not-found');
    if (provision && membership.role === 'guest') throw new OnboardingRefusal('role-forbidden');
  }
  // #endregion
}
