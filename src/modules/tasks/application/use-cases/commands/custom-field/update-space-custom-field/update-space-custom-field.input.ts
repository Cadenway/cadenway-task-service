import type { CustomFieldDefinitionPatch } from '../../../../../domain/value-objects/custom-field/custom-field-definition-patch.value-object.js';
import type { CustomFieldActor } from '../../../../models/custom-field/custom-field-actor.model.js';
/** Input or output of the custom field operation. */
export interface UpdateSpaceCustomFieldInput extends CustomFieldActor {
  // #region Properties
  /** State used by this operation. */
  readonly spaceId: string;
  readonly fieldId: string;
  readonly expectedVersions: readonly number[] | null;
  readonly patch: CustomFieldDefinitionPatch;
  // #endregion
}
