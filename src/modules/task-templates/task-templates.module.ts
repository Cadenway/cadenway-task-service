import { Idempotent, TenantTransactionRunner } from '@cadenway/nest-common/database';
import { OutboxRelay, OutboxWriter } from '@cadenway/nest-messaging/outbox';
import { Global, Module } from '@nestjs/common';

import { ResolveTaskTemplateSpace } from '../spaces/public/space/resolve-task-template-space.js';
import { SpacesModule } from '../spaces/spaces.module.js';
import { ReadTaskTemplateSource } from '../tasks/public/task/read-task-template-source.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { TaskTemplateAuthorization } from './application/services/template/task-template-authorization.service.js';
import { CreateTaskTemplate } from './application/use-cases/commands/template/create-task-template/create-task-template.use-case.js';
import { DeleteTaskTemplate } from './application/use-cases/commands/template/delete-task-template/delete-task-template.use-case.js';
import { RemoveSpaceTaskTemplates } from './application/use-cases/commands/template/remove-space-task-templates/remove-space-task-templates.use-case.js';
import { GetTaskTemplate } from './application/use-cases/queries/template/get-task-template/get-task-template.use-case.js';
import { ListTaskTemplates } from './application/use-cases/queries/template/list-task-templates/list-task-templates.use-case.js';
import { TenantTaskTemplateUnitOfWork } from './infrastructure/persistence/drizzle/transactions/template/tenant-task-template.unit-of-work.js';
import { OwningTaskTemplateSourceDirectory } from './infrastructure/adapters/source/task-template-source-directory.adapter.js';
import { TaskTemplatesController } from './presentation/http/controllers/template/task-templates.controller.js';

const creationHandler = Object.getOwnPropertyDescriptor(
  TaskTemplatesController.prototype,
  'create',
);
if (creationHandler === undefined) {
  throw new Error('The task templates controller has no creation handler.');
}
Idempotent()(TaskTemplatesController.prototype, 'create', creationHandler);

const templateUnitOfWorkProvider = {
  provide: TenantTaskTemplateUnitOfWork,
  inject: [TenantTransactionRunner, OutboxWriter, OutboxRelay],
  useFactory: (
    runner: TenantTransactionRunner,
    outbox: OutboxWriter,
    relay: OutboxRelay,
  ): TenantTaskTemplateUnitOfWork => new TenantTaskTemplateUnitOfWork(runner, outbox, relay),
};

/**
 * Storage-only module for the owning space's synchronous deletion hook. It has no dependency
 * on the task or space Nest modules.
 */
@Global()
@Module({
  providers: [
    templateUnitOfWorkProvider,
    {
      provide: RemoveSpaceTaskTemplates,
      inject: [TenantTaskTemplateUnitOfWork],
      useFactory: (unitOfWork: TenantTaskTemplateUnitOfWork): RemoveSpaceTaskTemplates =>
        new RemoveSpaceTaskTemplates(unitOfWork),
    },
  ],
  exports: [RemoveSpaceTaskTemplates],
})
export class TaskTemplatesStorageModule {}

/** Library HTTP operations and their dependency wiring. */
@Module({
  imports: [SpacesModule, TasksModule],
  controllers: [TaskTemplatesController],
  providers: [
    templateUnitOfWorkProvider,
    {
      provide: OwningTaskTemplateSourceDirectory,
      inject: [ResolveTaskTemplateSpace, ReadTaskTemplateSource],
      useFactory: (
        spaces: ResolveTaskTemplateSpace,
        tasks: ReadTaskTemplateSource,
      ): OwningTaskTemplateSourceDirectory => new OwningTaskTemplateSourceDirectory(spaces, tasks),
    },
    {
      provide: TaskTemplateAuthorization,
      inject: [OwningTaskTemplateSourceDirectory],
      useFactory: (sources: OwningTaskTemplateSourceDirectory): TaskTemplateAuthorization =>
        new TaskTemplateAuthorization(sources),
    },
    {
      provide: CreateTaskTemplate,
      inject: [TenantTaskTemplateUnitOfWork, TaskTemplateAuthorization],
      useFactory: (
        unitOfWork: TenantTaskTemplateUnitOfWork,
        sources: TaskTemplateAuthorization,
      ): CreateTaskTemplate => new CreateTaskTemplate(unitOfWork, sources),
    },
    {
      provide: DeleteTaskTemplate,
      inject: [TenantTaskTemplateUnitOfWork, TaskTemplateAuthorization],
      useFactory: (
        unitOfWork: TenantTaskTemplateUnitOfWork,
        sources: TaskTemplateAuthorization,
      ): DeleteTaskTemplate => new DeleteTaskTemplate(unitOfWork, sources),
    },
    {
      provide: GetTaskTemplate,
      inject: [TenantTaskTemplateUnitOfWork, TaskTemplateAuthorization],
      useFactory: (
        unitOfWork: TenantTaskTemplateUnitOfWork,
        sources: TaskTemplateAuthorization,
      ): GetTaskTemplate => new GetTaskTemplate(unitOfWork, sources),
    },
    {
      provide: ListTaskTemplates,
      inject: [TenantTaskTemplateUnitOfWork, TaskTemplateAuthorization],
      useFactory: (
        unitOfWork: TenantTaskTemplateUnitOfWork,
        sources: TaskTemplateAuthorization,
      ): ListTaskTemplates => new ListTaskTemplates(unitOfWork, sources),
    },
  ],
})
export class TaskTemplatesModule {}
