import { Module } from '@nestjs/common';

import { OrganizationMembersModule } from '../organization-members/organization-members.module.js';
import { SpacesModule } from '../spaces/spaces.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { goalsUnitOfWorkProvider } from './composition/providers/adapters/goal/goals-unit-of-work.provider.js';
import { goalUseCaseProviders } from './composition/providers/use-cases/goal/goal.provider.js';

/** Wires quarterly goals and current access to their linked work. */
@Module({
  imports: [OrganizationMembersModule, SpacesModule, TasksModule],
  providers: [goalsUnitOfWorkProvider, ...goalUseCaseProviders],
})
export class GoalsModule {}
