import type { CustomFieldActor } from '../../../../models/custom-field/custom-field-actor.model.js';
import type { CustomFieldPosition } from '../../../../models/custom-field/custom-field-position.model.js';

/** Input or output of the custom field operation. */
export interface ListSpaceCustomFieldsInput extends CustomFieldActor {
  // #region Properties
  /** State used by this operation. */
  readonly spaceId: string;
  readonly after: CustomFieldPosition | null;
  readonly limit: number;
  // #endregion
}
