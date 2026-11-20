import { UpdateOnboardingChecklistInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Checklist changes accepted by the published contract. */
export class OnboardingChecklistBody extends zodDto(UpdateOnboardingChecklistInternalBody) {}
