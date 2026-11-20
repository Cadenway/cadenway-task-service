import type { CustomFieldDefinition } from '../../../domain/value-objects/custom-field/custom-field-definition.value-object.js';
import type { CustomFieldPosition } from './custom-field-position.model.js';

/** A bounded page of active definitions. */
export interface CustomFieldPage {
  // #region Properties
  /** State used by this operation. */
  readonly items: readonly CustomFieldDefinition[];
  readonly next: CustomFieldPosition | null;
  // #endregion
}
