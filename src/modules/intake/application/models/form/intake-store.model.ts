import type { IntakeFormConfiguration } from '../../../domain/value-objects/form/intake-form-configuration.value-object.js';
import type { IntakeSubmission } from '../../../domain/value-objects/submission/intake-submission.value-object.js';
import type { IntakeEditorRequest } from './intake-editor-request.model.js';
import type { IntakeEditor } from './intake-editor.model.js';
import type { IntakePublication } from './intake-publication.model.js';
import type { IntakeSubmissionClaim } from './intake-submission-claim.model.js';

/** Operations bound to one tenant transaction, including ordinary task and outbox writes. */
export interface IntakeStore {
  // #region Methods
  /** Locks membership, list placement and draft when requested. Hidden lists and missing members
   * must be handled using the existing list access errors before returning. Eligibility includes
   * the supplied proposed assignee as well as the saved assignee. */
  loadEditor(
    input: IntakeEditorRequest,
    lock: boolean,
    proposedAssigneeId?: string | null,
  ): Promise<IntakeEditor>;

  /** Persists a changed draft with the previous version; null inserts the initial draft. */
  saveForm(
    listId: string,
    state: IntakeFormConfiguration,
    expectedVersion: number | null,
  ): Promise<void>;

  /** Reserves and returns a fresh 43-character opaque key that can never be reused. */
  reservePublicationKey(): Promise<string>;

  /** Rechecks the exact key, list lifecycle and default eligibility. For writes, acquire shared
   * locks compatible with other submissions while excluding publication or list changes. */
  loadPublication(listId: string, key: string, lock: boolean): Promise<IntakePublication | null>;

  /** Nonblocking claim scoped to this tenant, publication and client key, retaining successful
   * fingerprint/receipt pairs for 24 hours. Claims must roll back with the surrounding write. */
  claimSubmission(
    listId: string,
    publicationKey: string,
    idempotencyKey: string,
    fingerprint: string,
  ): Promise<IntakeSubmissionClaim>;

  /** Persists the receipt and fingerprint in the same transaction as task creation. */
  completeSubmission(
    listId: string,
    publicationKey: string,
    idempotencyKey: string,
    fingerprint: string,
    receipt: string,
  ): Promise<void>;

  /** Creates an ordinary task as the verified intake system actor, appending normal outbox facts,
   * and saves the contact separately against its stable task ID in this transaction. The contact
   * never enters task properties or outbox payloads. Returns an opaque receipt. */
  createTask(listId: string, submission: IntakeSubmission): Promise<string>;

  /** Checks the verified member's edit access on the task's current placement in this snapshot,
   * then reads its separate contact. Existing membership, hidden and trash errors are preserved. */
  readContact(actorUserId: string, taskKey: string): Promise<string | null>;
  // #endregion
}
