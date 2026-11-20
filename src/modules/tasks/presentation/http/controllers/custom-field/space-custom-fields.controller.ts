import type {
  CustomFieldDefinition,
  CustomFieldDefinitionPage,
} from '@cadenway/contracts/types/internal/task-service';
import { formatEtag, InternalAccess } from '@cadenway/nest-common';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CreateSpaceCustomField } from '../../../../application/use-cases/commands/custom-field/create-space-custom-field/create-space-custom-field.use-case.js';
import { RetireSpaceCustomField } from '../../../../application/use-cases/commands/custom-field/retire-space-custom-field/retire-space-custom-field.use-case.js';
import { UpdateSpaceCustomField } from '../../../../application/use-cases/commands/custom-field/update-space-custom-field/update-space-custom-field.use-case.js';
import { GetSpaceCustomField } from '../../../../application/use-cases/queries/custom-field/get-space-custom-field/get-space-custom-field.use-case.js';
import { ListSpaceCustomFields } from '../../../../application/use-cases/queries/custom-field/list-space-custom-fields/list-space-custom-fields.use-case.js';
import { CreateCustomFieldBody } from '../../dto/input/custom-field/create-custom-field-body.dto.js';
import { CustomFieldPath } from '../../dto/input/custom-field/custom-field-path.dto.js';
import { CustomFieldQuery } from '../../dto/input/custom-field/custom-field-query.dto.js';
import { CustomFieldSpacePath } from '../../dto/input/custom-field/custom-field-space-path.dto.js';
import { UpdateCustomFieldBody } from '../../dto/input/custom-field/update-custom-field-body.dto.js';
import { CustomFieldReplayAccessGuard } from '../../guards/custom-field/custom-field-replay-access.guard.js';
import { RequiredDuplicateBodyGuard } from '../../guards/duplicate/required-duplicate-body.guard.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import {
  decodeCustomFieldCursor,
  encodeCustomFieldCursor,
} from '../../mappers/custom-field/custom-field-cursor.mapper.js';
import { answerCustomFieldRefusals } from '../../mappers/custom-field/custom-field-refusal.mapper.js';
import { toCustomField } from '../../mappers/custom-field/custom-field.mapper.js';
import { toVersionCondition } from '../../mappers/version/version-condition.mapper.js';

/** Manages definitions within a visible space. */
@Controller('internal/v1/spaces/:spaceId/custom-fields')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class SpaceCustomFieldsController {
  // #region Constructor
  /** Binds the field operations. */
  public constructor(
    private readonly listFields: ListSpaceCustomFields,
    private readonly createField: CreateSpaceCustomField,
    private readonly getField: GetSpaceCustomField,
    private readonly updateField: UpdateSpaceCustomField,
    private readonly retireField: RetireSpaceCustomField,
  ) {}
  // #endregion

  // #region Methods
  /** Lists active definitions in a stable order. */
  @Get()
  public async list(
    @Param() path: CustomFieldSpacePath,
    @Query() query: CustomFieldQuery,
  ): Promise<CustomFieldDefinitionPage> {
    const caller = toCaller();
    const spaceId = path.spaceId.toLowerCase();
    const scope = {
      organizationId: caller.organizationId,
      spaceId,
      order: 'custom-fields-position-id',
    };
    const page = await answerCustomFieldRefusals(() =>
      this.listFields.execute({
        ...caller,
        spaceId,
        after: decodeCustomFieldCursor(query.cursor, scope),
        limit: query.limit,
      }),
    );
    return {
      items: page.items.map(toCustomField),
      nextCursor: encodeCustomFieldCursor(page.next, scope),
    };
  }

  /** Creates a field and returns its version and resource location. */
  @Post()
  @HttpCode(201)
  @UseGuards(RequiredDuplicateBodyGuard, CustomFieldReplayAccessGuard)
  public async create(
    @Param() path: CustomFieldSpacePath,
    @Body() body: CreateCustomFieldBody,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CustomFieldDefinition> {
    const spaceId = path.spaceId.toLowerCase();
    const field = await answerCustomFieldRefusals(() =>
      this.createField.execute({ ...toCaller(), spaceId, name: body.name, type: body.type }),
    );
    response.setHeader('Location', `/internal/v1/spaces/${spaceId}/custom-fields/${field.id}`);
    response.setHeader('ETag', formatEtag(field.version));
    return toCustomField(field);
  }

  /** Reads one active definition. */
  @Get(':fieldId')
  public async get(
    @Param() path: CustomFieldPath,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CustomFieldDefinition> {
    const field = await answerCustomFieldRefusals(() =>
      this.getField.execute({
        ...toCaller(),
        spaceId: path.spaceId.toLowerCase(),
        fieldId: path.fieldId.toLowerCase(),
      }),
    );
    response.setHeader('ETag', formatEtag(field.version));
    return toCustomField(field);
  }

  /** Updates a definition under an optional version condition. */
  @Patch(':fieldId')
  @UseGuards(RequiredDuplicateBodyGuard)
  public async update(
    @Param() path: CustomFieldPath,
    @Body() body: UpdateCustomFieldBody,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CustomFieldDefinition> {
    const field = await answerCustomFieldRefusals(() =>
      this.updateField.execute({
        ...toCaller(),
        spaceId: path.spaceId.toLowerCase(),
        fieldId: path.fieldId.toLowerCase(),
        expectedVersions: toVersionCondition(ifMatch, false),
        patch: body,
      }),
    );
    response.setHeader('ETag', formatEtag(field.version));
    return toCustomField(field);
  }

  /** Retires a definition under an optional version condition. */
  @Delete(':fieldId')
  @HttpCode(204)
  public async retire(
    @Param() path: CustomFieldPath,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    await answerCustomFieldRefusals(() =>
      this.retireField.execute({
        ...toCaller(),
        spaceId: path.spaceId.toLowerCase(),
        fieldId: path.fieldId.toLowerCase(),
        expectedVersions: toVersionCondition(ifMatch, false),
      }),
    );
  }
  // #endregion
}
