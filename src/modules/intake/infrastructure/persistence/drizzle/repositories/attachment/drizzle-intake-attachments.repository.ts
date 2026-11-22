import { createHash } from 'node:crypto';

import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { IntakeAttachmentDeclaration } from '../../../../../application/models/attachment/intake-attachment-declaration.model.js';
import type { IntakeAttachmentReservationClaim } from '../../../../../application/models/attachment/intake-attachment-reservation-claim.model.js';
import { IntakeAttachmentDraft } from '../../../../../domain/aggregates/attachment/intake-attachment-draft.aggregate.js';
import { IntakeAttachmentReservation } from '../../../../../domain/aggregates/attachment/intake-attachment-reservation.aggregate.js';
import {
  INTAKE_ATTACHMENT_DRAFT_LIFETIME_MS,
  MAX_INTAKE_ATTACHMENT_DRAFTS_PER_PUBLICATION,
  MAX_INTAKE_ATTACHMENTS,
} from '../../../../../domain/value-objects/attachment/intake-attachment-limits.value-object.js';
import { intakeAttachmentDrafts } from '../../schemas/attachment/intake-attachment-draft.schema.js';
import { intakeAttachmentReservations } from '../../schemas/attachment/intake-attachment-reservation.schema.js';
import { intakePublications } from '../../schemas/form/intake-publication.schema.js';

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function declarationDigest(
  attachmentId: string,
  { fileName, contentType, sizeBytes }: IntakeAttachmentDeclaration,
): string {
  return digest(JSON.stringify([attachmentId, fileName, contentType, sizeBytes]));
}

/** Tenant-scoped attachment reservations using the caller's active transaction. */
export class DrizzleIntakeAttachments {
  // #region Constructor
  /** Binds all operations to the tenant established by the publication lookup. */
  public constructor(
    private readonly db: TransactionDatabase,
    private readonly organizationId: string,
  ) {}
  // #endregion

  // #region Methods
  /** Finds the matching publication and takes the draft lock on write paths. */
  public async loadDraft(
    listId: string,
    publicKey: string,
    draftKey: string,
    lock: boolean,
  ): Promise<IntakeAttachmentDraft | null> {
    const query = this.db
      .select({ draft: intakeAttachmentDrafts })
      .from(intakeAttachmentDrafts)
      .innerJoin(
        intakePublications,
        and(
          eq(intakePublications.organizationId, intakeAttachmentDrafts.organizationId),
          eq(intakePublications.id, intakeAttachmentDrafts.publicationId),
        ),
      )
      .where(
        and(
          eq(intakeAttachmentDrafts.organizationId, this.organizationId),
          eq(intakePublications.organizationId, this.organizationId),
          eq(intakePublications.listId, listId),
          eq(intakePublications.keyDigest, digest(publicKey)),
          eq(intakeAttachmentDrafts.draftDigest, digest(draftKey)),
        ),
      )
      .limit(1);
    const rows = lock ? await query.for('update', { of: intakeAttachmentDrafts }) : await query;
    return rows[0] === undefined ? null : IntakeAttachmentDraft.restore(rows[0].draft);
  }

  /** Starts at most one draft per key within the publication budget. */
  public async startDraft(
    listId: string,
    publicKey: string,
    draftKey: string,
    now: Date,
  ): Promise<IntakeAttachmentDraft | null> {
    const existing = await this.loadDraft(listId, publicKey, draftKey, true);
    if (existing !== null) return existing;

    // Serialize admission of new keys. Known keys only need their draft lock.
    const publications = await this.db
      .select({ id: intakePublications.id })
      .from(intakePublications)
      .where(
        and(
          eq(intakePublications.organizationId, this.organizationId),
          eq(intakePublications.listId, listId),
          eq(intakePublications.keyDigest, digest(publicKey)),
        ),
      )
      .limit(1)
      .for('no key update');
    const publication = publications[0];
    if (publication === undefined) throw new Error('The intake publication disappeared.');

    const winner = await this.loadDraft(listId, publicKey, draftKey, true);
    if (winner !== null) return winner;
    const threshold = await this.db
      .select({ draftDigest: intakeAttachmentDrafts.draftDigest })
      .from(intakeAttachmentDrafts)
      .where(
        and(
          eq(intakeAttachmentDrafts.organizationId, this.organizationId),
          eq(intakeAttachmentDrafts.publicationId, publication.id),
        ),
      )
      .orderBy(intakeAttachmentDrafts.draftDigest)
      .offset(MAX_INTAKE_ATTACHMENT_DRAFTS_PER_PUBLICATION - 1)
      .limit(1);
    if (threshold.length > 0) return null;

    await this.db
      .insert(intakeAttachmentDrafts)
      .values({
        organizationId: this.organizationId,
        publicationId: publication.id,
        draftDigest: digest(draftKey),
        expiresAt: new Date(now.getTime() + INTAKE_ATTACHMENT_DRAFT_LIFETIME_MS),
      })
      .onConflictDoNothing();
    const draft = await this.loadDraft(listId, publicKey, draftKey, true);
    if (draft === null) throw new Error('The intake attachment draft disappeared.');
    return draft;
  }

