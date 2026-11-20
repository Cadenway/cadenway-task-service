import type { CustomFieldsUnitOfWork } from '../../../../ports/outbound/transactions/custom-field/custom-fields-unit-of-work.port.js';
import type { CustomFieldAccess } from '../../../../services/custom-field/custom-field-access.service.js';
import { CustomFieldDefinitions } from '../../../../services/custom-field/custom-field-definitions.service.js';
import type { ListListCustomFieldsInput } from './list-list-custom-fields.input.js';
import type { ListListCustomFieldsOutput } from './list-list-custom-fields.output.js';

/** Lists a readable list's definitions, including for a list-only grant. */
export class ListListCustomFields {
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
  public async execute(input: ListListCustomFieldsInput): Promise<ListListCustomFieldsOutput> {
    return this.work.runReadOnly(async (store) => {
      const spaceId = await this.access.list(input, input.listId);
      return this.definitions.page(store, input.organizationId, spaceId, input.after, input.limit);
    });
  }
  // #endregion
}
