import { FinishOnboardingInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

import { storableOnboarding } from '../../../validation/onboarding/storable-onboarding.validator.js';

/** Space provisioning request accepted by the published contract. */
export class OnboardingFinishBody extends zodDto(
  FinishOnboardingInternalBody.superRefine(storableOnboarding),
) {}
