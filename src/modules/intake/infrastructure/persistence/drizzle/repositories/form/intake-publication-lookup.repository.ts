import type { SystemTransactionRunner } from '@cadenway/nest-common/database';
import { and, eq, isNotNull } from 'drizzle-orm';
import { createHash } from 'node:crypto';

import type { IntakeTarget } from '../../../../../application/models/form/intake-target.model.js';
import { intakePublications } from '../../schemas/form/intake-publication.schema.js';

/** Finds the tenant for an opaque public key without reading any form or contact fields. */
export class IntakePublicationLookup {
  // #region Constructor
  /** Binds public-key resolution to the system transaction runner. */
  public constructor(private readonly system: SystemTransactionRunner) {}
  // #endregion

  // #region Methods
  /** Resolves only this key, then closes the system transaction before the tenant read. */
  public async resolve(key: string): Promise<IntakeTarget | null> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(key)) return null;
    const digest = createHash('sha256').update(key, 'utf8').digest('hex');
    return this.system.run(
      async ({ db }) => {
        const [target] = await db
          .select({
            organizationId: intakePublications.organizationId,
            listId: intakePublications.listId,
          })
          .from(intakePublications)
          .where(
            and(eq(intakePublications.keyDigest, digest), isNotNull(intakePublications.listId)),
          )
          .limit(1);
        return target === undefined || target.listId === null
          ? null
          : { organizationId: target.organizationId, listId: target.listId };
      },
      { readOnly: true },
    );
  }
  // #endregion
}
