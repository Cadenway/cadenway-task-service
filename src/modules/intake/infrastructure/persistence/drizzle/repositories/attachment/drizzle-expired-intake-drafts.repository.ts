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
import { intakeAttachmentReservations } from '../../schemas/attachment/intake-attachment-reservation.schema.js';
import { DrizzleIntakeAttachments } from './drizzle-intake-attachments.repository.js';

/** Scans expired drafts as system and binds each closure to its own tenant transaction. */
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

  /** Rechecks expiry and binds the decision callback to the transaction holding the draft lock. */
  public withExpiredDraft(
    candidate: ExpiredIntakeDraft,
    decide: Parameters<ExpireIntakeDrafts['withExpiredDraft']>[1],
  ): Promise<boolean> {
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
          await decide(draft, {
            listReservations: store.listReservations.bind(store),
            saveDraft: store.saveDraft.bind(store),
            async recordDecision(reservation) {
              const decision = reservation.decision;
              if (decision === undefined) {
                throw new Error('An intake attachment terminal transition is required.');
              }
              await store.saveReservation(reservation);
              await outbox.append(decision);
            },
          });
          return true;
        }),
    );
  }

  /** Keeps closed draft tombstones and forgets only old terminal reservation details. */
  public purgeTerminalReservations(limit: number): Promise<void> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      throw new RangeError('Intake reservation retention accepts at most 500 rows.');
    }
    return this.system.run(async ({ db }) => {
      await db.execute(sql`
        with expired as (
          select reservation.organization_id, reservation.attachment_id
          from ${intakeAttachmentReservations} as reservation
          where reservation.status in ('claimed', 'released')
            and reservation.updated_at <= statement_timestamp() - interval '24 hours'
            and exists (
              select 1 from ${intakeAttachmentDrafts} as draft
              where draft.organization_id = reservation.organization_id
                and draft.publication_id = reservation.publication_id
                and draft.draft_digest = reservation.draft_digest
                and draft.closed_at is not null
            )
          order by reservation.updated_at, reservation.organization_id, reservation.attachment_id
          limit ${limit}
          for update of reservation skip locked
        )
        delete from ${intakeAttachmentReservations} as reservation
        using expired
        where reservation.organization_id = expired.organization_id
          and reservation.attachment_id = expired.attachment_id
      `);
    });
  }
  // #endregion
}
