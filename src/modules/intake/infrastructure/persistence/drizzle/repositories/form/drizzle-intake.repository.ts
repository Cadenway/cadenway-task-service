import { createHash, randomBytes } from 'node:crypto';

import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';

import type { IntakeSubmissionClaim } from '../../../../../application/models/form/intake-submission-claim.model.js';
import { IntakeForm } from '../../../../../domain/aggregates/form/intake-form.aggregate.js';
import type { IntakeFormConfiguration } from '../../../../../domain/value-objects/form/intake-form-configuration.value-object.js';
import { intakeContacts } from '../../schemas/form/intake-contact.schema.js';
import { intakeForms } from '../../schemas/form/intake-form.schema.js';
import { intakePublications } from '../../schemas/form/intake-publication.schema.js';
import { intakeSubmissions } from '../../schemas/form/intake-submission.schema.js';
import { intakeReceiptCutoff } from './drizzle-expired-intake-receipts.repository.js';

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function restore(row: typeof intakeForms.$inferSelect): IntakeForm {
  return IntakeForm.reconstitute({
    title: row.title,
    description: row.description,
    fields: row.fields,
    defaultStatus: row.defaultStatus,
    defaultAssigneeId: row.defaultAssigneeId,
    publicKey: row.publicKey,
    version: row.version,
  });
}

/** Storage operations bound to a verified tenant and its active transaction. */
export class DrizzleIntakeRepository {
  // #region Constructor
  /** Keeps the organization explicit in every query. */
  public constructor(
    private readonly db: TransactionDatabase,
    private readonly organizationId: string,
  ) {}
  // #endregion

  // #region Methods
  /** Holds the settings lock for a validated list UUID until this transaction completes. */
  public async holdSettings(listId: string, mode: 'shared' | 'exclusive'): Promise<void> {
    const key = `intake-settings:${this.organizationId.toLowerCase()}:${listId.toLowerCase()}`;
    if (mode === 'shared') {
      await this.db.execute(sql`select pg_advisory_xact_lock_shared(hashtextextended(${key}, 0))`);
      return;
    }
    await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }

  /** Loads a list's stored draft, with an optional lock through commit. */
  public async findForm(listId: string, lock: boolean): Promise<IntakeForm | null> {
    const query = this.db
      .select()
      .from(intakeForms)
      .where(
        and(eq(intakeForms.organizationId, this.organizationId), eq(intakeForms.listId, listId)),
      )
      .limit(1);
    const rows = lock ? await query.for('update') : await query;
    const row = rows[0];
    if (row === undefined) return null;
    return restore(row);
  }

  /** Holds a shared form lock while an anonymous submission revalidates its active key. */
  public async findPublishedForm(
    listId: string,
    key: string,
    lock: boolean,
  ): Promise<IntakeForm | null> {
    const query = this.db
      .select()
      .from(intakeForms)
      .where(
        and(
          eq(intakeForms.organizationId, this.organizationId),
          eq(intakeForms.listId, listId),
          eq(intakeForms.publicKey, key),
        ),
      )
      .limit(1);
    const rows = lock ? await query.for('share') : await query;
    const row = rows[0];
    if (row === undefined) return null;
    return restore(row);
  }

  /** Reserves a globally unique digest before a link can be made active. */
  public async reservePublicationKey(): Promise<string> {
    for (;;) {
      const key = randomBytes(32).toString('base64url');
      const inserted = await this.db
        .insert(intakePublications)
        .values({
          organizationId: this.organizationId,
          keyDigest: digest(key),
        })
        .onConflictDoNothing()
        .returning({ id: intakePublications.id });
      if (inserted.length === 1) return key;
    }
  }

  /** Saves the aggregate version and binds a newly reserved publication to its list. */
  public async saveForm(
    listId: string,
    state: IntakeFormConfiguration,
    expectedVersion: number | null,
  ): Promise<void> {
    if (state.publicKey !== null) {
      const rows = await this.db
        .update(intakePublications)
        .set({ listId })
        .where(
          and(
            eq(intakePublications.organizationId, this.organizationId),
            eq(intakePublications.keyDigest, digest(state.publicKey)),
            sql`(${intakePublications.listId} is null or ${intakePublications.listId} = ${listId})`,
          ),
        )
        .returning({ id: intakePublications.id });
      if (rows.length !== 1)
        throw new Error('The intake publication was not reserved for this list.');
    }
    const values = { ...state, updatedAt: sql`clock_timestamp()` };
    if (expectedVersion === null) {
      await this.db
        .insert(intakeForms)
        .values({ organizationId: this.organizationId, listId, ...values });
      return;
    }
    if (state.version !== expectedVersion + 1)
      throw new Error('An intake update must advance its version once.');
    const rows = await this.db
      .update(intakeForms)
      .set(values)
      .where(
        and(
          eq(intakeForms.organizationId, this.organizationId),
          eq(intakeForms.listId, listId),
          eq(intakeForms.version, expectedVersion),
        ),
      )
      .returning({ listId: intakeForms.listId });
    if (rows.length !== 1) throw new Error('The locked intake form changed before saving.');
  }

