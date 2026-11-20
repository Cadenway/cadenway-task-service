import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import type { FactoryProvider } from '@nestjs/common';

import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import { MeasureGoalTargets } from '../../../../application/use-cases/queries/goal/measure-goal-targets/measure-goal-targets.use-case.js';
import { TenantGoalTargetUnitOfWork } from '../../../../infrastructure/persistence/drizzle/transactions/goal/tenant-goal-target.unit-of-work.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';

/** Binds goal measurements to the owning Tasks reader and ordinary placement checks. */
export const measureGoalTargetsProvider: FactoryProvider<MeasureGoalTargets> = {
  provide: MeasureGoalTargets,
  inject: [TenantTransactionRunner, SPACE_DIRECTORY],
  useFactory: (runner: TenantTransactionRunner, spaces: SpaceDirectory): MeasureGoalTargets =>
    new MeasureGoalTargets(new TenantGoalTargetUnitOfWork(runner), spaces),
};
