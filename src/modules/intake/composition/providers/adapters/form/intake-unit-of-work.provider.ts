import { getOrganizationContext, runWithOrganizationContext } from '@cadenway/nest-common';
import { SystemTransactionRunner, TenantTransactionRunner } from '@cadenway/nest-common/database';
import { OutboxWriter } from '@cadenway/nest-messaging/outbox';
import type { FactoryProvider } from '@nestjs/common';

import { FindOrganizationMember } from '../../../../../organization-members/public/membership/find-organization-member.js';
import { ResolveIntakePlacement } from '../../../../../spaces/public/intake/resolve-intake-placement.js';
import { CreateIntakeTask } from '../../../../../tasks/public/intake/create-intake-task.js';
import { ResolveIntakeContactTask } from '../../../../../tasks/public/intake/resolve-intake-contact-task.js';
import type { IntakeStore } from '../../../../application/models/form/intake-store.model.js';
import type { IntakeUnitOfWork } from '../../../../application/ports/outbound/transactions/form/intake-unit-of-work.port.js';
import { IntakePublicationLookup } from '../../../../infrastructure/persistence/drizzle/repositories/form/intake-publication-lookup.repository.js';
import { INTAKE_UNIT_OF_WORK } from '../../../tokens/form/intake-unit-of-work.token.js';
import { createIntakeStore } from './create-intake-store.provider.js';

/** Preserves authenticated scope or enters the tenant established by the public-key lookup. */
function inIntakeTenant<T>(organizationId: string, work: () => Promise<T>): Promise<T> {
  const context = getOrganizationContext();
  if (context?.organizationId?.toLowerCase() === organizationId) return work();
  if (context?.organizationId === null && context.actor.type === 'system') {
    return runWithOrganizationContext({ ...context, organizationId }, work);
  }
  throw new Error('Intake requires a matching organization or an unscoped system actor.');
}

/** Connects system lookup and tenant storage without nesting their transactions. */
export const intakeUnitOfWorkProvider: FactoryProvider<IntakeUnitOfWork> = {
  provide: INTAKE_UNIT_OF_WORK,
  inject: [
    SystemTransactionRunner,
    TenantTransactionRunner,
    FindOrganizationMember,
    ResolveIntakePlacement,
    CreateIntakeTask,
    ResolveIntakeContactTask,
    OutboxWriter,
  ],
  useFactory: (
    system: SystemTransactionRunner,
    tenant: TenantTransactionRunner,
    members: FindOrganizationMember,
    placement: ResolveIntakePlacement,
    tasks: CreateIntakeTask,
    contactTask: ResolveIntakeContactTask,
    outbox: OutboxWriter,
  ): IntakeUnitOfWork => {
    const lookup = new IntakePublicationLookup(system);
    const directories = { members, placement, tasks, contactTask };
    return {
      resolvePublicKey(key) {
        const context = getOrganizationContext();
        if (context?.organizationId !== null || context.actor.type !== 'system') {
          throw new Error('Intake publication lookup requires an unscoped system actor.');
        }
        return lookup.resolve(key);
      },
      run<T>(organizationId: string, work: (store: IntakeStore) => Promise<T>): Promise<T> {
        const normalizedId = organizationId.toLowerCase();
        return inIntakeTenant(normalizedId, () =>
          tenant.run((scope) => work(createIntakeStore(scope, normalizedId, directories, outbox))),
        );
      },
      read<T>(organizationId: string, work: (store: IntakeStore) => Promise<T>): Promise<T> {
        const normalizedId = organizationId.toLowerCase();
        return inIntakeTenant(normalizedId, () =>
          tenant.run((scope) => work(createIntakeStore(scope, normalizedId, directories, outbox)), {
            readOnly: true,
            isolationLevel: 'repeatable read',
          }),
        );
      },
    };
  },
};
