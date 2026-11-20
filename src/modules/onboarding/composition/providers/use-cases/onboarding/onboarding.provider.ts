import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import type { FactoryProvider } from '@nestjs/common';

import { FindOrganizationMember } from '../../../../../organization-members/public/membership/find-organization-member.js';
import { ProvisionOnboardingSpace } from '../../../../../spaces/public/space/provision-onboarding-space.js';
import { CreateOnboardingExample } from '../../../../../tasks/public/onboarding/create-onboarding-example.js';
import { OnboardingPrefixTaken } from '../../../../application/models/onboarding/onboarding-prefix-taken.model.js';
import { OnboardingRefusal } from '../../../../application/models/onboarding/onboarding-refusal.model.js';
import type { OnboardingRepository } from '../../../../application/ports/outbound/persistence/onboarding/onboarding-repository.port.js';
import type { OnboardingProvisioner } from '../../../../application/ports/outbound/provisioning/onboarding/onboarding-provisioner.port.js';
import type { OnboardingUnitOfWork } from '../../../../application/ports/outbound/transactions/onboarding/onboarding-unit-of-work.port.js';
import { FinishOnboarding } from '../../../../application/use-cases/commands/onboarding/finish-onboarding/finish-onboarding.use-case.js';
import { UpdateOnboardingChecklist } from '../../../../application/use-cases/commands/onboarding/update-onboarding-checklist/update-onboarding-checklist.use-case.js';
import { UpdateOnboarding } from '../../../../application/use-cases/commands/onboarding/update-onboarding/update-onboarding.use-case.js';
import { GetOnboarding } from '../../../../application/use-cases/queries/onboarding/get-onboarding/get-onboarding.use-case.js';
import { DrizzleOnboardingRepository } from '../../../../infrastructure/persistence/drizzle/repositories/onboarding/drizzle-onboarding.repository.js';

const ONBOARDING_WORK = Symbol('OnboardingUnitOfWork');
const PROVISIONER = Symbol('OnboardingProvisioner');
const stateUseCases = [GetOnboarding, UpdateOnboarding, UpdateOnboardingChecklist] as const;

/** Binds state operations and ordinary provisioning commands to one tenant transaction. */
export const onboardingProviders: readonly FactoryProvider[] = [
  {
    provide: ONBOARDING_WORK,
    inject: [TenantTransactionRunner],
    useFactory: (runner: TenantTransactionRunner): OnboardingUnitOfWork => ({
      run: <T>(work: (repository: OnboardingRepository) => Promise<T>): Promise<T> =>
        runner.run((tx) => work(new DrizzleOnboardingRepository(tx.db))),
      runReadOnly: <T>(work: (repository: OnboardingRepository) => Promise<T>): Promise<T> =>
        runner.run((tx) => work(new DrizzleOnboardingRepository(tx.db)), {
          readOnly: true,
          isolationLevel: 'repeatable read',
        }),
    }),
  },
  {
    provide: PROVISIONER,
    inject: [ProvisionOnboardingSpace, CreateOnboardingExample],
    useFactory: (
      spaces: ProvisionOnboardingSpace,
      tasks: CreateOnboardingExample,
    ): OnboardingProvisioner => ({
      provision: async (organizationId, actorUserId, plan, preset) => {
        const placed = await spaces
          .execute({
            organizationId,
            actorUserId,
            name: plan.name,
            prefix: plan.prefix,
            color: plan.color,
            description: preset.spaceDescription,
            listNames: preset.listNames,
          })
          .catch((error: unknown) => {
            const refusal = ProvisionOnboardingSpace.refusalOf(error);
            if (refusal?.reason === 'prefix-taken') throw new OnboardingPrefixTaken(refusal.prefix);
            if (refusal?.reason === 'organization-not-found')
              throw new OnboardingRefusal('organization-not-found');
            if (refusal?.reason === 'role-forbidden') throw new OnboardingRefusal('role-forbidden');
            throw error;
          });
        const firstListId = placed.listIds[0];
        if (firstListId === undefined) throw new Error('Onboarding did not produce a first list.');
        for (const example of preset.examples) {
          const listId = placed.listIds[example.listIndex];
          if (listId === undefined) throw new Error('An onboarding example has no list.');
          await tasks.execute({
            organizationId,
            actorUserId,
            listId,
            name: example.name,
            description: example.description,
            status: example.status,
          });
        }
        return { spaceId: placed.spaceId, firstListId };
      },
    }),
  },
  {
    provide: FinishOnboarding,
    inject: [ONBOARDING_WORK, FindOrganizationMember, PROVISIONER],
    useFactory: (
      work: OnboardingUnitOfWork,
      members: FindOrganizationMember,
      provisioner: OnboardingProvisioner,
    ): FinishOnboarding =>
      new FinishOnboarding(
        work,
        {
          find: (organizationId, userId, lock) => members.execute({ organizationId, userId, lock }),
        },
        provisioner,
      ),
  },
  ...stateUseCases.map((UseCase) => ({
    provide: UseCase,
    inject: [ONBOARDING_WORK, FindOrganizationMember],
    useFactory: (work: OnboardingUnitOfWork, members: FindOrganizationMember) =>
      new UseCase(work, {
        find: (organizationId, userId, lock) => members.execute({ organizationId, userId, lock }),
      }),
  })),
];
