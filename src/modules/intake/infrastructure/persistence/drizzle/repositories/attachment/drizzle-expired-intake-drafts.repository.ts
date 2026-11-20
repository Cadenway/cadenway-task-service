import { runWithOrganizationContext } from '@cadenway/nest-common';
import type {
  SystemTransactionRunner,
  TenantTransactionRunner,
} from '@cadenway/nest-common/database';
import type { OutboxWriter } from '@cadenway/nest-messaging/outbox';
import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm';

import type { ExpiredIntakeDraft } from '../../../../../application/models/attachment/expired-intake-draft.model.js';
import type { ExpireIntakeDrafts } from '../../../../../application/ports/outbound/transactions/attachment/expire-intake-drafts.port.js';
import { IntakeAttachmentDraft } from '../../../../../domain/aggregates/attachment/intake-attachment-draft.aggregate.js';
import { OutboxIntakeAttachmentDecisions } from '../../../../messaging/outbox/attachment/outbox-intake-attachment-decisions.adapter.js';
import { intakeAttachmentDrafts } from '../../schemas/attachment/intake-attachment-draft.schema.js';
import { DrizzleIntakeAttachments } from './drizzle-intake-attachments.repository.js';

/** Scans expired IDs as system and releases each draft in its own tenant transaction. */
export class DrizzleExpiredIntakeDrafts implements ExpireIntakeDrafts {
  // #region Constructor
  /** Binds both transaction runners and the transactional event writer. */
  public constructor(
    private readonly system: SystemTransactionRunner,
    private readonly tenant: TenantTransactionRunner,
    private readonly outbox: OutboxWriter,
  ) {}
  // #endregion

  // #region Methods
  /** Selects a bounded page without holding system locks across tenant transactions. */
  public findExpired(limit: number): Promise<readonly ExpiredIntakeDraft[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new RangeError('Intake draft cleanup accepts at most 100 candidates.');
    }
    return this.system.run(({ db }) =>
      db
        .select({
          organizationId: intakeAttachmentDrafts.organizationId,
          publicationId: intakeAttachmentDrafts.publicationId,
          draftDigest: intakeAttachmentDrafts.draftDigest,
        })
        .from(intakeAttachmentDrafts)
        .where(
          and(
            isNull(intakeAttachmentDrafts.closedAt),
            lte(intakeAttachmentDrafts.expiresAt, sql`statement_timestamp()`),
          ),
        )
        .orderBy(
          asc(intakeAttachmentDrafts.expiresAt),
          asc(intakeAttachmentDrafts.organizationId),
          asc(intakeAttachmentDrafts.publicationId),
          asc(intakeAttachmentDrafts.draftDigest),
        )
        .limit(limit),
    );
  }

  /** Rechecks expiry while locking the draft and atomically records all released decisions. */
  public expire(candidate: ExpiredIntakeDraft): Promise<boolean> {
    const organizationId = candidate.organizationId.toLowerCase();
    return runWithOrganizationContext(
      { organizationId, actor: { type: 'system', id: null }, role: null, scopes: [] },
      () =>
        this.tenant.run(async (scope) => {
          const rows = await scope.db
            .select()
            .from(intakeAttachmentDrafts)
            .where(
              and(
                eq(intakeAttachmentDrafts.organizationId, organizationId),
                eq(intakeAttachmentDrafts.publicationId, candidate.publicationId),
                eq(intakeAttachmentDrafts.draftDigest, candidate.draftDigest),
                isNull(intakeAttachmentDrafts.closedAt),
                lte(intakeAttachmentDrafts.expiresAt, sql`statement_timestamp()`),
              ),
            )
            .limit(1)
            .for('update', { skipLocked: true });
          const row = rows[0];
          if (row === undefined) return false;
          const draft = IntakeAttachmentDraft.restore(row);
          const store = new DrizzleIntakeAttachments(scope.db, organizationId);
          const outbox = new OutboxIntakeAttachmentDecisions(scope, this.outbox);
          for (const reservation of await store.listReservations(draft)) {
            const released = reservation.release(draft.snapshot);
            if (released.decision === undefined)
              throw new Error('An active reservation must release.');
            await store.saveReservation(released);
            await outbox.append(released.decision);
          }
          await store.saveDraft(draft.close(draft.snapshot, new Date()));
          return true;
        }),
    );
  }
  // #endregion
}
