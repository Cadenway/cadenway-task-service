import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import { JobProducer } from '@cadenway/nest-jobs/runtime';
import type { FactoryProvider } from '@nestjs/common';

import type { MemberEventUnitOfWork } from '../../../../application/ports/outbound/transactions/membership/member-event-unit-of-work.port.js';
import { TenantMemberEventUnitOfWork } from '../../../../infrastructure/persistence/drizzle/transactions/membership/tenant-member-event.unit-of-work.js';
import { MEMBER_EVENT_UNIT_OF_WORK } from '../../../tokens/membership/member-event-unit-of-work.token.js';

/**
 * Constant memberEventUnitOfWorkProvider
 *
 * @description
 * Binds the unit of work of `ApplyMemberEvent` to the tenant runner of the kit, with the job
 * producer of `JobsRuntimeModule`, which enqueues the clean-up job through the same transaction.
 *
 * @type {FactoryProvider<MemberEventUnitOfWork>}
 */
export const memberEventUnitOfWorkProvider: FactoryProvider<MemberEventUnitOfWork> = {
  provide: MEMBER_EVENT_UNIT_OF_WORK,
  inject: [TenantTransactionRunner, JobProducer],
  useFactory: (runner: TenantTransactionRunner, jobs: JobProducer): MemberEventUnitOfWork =>
    new TenantMemberEventUnitOfWork(runner, jobs),
};
