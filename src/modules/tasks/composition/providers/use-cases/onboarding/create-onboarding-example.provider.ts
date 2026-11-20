import type { FactoryProvider } from '@nestjs/common';

import { CreateOnboardingExample } from '../../../../application/use-cases/commands/onboarding/create-onboarding-example/create-onboarding-example.use-case.js';
import { CreateTask } from '../../../../application/use-cases/commands/task/create-task/create-task.use-case.js';

/** Exposes example creation to the onboarding orchestration. */
export const createOnboardingExampleProvider: FactoryProvider<CreateOnboardingExample> = {
  provide: CreateOnboardingExample,
  inject: [CreateTask],
  useFactory: (createTask: CreateTask): CreateOnboardingExample =>
    new CreateOnboardingExample(createTask),
};
