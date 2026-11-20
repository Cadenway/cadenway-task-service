import type { CustomFieldActor } from '../../../../models/custom-field/custom-field-actor.model.js';
import type { CustomFieldPosition } from '../../../../models/custom-field/custom-field-position.model.js';
/** Input or output of the custom field operation. */
export interface ListListCustomFieldsInput extends CustomFieldActor {
  // #region Properties
  /** State used by this operation. */
  readonly listId: string;
  readonly after: CustomFieldPosition | null;
  readonly limit: number;
  // #endregion
}
