import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, eq, sql } from 'drizzle-orm';

import { Onboarding } from '../../../../../domain/aggregates/onboarding/onboarding.aggregate.js';
import type { OnboardingState } from '../../../../../domain/value-objects/onboarding/onboarding-state.value-object.js';
import { onboardingStates } from '../../schemas/onboarding/onboarding-state.schema.js';

/** Maps a tenant-scoped row to the aggregate, including its domain invariants. */
function restore(row: typeof onboardingStates.$inferSelect): Onboarding {
  return Onboarding.restore({
    organizationId: row.organizationId,
    userId: row.userId,
    version: row.version,
    wizard: {
      status: row.status,
      step: row.step,
      preset: row.preset,
      name: row.name,
      prefix: row.prefix,
      color: row.color,
    },
    provisioning:
      row.spaceId === null || row.firstListId === null
        ? null
        : { spaceId: row.spaceId, firstListId: row.firstListId },
    checklist: {
      presentation: row.presentation,
      firstTaskCreated: row.firstTaskCreated,
      invitationSent: row.invitationSent,
      boardTried: row.boardTried,
    },
  });
}

/** Persists private onboarding state inside the caller's tenant transaction. */
export class DrizzleOnboardingRepository {
  // #region Constructor
  /** Binds operations to the tenant transaction. */
  public constructor(private readonly db: TransactionDatabase) {}
  // #endregion

  // #region Methods
  /** Ensures a lockable initial row exists, retaining another transaction's established state. */
  public async createInitial(organizationId: string, userId: string): Promise<void> {
    await this.db.insert(onboardingStates).values({ organizationId, userId }).onConflictDoNothing();
  }

  /** Finds the owner's state, optionally locking the already existing row through commit. */
  public async find(
    organizationId: string,
    userId: string,
    lock: boolean,
  ): Promise<Onboarding | null> {
    const query = this.db
      .select()
      .from(onboardingStates)
      .where(
        and(
          eq(onboardingStates.organizationId, organizationId),
          eq(onboardingStates.userId, userId),
        ),
      )
      .limit(1);
    const rows = lock ? await query.for('update') : await query;
    return rows[0] === undefined ? null : restore(rows[0]);
  }

  /** Saves a changed aggregate only when the previous version is still current. */
  public async save(state: OnboardingState, expectedVersion: number): Promise<boolean> {
    if (state.version !== expectedVersion + 1) {
      throw new Error('Onboarding updates must advance the version exactly once.');
    }
    const rows = await this.db
      .update(onboardingStates)
      .set({
        version: state.version,
        status: state.wizard.status,
        step: state.wizard.step,
        preset: state.wizard.preset,
        name: state.wizard.name,
        prefix: state.wizard.prefix,
        color: state.wizard.color,
        spaceId: state.provisioning?.spaceId ?? null,
        firstListId: state.provisioning?.firstListId ?? null,
        presentation: state.checklist.presentation,
        firstTaskCreated: state.checklist.firstTaskCreated,
        invitationSent: state.checklist.invitationSent,
        boardTried: state.checklist.boardTried,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(
        and(
          eq(onboardingStates.organizationId, state.organizationId),
          eq(onboardingStates.userId, state.userId),
          eq(onboardingStates.version, expectedVersion),
        ),
      )
      .returning({ userId: onboardingStates.userId });
    return rows.length === 1;
  }

  /** Marks the first ordinary task in the provisioned space, once, in the task transaction. */
  public async recordFirstTask(
    organizationId: string,
    userId: string,
    spaceId: string,
  ): Promise<boolean> {
    const rows = await this.db
      .update(onboardingStates)
      .set({
        firstTaskCreated: true,
        version: sql`${onboardingStates.version} + 1`,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(
        and(
          eq(onboardingStates.organizationId, organizationId),
          eq(onboardingStates.userId, userId),
          eq(onboardingStates.spaceId, spaceId),
          eq(onboardingStates.firstTaskCreated, false),
        ),
      )
      .returning({ userId: onboardingStates.userId });
    return rows.length === 1;
  }
  // #endregion
}
