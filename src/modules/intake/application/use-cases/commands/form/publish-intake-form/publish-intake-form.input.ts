import type { IntakeEditorRequest } from '../../../../models/form/intake-editor-request.model.js';
/** An editor's request to publish, with an optional version condition. */
export interface PublishIntakeFormInput extends IntakeEditorRequest {
  // #region Properties
  /** Provides expectedVersion. */
  readonly expectedVersion?: number;
  // #endregion
}
