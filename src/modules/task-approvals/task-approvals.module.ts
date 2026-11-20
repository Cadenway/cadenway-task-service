import { Module } from '@nestjs/common';

import { TaskCommentsModule } from '../task-comments/task-comments.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { taskApprovalProviders } from './composition/providers/use-cases/approval/task-approval.provider.js';
import { TaskApprovalsController } from './presentation/http/controllers/approval/task-approvals.controller.js';

/** Composes task approvals with the owning task and comment transactions. */
@Module({
  imports: [TasksModule, TaskCommentsModule],
  controllers: [TaskApprovalsController],
  providers: [...taskApprovalProviders],
})
export class TaskApprovalsModule {}
