import type { OnboardingState } from '@cadenway/contracts/types/internal/task-service';
import { getOrganizationContext, ProblemException } from '@cadenway/nest-common';

import type { OnboardingActor } from '../../../../application/models/onboarding/onboarding-actor.model.js';
import type { GetOnboardingOutput } from '../../../../application/use-cases/queries/onboarding/get-onboarding/get-onboarding.output.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Resolves the target and verified caller without accepting either from the body. */
export function onboardingActor(userId: string): OnboardingActor {
  const context = getOrganizationContext();
  if (context?.actor.type !== 'user' || context.actor.id === null || !UUID.test(context.actor.id)) {
    throw new ProblemException({ status: 403, code: 'auth.actor-not-allowed' });
  }
  if (context.organizationId === null) {
    throw new ProblemException({ status: 403, code: 'auth.organization-required' });
  }
  return {
    organizationId: context.organizationId.toLowerCase(),
    actorUserId: context.actor.id.toLowerCase(),
    userId: userId.toLowerCase(),
  };
}

/** Returns only the members of the published onboarding representation. */
export function onboardingResponse(state: GetOnboardingOutput): OnboardingState {
  return {
    version: state.version,
    wizard: { ...state.wizard },
    provisioning: state.provisioning === null ? null : { ...state.provisioning },
    checklist: { ...state.checklist },
  };
}
