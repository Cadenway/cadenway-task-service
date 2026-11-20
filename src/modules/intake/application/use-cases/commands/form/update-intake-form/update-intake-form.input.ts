import type { IntakeFormPatch } from '../../../../../domain/value-objects/form/intake-form-patch.value-object.js';
import type { IntakeEditorRequest } from '../../../../models/form/intake-editor-request.model.js';
/** An editor's conditional merge patch. */
export interface UpdateIntakeFormInput extends IntakeEditorRequest {
  // #region Properties
  /** Provides expectedVersion. */
  readonly expectedVersion: number;

  /** Provides patch. */
  readonly patch: IntakeFormPatch;
  // #endregion
}
