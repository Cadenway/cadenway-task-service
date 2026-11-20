import type { CustomFieldsUnitOfWork } from '../../../../ports/outbound/transactions/custom-field/custom-fields-unit-of-work.port.js';
import type { CustomFieldAccess } from '../../../../services/custom-field/custom-field-access.service.js';
import { CustomFieldDefinitions } from '../../../../services/custom-field/custom-field-definitions.service.js';
import type { GetSpaceCustomFieldInput } from './get-space-custom-field.input.js';
import type { GetSpaceCustomFieldOutput } from './get-space-custom-field.output.js';

/** Reads one active definition within its visible space. */
export class GetSpaceCustomField {
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
  public async execute(input: GetSpaceCustomFieldInput): Promise<GetSpaceCustomFieldOutput> {
    return this.work.runReadOnly(async (store) => {
      await this.access.space(input, input.spaceId, false);
      return this.definitions.get(store, input.organizationId, input.spaceId, input.fieldId);
    });
  }
  // #endregion
}