  /** Claims a request without waiting behind another transaction holding the same key. */
  public async claimSubmission(
    listId: string,
    publicationKey: string,
    idempotencyKey: string,
    fingerprint: string,
  ): Promise<IntakeSubmissionClaim> {
    const publicationDigest = digest(publicationKey);
    const keyDigest = digest(idempotencyKey);
    const lockKey = `intake:${this.organizationId}:${publicationDigest}:${keyDigest}`;
    const result = await this.db.execute<{ acquired: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) as acquired`,
    );
    if (result.rows[0]?.acquired !== true) return { kind: 'in-progress' };
    const rows = await this.db
      .select({ fingerprint: intakeSubmissions.fingerprint, receipt: intakeSubmissions.receipt })
      .from(intakeSubmissions)
      .innerJoin(
        intakePublications,
        and(
          eq(intakePublications.organizationId, intakeSubmissions.organizationId),
          eq(intakePublications.id, intakeSubmissions.publicationId),
        ),
      )
      .where(
        and(
          eq(intakeSubmissions.organizationId, this.organizationId),
          eq(intakePublications.organizationId, this.organizationId),
          eq(intakePublications.listId, listId),
          eq(intakePublications.keyDigest, publicationDigest),
          eq(intakeSubmissions.keyDigest, keyDigest),
          gt(intakeSubmissions.createdAt, intakeReceiptCutoff),
        ),
      )
      .limit(1);
    const prior = rows[0];
    if (prior === undefined) return { kind: 'acquired' };
    return prior.fingerprint === fingerprint
      ? { kind: 'replay', receipt: prior.receipt }
      : { kind: 'key-reused' };
  }

  /** Stores a receipt atomically with the created task, replacing an expired key. */
  public async completeSubmission(
    listId: string,
    publicationKey: string,
    idempotencyKey: string,
    fingerprint: string,
    receipt: string,
  ): Promise<void> {
    const publications = await this.db
      .select({ id: intakePublications.id })
      .from(intakePublications)
      .where(
        and(
          eq(intakePublications.organizationId, this.organizationId),
          eq(intakePublications.listId, listId),
          eq(intakePublications.keyDigest, digest(publicationKey)),
        ),
      )
      .limit(1);
    const publication = publications[0];
    if (publication === undefined)
      throw new Error('The intake publication disappeared during submission.');
    const values = {
      organizationId: this.organizationId,
      publicationId: publication.id,
      keyDigest: digest(idempotencyKey),
      fingerprint,
      receipt,
      createdAt: sql`clock_timestamp()`,
    };
    await this.db
      .insert(intakeSubmissions)
      .values(values)
      .onConflictDoUpdate({
        target: [
          intakeSubmissions.organizationId,
          intakeSubmissions.publicationId,
          intakeSubmissions.keyDigest,
        ],
        set: { fingerprint, receipt, createdAt: values.createdAt },
      });
  }

  /** Persists the contact separately from ordinary task and event data. */
  public async saveContact(taskId: string, email: string): Promise<void> {
    await this.db
      .insert(intakeContacts)
      .values({ organizationId: this.organizationId, taskId, email });
  }

  /** Reads contact only after the caller has checked the task's current placement. */
  public async findContact(taskId: string): Promise<string | null> {
    const rows = await this.db
      .select({ email: intakeContacts.email })
      .from(intakeContacts)
      .where(
        and(
          eq(intakeContacts.organizationId, this.organizationId),
          eq(intakeContacts.taskId, taskId),
        ),
      )
      .limit(1);
    return rows[0]?.email ?? null;
  }

  /** Removes contacts with the bounded batch of tasks physically purged by the caller. */
  public async deleteContacts(taskIds: readonly string[]): Promise<void> {
    if (taskIds.length === 0) return;
    if (taskIds.length > 500) throw new Error('Intake contact cleanup accepts at most 500 tasks.');
    await this.db
      .delete(intakeContacts)
      .where(
        and(
          eq(intakeContacts.organizationId, this.organizationId),
          inArray(intakeContacts.taskId, taskIds),
        ),
      );
  }

  /** Removes settings after physical list deletion while preserving key reservations. */
  public async deleteForm(listId: string): Promise<void> {
    await this.db
      .delete(intakeForms)
      .where(
        and(eq(intakeForms.organizationId, this.organizationId), eq(intakeForms.listId, listId)),
      );
  }
  // #endregion
}