  /** Replays the same request key without extending its original reservation. */
  public async findReservationClaim(
    draft: IntakeAttachmentDraft,
    idempotencyKey: string,
    declaration: IntakeAttachmentDeclaration,
  ): Promise<IntakeAttachmentReservationClaim | null> {
    const { publicationId, draftDigest } = this.binding(draft);
    const rows = await this.db
      .select()
      .from(intakeAttachmentReservations)
      .where(
        and(
          eq(intakeAttachmentReservations.organizationId, this.organizationId),
          eq(intakeAttachmentReservations.publicationId, publicationId),
          eq(intakeAttachmentReservations.draftDigest, draftDigest),
          eq(intakeAttachmentReservations.requestKeyDigest, digest(idempotencyKey)),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row === undefined
      ? null
      : {
          matchesDeclaration:
            row.declarationDigest === declarationDigest(row.attachmentId, declaration),
          reservation: IntakeAttachmentReservation.restore(row),
        };
  }

  /** Generates the allocation identifier in PostgreSQL. */
  public async newAttachmentId(): Promise<string> {
    const result = await this.db.execute<{ id: string }>(sql`select uuidv7() as id`);
    const id = result.rows[0]?.id;
    if (id === undefined) throw new Error('The database did not allocate an attachment ID.');
    return id;
  }

  /** Reads at most five active reservations under the caller's draft lock. */
  public async listReservations(
    draft: IntakeAttachmentDraft,
  ): Promise<readonly IntakeAttachmentReservation[]> {
    const { publicationId, draftDigest } = this.binding(draft);
    const rows = await this.db
      .select()
      .from(intakeAttachmentReservations)
      .where(
        and(
          eq(intakeAttachmentReservations.organizationId, this.organizationId),
          eq(intakeAttachmentReservations.publicationId, publicationId),
          eq(intakeAttachmentReservations.draftDigest, draftDigest),
          inArray(intakeAttachmentReservations.status, ['reserved', 'verified']),
        ),
      )
      .orderBy(intakeAttachmentReservations.attachmentId)
      .limit(MAX_INTAKE_ATTACHMENTS + 1);
    if (rows.length > MAX_INTAKE_ATTACHMENTS)
      throw new Error('The intake draft exceeds its reservation limit.');
    return rows.map((row) => IntakeAttachmentReservation.restore(row));
  }

  /** Persists one allocation and its request fingerprint without its filename. */
  public async insertReservation(
    reservation: IntakeAttachmentReservation,
    idempotencyKey: string,
    declaration: IntakeAttachmentDeclaration,
  ): Promise<void> {
    const snapshot = reservation.snapshot;
    this.requireTenant(snapshot.organizationId);
    await this.db.insert(intakeAttachmentReservations).values({
      ...snapshot,
      requestKeyDigest: digest(idempotencyKey),
      declarationDigest: declarationDigest(snapshot.attachmentId, declaration),
    });
  }

  /** Reads an exact reservation within its draft and locks it for state changes. */
  public async findReservation(
    draft: IntakeAttachmentDraft,
    attachmentId: string,
    lock: boolean,
  ): Promise<IntakeAttachmentReservation | null> {
    const { publicationId, draftDigest } = this.binding(draft);
    const query = this.db
      .select()
      .from(intakeAttachmentReservations)
      .where(
        and(
          eq(intakeAttachmentReservations.organizationId, this.organizationId),
          eq(intakeAttachmentReservations.publicationId, publicationId),
          eq(intakeAttachmentReservations.draftDigest, draftDigest),
          eq(intakeAttachmentReservations.attachmentId, attachmentId),
        ),
      )
      .limit(1);
    const rows = lock ? await query.for('update') : await query;
    return rows[0] === undefined ? null : IntakeAttachmentReservation.restore(rows[0]);
  }

  /** Locks the parent draft before re-reading a reservation addressed by a verified fact. */
  public async findByIdentity(
    publicationId: string,
    attachmentId: string,
  ): Promise<IntakeAttachmentReservation | null> {
    const rows = await this.db
      .select({ draftDigest: intakeAttachmentReservations.draftDigest })
      .from(intakeAttachmentReservations)
      .where(
        and(
          eq(intakeAttachmentReservations.organizationId, this.organizationId),
          eq(intakeAttachmentReservations.publicationId, publicationId),
          eq(intakeAttachmentReservations.attachmentId, attachmentId),
        ),
      )
      .limit(1);
    const binding = rows[0];
    if (binding === undefined) return null;
    const drafts = await this.db
      .select()
      .from(intakeAttachmentDrafts)
      .where(
        and(
          eq(intakeAttachmentDrafts.organizationId, this.organizationId),
          eq(intakeAttachmentDrafts.publicationId, publicationId),
          eq(intakeAttachmentDrafts.draftDigest, binding.draftDigest),
        ),
      )
      .limit(1)
      .for('update');
    const draft = drafts[0];
    return draft === undefined
      ? null
      : this.findReservation(IntakeAttachmentDraft.restore(draft), attachmentId, true);
  }

  /** Saves a transition already decided by the aggregate under the draft lock. */
  public async saveReservation(reservation: IntakeAttachmentReservation): Promise<void> {
    const snapshot = reservation.snapshot;
    this.requireTenant(snapshot.organizationId);
    const rows = await this.db
      .update(intakeAttachmentReservations)
      .set({
        status: snapshot.status,
        taskKey: snapshot.taskKey,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(
        and(
          eq(intakeAttachmentReservations.organizationId, this.organizationId),
          eq(intakeAttachmentReservations.publicationId, snapshot.publicationId),
          eq(intakeAttachmentReservations.draftDigest, snapshot.draftDigest),
          eq(intakeAttachmentReservations.attachmentId, snapshot.attachmentId),
        ),
      )
      .returning({ id: intakeAttachmentReservations.attachmentId });
    if (rows.length !== 1) throw new Error('The locked intake reservation disappeared.');
  }

  /** Saves the irreversible close while retaining the original deadline. */
  public async saveDraft(draft: IntakeAttachmentDraft): Promise<void> {
    const snapshot = this.binding(draft);
    const rows = await this.db
      .update(intakeAttachmentDrafts)
      .set({ closedAt: snapshot.closedAt, updatedAt: sql`clock_timestamp()` })
      .where(
        and(
          eq(intakeAttachmentDrafts.organizationId, this.organizationId),
          eq(intakeAttachmentDrafts.publicationId, snapshot.publicationId),
          eq(intakeAttachmentDrafts.draftDigest, snapshot.draftDigest),
        ),
      )
      .returning({ draftDigest: intakeAttachmentDrafts.draftDigest });
    if (rows.length !== 1) throw new Error('The locked intake draft disappeared.');
  }

  /** Refuses a model created in another tenant. */
  private requireTenant(organizationId: string): void {
    if (organizationId.toLowerCase() !== this.organizationId.toLowerCase()) {
      throw new Error('The intake attachment tenant does not match the transaction.');
    }
  }

  /** Reuses only a draft whose owner agrees with this transaction. */
  private binding(draft: IntakeAttachmentDraft): IntakeAttachmentDraft['snapshot'] {
    const snapshot = draft.snapshot;
    this.requireTenant(snapshot.organizationId);
    return snapshot;
  }
  // #endregion
}
