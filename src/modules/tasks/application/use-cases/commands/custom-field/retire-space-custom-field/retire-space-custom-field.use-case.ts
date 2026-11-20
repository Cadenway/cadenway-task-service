import type { CustomFieldsUnitOfWork } from '../../../../ports/outbound/transactions/custom-field/custom-fields-unit-of-work.port.js';
import type { CustomFieldAccess } from '../../../../services/custom-field/custom-field-access.service.js';
import { CustomFieldDefinitions } from '../../../../services/custom-field/custom-field-definitions.service.js';
import type { RetireSpaceCustomFieldInput } from './retire-space-custom-field.input.js';

/** Retires a definition and shifts later definitions atomically. */
export class RetireSpaceCustomField {
  // #region Properties
  /** State used by this operation. */
  private readonly definitions = new CustomFieldDefinitions();
  // #endregion

  // #region Constructor
  /** Supplies the dependencies of this operation. */
  public constructor(
    private readonly work: CustomFieldsUnitOfWork,
    private readonly access: CustomFieldAccess,
  ) {}
  // #endregion

  // #region Methods
  /** Runs the requested field operation. */
  public async execute(input: RetireSpaceCustomFieldInput): Promise<void> {
    await this.work.run(async (store) => {
      await this.access.space(input, input.spaceId, 'write');
      await this.definitions.retire(
        store,
        input.organizationId,
        input.spaceId,
        input.fieldId,
        input.expectedVersions,
      );
    });
  }
  // #endregion
}
