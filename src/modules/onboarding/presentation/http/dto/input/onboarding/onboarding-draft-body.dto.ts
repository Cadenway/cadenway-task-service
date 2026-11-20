import { UpdateOnboardingInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

import { storableOnboarding } from '../../../validation/onboarding/storable-onboarding.validator.js';

/** Draft fields accepted by the published contract. */
export class OnboardingDraftBody extends zodDto(
  UpdateOnboardingInternalBody.superRefine(storableOnboarding),
) {}
