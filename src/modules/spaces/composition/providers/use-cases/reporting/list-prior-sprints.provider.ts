import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import type { FactoryProvider } from '@nestjs/common';

import { ListPriorSprints } from '../../../../application/use-cases/queries/reporting/list-prior-sprints/list-prior-sprints.use-case.js';
import { TenantPriorSprintsUnitOfWork } from '../../../../infrastructure/persistence/drizzle/transactions/sprint-history/tenant-prior-sprints.unit-of-work.js';

/** Supplies the prior-sprint lookup within the caller's tenant snapshot. */
export const listPriorSprintsProvider: FactoryProvider<ListPriorSprints> = {
  provide: ListPriorSprints,
  inject: [TenantTransactionRunner],
  useFactory: (runner: TenantTransactionRunner): ListPriorSprints =>
    new ListPriorSprints(new TenantPriorSprintsUnitOfWork(runner)),
};
