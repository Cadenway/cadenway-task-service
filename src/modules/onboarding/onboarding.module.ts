import { Idempotent } from '@cadenway/nest-common/database';
import { Module } from '@nestjs/common';

import { OrganizationMembersModule } from '../organization-members/organization-members.module.js';
import { SpacesModule } from '../spaces/spaces.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { onboardingProviders } from './composition/providers/use-cases/onboarding/onboarding.provider.js';
import { OnboardingController } from './presentation/http/controllers/onboarding/onboarding.controller.js';
import { OnboardingBodyGuard } from './presentation/http/guards/onboarding/onboarding-body.guard.js';
import { OnboardingReplayAccessGuard } from './presentation/http/guards/onboarding/onboarding-replay-access.guard.js';

const finish = Object.getOwnPropertyDescriptor(OnboardingController.prototype, 'finish');
if (finish === undefined) throw new Error('The onboarding finish handler is missing.');
Idempotent()(OnboardingController.prototype, 'finish', finish);

/** Binds the onboarding routes and the normal space and task provisioning commands. */
@Module({
  imports: [OrganizationMembersModule, SpacesModule, TasksModule],
  controllers: [OnboardingController],
  providers: [OnboardingBodyGuard, OnboardingReplayAccessGuard, ...onboardingProviders],
})
export class OnboardingModule {}
