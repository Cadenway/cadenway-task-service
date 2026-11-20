import { Idempotent, TenantTransactionRunner } from '@cadenway/nest-common/database';
import { Global, Module } from '@nestjs/common';

import { OrganizationMembersModule } from '../organization-members/organization-members.module.js';
import { SpacesModule } from '../spaces/spaces.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { onboardingProviders } from './composition/providers/use-cases/onboarding/onboarding.provider.js';
import { DrizzleOnboardingRepository } from './infrastructure/persistence/drizzle/repositories/onboarding/drizzle-onboarding.repository.js';
import { OnboardingController } from './presentation/http/controllers/onboarding/onboarding.controller.js';
import { OnboardingBodyGuard } from './presentation/http/guards/onboarding/onboarding-body.guard.js';
import { OnboardingReplayAccessGuard } from './presentation/http/guards/onboarding/onboarding-replay-access.guard.js';
import { RecordFirstOnboardingTask } from './public/onboarding/record-first-onboarding-task.js';

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

/** Supplies the progress marker to task creation without reversing its dependency. */
@Global()
@Module({
  providers: [
    {
      provide: RecordFirstOnboardingTask,
      inject: [TenantTransactionRunner],
      useFactory: (runner: TenantTransactionRunner): RecordFirstOnboardingTask =>
        new RecordFirstOnboardingTask(({ organizationId, actorUserId, spaceId }) =>
          runner.run(async (tx) => {
            await new DrizzleOnboardingRepository(tx.db).recordFirstTask(
              organizationId,
              actorUserId,
              spaceId,
            );
          }),
        ),
    },
  ],
  exports: [RecordFirstOnboardingTask],
})
export class OnboardingStateModule {}
