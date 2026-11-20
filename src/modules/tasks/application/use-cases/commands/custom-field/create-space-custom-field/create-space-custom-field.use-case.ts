import type { CustomFieldsUnitOfWork } from '../../../../ports/outbound/transactions/custom-field/custom-fields-unit-of-work.port.js';
import type { CustomFieldAccess } from '../../../../services/custom-field/custom-field-access.service.js';
import { CustomFieldDefinitions } from '../../../../services/custom-field/custom-field-definitions.service.js';
import type { CreateSpaceCustomFieldInput } from './create-space-custom-field.input.js';
import type { CreateSpaceCustomFieldOutput } from './create-space-custom-field.output.js';
import type { CustomFieldActor } from '../../../../models/custom-field/custom-field-actor.model.js';

/** Appends a definition while holding the manager's membership and space. */
export class CreateSpaceCustomField {
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
  public async execute(input: CreateSpaceCustomFieldInput): Promise<CreateSpaceCustomFieldOutput> {
    return this.work.run(async (store) => {
      await this.access.space(input, input.spaceId, 'write');
      return this.definitions.create(store, input.organizationId, input.spaceId, {
        name: input.name,
        type: input.type,
      });
    });
  }

  /** Rechecks current management before the idempotency interceptor can replay a result. */
  public async assertCanReplay(
    input: CustomFieldActor & { readonly spaceId: string },
  ): Promise<void> {
    await this.work.runReadOnly(async () =>
      this.access.space(input, input.spaceId, 'preview-write'),
    );
  }
  // #endregion
}
