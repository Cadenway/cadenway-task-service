import type { SystemTransactionRunner, TransactionDatabase } from '@cadenway/nest-common/database';
import { asc, sql } from 'drizzle-orm';

import type { MembershipRebuildRow } from '../../../../../application/projections/membership/membership-rebuild-row.projection.js';
import { organizationMembers } from '../../schemas/membership/organization-member.schema.js';

const PAGE_SIZE = 500;

/** Checks the restored projection in a read-only transaction before enabling the import. */
export class DrizzleRebuildMembershipScan {
  // #region Constructor
  /** Binds the reader to Task's own database. */
  public constructor(private readonly system: SystemTransactionRunner) {}
  // #endregion

  // #region Methods
  /** Keeps a stable PostgreSQL snapshot for the comparison and bounds the read-ahead page. */
  public verify(
    check: (rows: AsyncIterable<MembershipRebuildRow>) => Promise<void>,
  ): Promise<void> {
    return this.system.run(({ db }) => check(readProjection(db)), {
      readOnly: true,
      isolationLevel: 'repeatable read',
    });
  }
  // #endregion
}

async function* readProjection(db: TransactionDatabase): AsyncGenerator<MembershipRebuildRow> {
  let after: MembershipRebuildRow | undefined;
  for (;;) {
    const page: MembershipRebuildRow[] = await db
      .select({
        organizationId: organizationMembers.organizationId,
        memberId: organizationMembers.id,
        userId: organizationMembers.userId,
        role: organizationMembers.role,
        version: organizationMembers.version,
        removedAt: organizationMembers.removedAt,
      })
      .from(organizationMembers)
      .where(
        after === undefined
          ? undefined
          : sql`(${organizationMembers.organizationId}, ${organizationMembers.id}) > (${after.organizationId}::uuid, ${after.memberId}::uuid)`,
      )
      .orderBy(asc(organizationMembers.organizationId), asc(organizationMembers.id))
      .limit(PAGE_SIZE);
    yield* page;
    if (page.length < PAGE_SIZE) return;
    after = page.at(-1);
  }
}
