import { Idempotent } from '@cadenway/nest-common/database';
import { Module } from '@nestjs/common';

import { OrganizationMembersModule } from '../organization-members/organization-members.module.js';
import { SpacesModule } from '../spaces/spaces.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { goalsUnitOfWorkProvider } from './composition/providers/adapters/goal/goals-unit-of-work.provider.js';
import { goalUseCaseProviders } from './composition/providers/use-cases/goal/goal.provider.js';
import { GoalsController } from './presentation/http/controllers/goal/goals.controller.js';
import { GoalBodyGuard } from './presentation/http/guards/goal/goal-body.guard.js';
import { GoalReplayGuard } from './presentation/http/guards/goal/goal-replay.guard.js';

for (const handler of ['create', 'createResult'] as const) {
  const descriptor = Object.getOwnPropertyDescriptor(GoalsController.prototype, handler);
  if (descriptor === undefined) throw new Error('The goal creation handler is missing.');
  Idempotent()(GoalsController.prototype, handler, descriptor);
}

/** Wires quarterly goals and current access to their linked work. */
@Module({
  imports: [OrganizationMembersModule, SpacesModule, TasksModule],
  controllers: [GoalsController],
  providers: [goalsUnitOfWorkProvider, GoalBodyGuard, GoalReplayGuard, ...goalUseCaseProviders],
})
export class GoalsModule {}
