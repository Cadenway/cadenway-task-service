import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import type { FactoryProvider } from '@nestjs/common';

import { ResolveSprintLifetimes } from '../../../../application/use-cases/queries/reporting/resolve-sprint-lifetimes/resolve-sprint-lifetimes.use-case.js';
import { DrizzleSprintListHistoryRepository } from '../../../../infrastructure/persistence/drizzle/repositories/sprint-history/drizzle-sprint-list-history.repository.js';

/** Binds the list-history reader to the same tenant snapshot as the report. */
export const resolveSprintLifetimesProvider: FactoryProvider<ResolveSprintLifetimes> = {
  provide: ResolveSprintLifetimes,
  inject: [TenantTransactionRunner],
  useFactory: (runner: TenantTransactionRunner): ResolveSprintLifetimes =>
    new ResolveSprintLifetimes({
      read: (work) =>
        runner.run(({ db }) => work(new DrizzleSprintListHistoryRepository(db)), {
          readOnly: true,
          isolationLevel: 'repeatable read',
        }),
    }),
};
