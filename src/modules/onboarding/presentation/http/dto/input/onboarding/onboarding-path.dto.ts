import { GetOnboardingInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** The target user ID. */
export class OnboardingPath extends zodDto(GetOnboardingInternalParams) {}
