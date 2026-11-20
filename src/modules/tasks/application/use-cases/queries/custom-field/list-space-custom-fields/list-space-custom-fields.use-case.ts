import type { CustomFieldsUnitOfWork } from '../../../../ports/outbound/transactions/custom-field/custom-fields-unit-of-work.port.js';
import type { CustomFieldAccess } from '../../../../services/custom-field/custom-field-access.service.js';
import { CustomFieldDefinitions } from '../../../../services/custom-field/custom-field-definitions.service.js';
import type { ListSpaceCustomFieldsInput } from './list-space-custom-fields.input.js';
import type { ListSpaceCustomFieldsOutput } from './list-space-custom-fields.output.js';

/** Lists definitions only when the viewer has a role on the space itself. */
export class ListSpaceCustomFields {
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
  public async execute(input: ListSpaceCustomFieldsInput): Promise<ListSpaceCustomFieldsOutput> {
    return this.work.runReadOnly(async (store) => {
      await this.access.space(input, input.spaceId, false);
      return this.definitions.page(
        store,
        input.organizationId,
        input.spaceId,
        input.after,
        input.limit,
      );
    });
  }
  // #endregion
}
