import type { CustomFieldActor } from '../../../../models/custom-field/custom-field-actor.model.js';
/** Input or output of the custom field operation. */
export interface GetSpaceCustomFieldInput extends CustomFieldActor {
  // #region Properties
  /** State used by this operation. */
  readonly spaceId: string;
  readonly fieldId: string;
  // #endregion
}
