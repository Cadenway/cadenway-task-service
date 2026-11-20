import type { CustomFieldsUnitOfWork } from '../../../../ports/outbound/transactions/custom-field/custom-fields-unit-of-work.port.js';
import type { CustomFieldAccess } from '../../../../services/custom-field/custom-field-access.service.js';
import { CustomFieldDefinitions } from '../../../../services/custom-field/custom-field-definitions.service.js';
import type { UpdateSpaceCustomFieldInput } from './update-space-custom-field.input.js';
import type { UpdateSpaceCustomFieldOutput } from './update-space-custom-field.output.js';

/** Changes the ordered definition set under the space's mutation lock. */
export class UpdateSpaceCustomField {
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
  public async execute(input: UpdateSpaceCustomFieldInput): Promise<UpdateSpaceCustomFieldOutput> {
    return this.work.run(async (store) => {
      await this.access.space(input, input.spaceId, 'write');
      return this.definitions.update(
        store,
        input.organizationId,
        input.spaceId,
        input.fieldId,
        input.expectedVersions,
        input.patch,
      );
    });
  }
  // #endregion
}
