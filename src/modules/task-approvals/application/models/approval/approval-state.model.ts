import type { ApprovalRoundView } from '../../../domain/value-objects/approval/approval-round-view.value-object.js';

/** Current task version and the eligible projection of its round. */
export interface ApprovalState {
  // #region Properties
  /** Members of this contract. */
  readonly taskKey: string;
  readonly taskVersion: number;
  readonly taskStatus: string;
  readonly current: ApprovalRoundView | null;
  // #endregion
}
