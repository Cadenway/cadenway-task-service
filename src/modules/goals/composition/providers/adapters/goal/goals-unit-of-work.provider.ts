import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import type { TransactionScope } from '@cadenway/nest-common/database';
import type { FactoryProvider } from '@nestjs/common';

import { FindOrganizationMember } from '../../../../../organization-members/public/membership/find-organization-member.js';
import { ResolveGoalSpaces } from '../../../../../spaces/public/goal/resolve-goal-spaces.js';
import { MeasureGoalTargets } from '../../../../../tasks/public/goal/measure-goal-targets.js';
import type { GoalViewer } from '../../../../application/models/goal/goal-viewer.model.js';
import type { GoalsStore } from '../../../../application/models/goal/goals-store.model.js';
import type { GoalsUnitOfWork } from '../../../../application/ports/outbound/transactions/goal/goals-unit-of-work.port.js';
import { DrizzleGoalRepository } from '../../../../infrastructure/persistence/drizzle/repositories/goal/drizzle-goal.repository.js';
import { GOALS_UNIT_OF_WORK } from '../../../tokens/goal/goals-unit-of-work.token.js';

/** Joins each owner lookup to the same tenant transaction as the goals repository. */
export const goalsUnitOfWorkProvider: FactoryProvider<GoalsUnitOfWork> = {
  provide: GOALS_UNIT_OF_WORK,
  inject: [TenantTransactionRunner, FindOrganizationMember, ResolveGoalSpaces, MeasureGoalTargets],
  useFactory: (
    runner: TenantTransactionRunner,
    memberships: FindOrganizationMember,
    spaces: ResolveGoalSpaces,
    targets: MeasureGoalTargets,
  ): GoalsUnitOfWork => {
    const resolveSpaces = (viewer: GoalViewer, spaceIds: readonly string[], lock: boolean) =>
      spaces.execute({
        organizationId: viewer.organizationId,
        viewerUserId: viewer.userId,
        viewerRole: viewer.role,
        spaceIds,
        lock,
      });

    const findViewer: GoalsStore['findViewer'] = async ({ organizationId, userId }, lock) => {
      const member = await memberships.execute({ organizationId, userId, lock });
      return member === null ? null : { organizationId, userId, role: member.role };
    };

    const findScope: GoalsStore['findScope'] = async (viewer, spaceId, lock) => {
      const [space] = await resolveSpaces(viewer, [spaceId], lock);
      return space?.role ?? null;
    };

    const store = ({ db }: TransactionScope): GoalsStore => ({
      goals: new DrizzleGoalRepository(db),
      findViewer,
      findScope,
      visibleSpaces: async (viewer, spaceIds) =>
        new Set((await resolveSpaces(viewer, spaceIds, false)).map(({ id }) => id)),
      ownerCanReadScope: async (organizationId, userId, spaceId, lock) => {
        const owner = await findViewer({ organizationId, userId }, lock);
        if (owner === null) return false;
        return spaceId === null
          ? owner.role !== 'guest'
          : (await findScope(owner, spaceId, false)) !== null;
      },
      measureLinks: ({ organizationId, userId, role }, results, lock, scopeSpaceId) =>
        targets.execute({
          organizationId,
          viewer: { userId, role },
          listIds: results.flatMap((result) =>
            result.kind === 'list-progress' ? [result.listId] : [],
          ),
          milestoneKeys: results.flatMap((result) =>
            result.kind === 'milestone' ? [result.taskKey] : [],
          ),
          lock,
          scopeSpaceId,
        }),
    });

    return {
      run: (work) => runner.run((scope) => work(store(scope))),
      read: (work) =>
        runner.run((scope) => work(store(scope)), {
          readOnly: true,
          isolationLevel: 'repeatable read',
        }),
    };
  },
};
