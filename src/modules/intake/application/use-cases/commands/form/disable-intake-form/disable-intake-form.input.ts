import type { IntakeEditorRequest } from '../../../../models/form/intake-editor-request.model.js';
/** An editor's request to revoke the current publication. */
export interface DisableIntakeFormInput extends IntakeEditorRequest {
  // #region Properties
  /** Provides expectedVersion. */
  readonly expectedVersion?: number;
  // #endregion
}
