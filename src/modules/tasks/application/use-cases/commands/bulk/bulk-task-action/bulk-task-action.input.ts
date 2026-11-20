import type { BulkTaskCommand } from '../../../../models/bulk/bulk-task-command.model.js';
import type { BulkTaskSelection } from '../../../../models/bulk/bulk-task-selection.model.js';

/** An atomic write requested by the authenticated actor for 1–50 distinct selected keys. */
export interface BulkTaskActionInput {
  // #region Properties
  /** Organization from the verified token. */
  readonly organizationId: string;

  /** Account identifier from the verified token. */
  readonly actorUserId: string;

  /** Explicit keys in request order. */
  readonly selection: readonly BulkTaskSelection[];

  /** The single requested action. */
  readonly action: BulkTaskCommand;
  // #endregion
}
