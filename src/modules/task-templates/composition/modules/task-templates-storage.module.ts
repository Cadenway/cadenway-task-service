import { Module } from '@nestjs/common';

import { TenantTaskTemplateUnitOfWork } from '../../infrastructure/persistence/drizzle/transactions/template/tenant-task-template.unit-of-work.js';
import { ReadSpaceTaskTemplateSources } from '../../public/template/read-space-task-template-sources.js';
import { RemoveSpaceTaskTemplates } from '../../public/template/remove-space-task-templates.js';
import { templateUnitOfWorkProvider } from '../providers/adapters/template/task-template-unit-of-work.provider.js';

/**
 * Storage-only module for the owning space's synchronous deletion hook. It has no dependency
 * on the task or space Nest modules.
 */
@Module({
  providers: [
    templateUnitOfWorkProvider,
    {
      provide: RemoveSpaceTaskTemplates,
      inject: [TenantTaskTemplateUnitOfWork],
      useFactory: (unitOfWork: TenantTaskTemplateUnitOfWork): RemoveSpaceTaskTemplates =>
        new RemoveSpaceTaskTemplates(unitOfWork),
    },
    {
      provide: ReadSpaceTaskTemplateSources,
      inject: [TenantTaskTemplateUnitOfWork],
      useFactory: (unitOfWork: TenantTaskTemplateUnitOfWork): ReadSpaceTaskTemplateSources =>
        new ReadSpaceTaskTemplateSources(unitOfWork),
    },
  ],
  exports: [RemoveSpaceTaskTemplates, ReadSpaceTaskTemplateSources],
})
export class TaskTemplatesStorageModule {}
