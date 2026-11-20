import type { CustomFieldDefinitionPage } from '@cadenway/contracts/types/internal/task-service';
import { InternalAccess } from '@cadenway/nest-common';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ListListCustomFields } from '../../../../application/use-cases/queries/custom-field/list-list-custom-fields/list-list-custom-fields.use-case.js';
import { CustomFieldListPath } from '../../dto/input/custom-field/custom-field-list-path.dto.js';
import { CustomFieldQuery } from '../../dto/input/custom-field/custom-field-query.dto.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import {
  decodeCustomFieldCursor,
  encodeCustomFieldCursor,
} from '../../mappers/custom-field/custom-field-cursor.mapper.js';
import { answerCustomFieldRefusals } from '../../mappers/custom-field/custom-field-refusal.mapper.js';
import { toCustomField } from '../../mappers/custom-field/custom-field.mapper.js';

/** Reads field definitions through a visible list. */
@Controller('internal/v1/lists/:listId/custom-fields')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class ListCustomFieldsController {
  // #region Constructor
  /** Binds the list query. */
  public constructor(private readonly listFields: ListListCustomFields) {}
  // #endregion

  // #region Methods
  /** Lists active definitions from the list's space. */
  @Get()
  public async list(
    @Param() path: CustomFieldListPath,
    @Query() query: CustomFieldQuery,
  ): Promise<CustomFieldDefinitionPage> {
    const caller = toCaller();
    const listId = path.listId.toLowerCase();
    const scope = {
      organizationId: caller.organizationId,
      listId,
      order: 'custom-fields-position-id',
    };
    const page = await answerCustomFieldRefusals(() =>
      this.listFields.execute({
        ...caller,
        listId,
        after: decodeCustomFieldCursor(query.cursor, scope),
        limit: query.limit,
      }),
    );
    return {
      items: page.items.map(toCustomField),
      nextCursor: encodeCustomFieldCursor(page.next, scope),
    };
  }
  // #endregion
}
