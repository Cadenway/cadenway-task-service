import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import { Module } from '@nestjs/common';

import { DrizzleOnboardingRepository } from '../../infrastructure/persistence/drizzle/repositories/onboarding/drizzle-onboarding.repository.js';
import { RecordFirstOnboardingTask } from '../../public/onboarding/record-first-onboarding-task.js';

/** Supplies the progress marker to task creation without reversing its dependency. */
@Module({
  providers: [
    {
      provide: RecordFirstOnboardingTask,
      inject: [TenantTransactionRunner],
      useFactory: (runner: TenantTransactionRunner): RecordFirstOnboardingTask =>
        new RecordFirstOnboardingTask({
          run: (work) => runner.run((tx) => work(new DrizzleOnboardingRepository(tx.db))),
        }),
    },
  ],
  exports: [RecordFirstOnboardingTask],
})
export class OnboardingStateModule {}
