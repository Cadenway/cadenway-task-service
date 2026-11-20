import type {
  TaskTemplate,
  TaskTemplatePage,
} from '@cadenway/contracts/types/internal/task-service';
import { formatEtag, InternalAccess, parseIfMatch } from '@cadenway/nest-common';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { CreateTaskTemplate } from '../../../../application/use-cases/commands/template/create-task-template/create-task-template.use-case.js';
import { DeleteTaskTemplate } from '../../../../application/use-cases/commands/template/delete-task-template/delete-task-template.use-case.js';
import { GetTaskTemplate } from '../../../../application/use-cases/queries/template/get-task-template/get-task-template.use-case.js';
import { ListTaskTemplates } from '../../../../application/use-cases/queries/template/list-task-templates/list-task-templates.use-case.js';
import { CreateTaskTemplateBody } from '../../dto/input/template/create-task-template-body.dto.js';
import { ListTaskTemplatesQuery } from '../../dto/input/template/list-task-templates-query.dto.js';
import { TaskTemplatePath } from '../../dto/input/template/task-template-path.dto.js';
import { TaskTemplateSpacePath } from '../../dto/input/template/task-template-space-path.dto.js';
import { answerTaskTemplateRefusal } from '../../errors/template/task-template-refusal.problem.js';
import { toTaskTemplateCaller } from '../../mappers/template/task-template-caller.mapper.js';
import {
  decodeTemplateCursor,
  encodeTemplateCursor,
} from '../../mappers/template/task-template-cursor.mapper.js';
import { toTaskTemplate } from '../../mappers/template/task-template.mapper.js';

/** Internal task template library for gateway requests from a verified user. */
@Controller('internal/v1/spaces/:spaceId/task-templates')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class TaskTemplatesController {
  // #region Constructor
  /** Binds each HTTP operation to its use case. */
  public constructor(
    private readonly createTemplate: CreateTaskTemplate,
    private readonly deleteTemplate: DeleteTaskTemplate,
    private readonly getTemplate: GetTaskTemplate,
    private readonly listTemplates: ListTaskTemplates,
  ) {}
  // #endregion

  // #region Methods
  /** Returns a bounded page from the requested space. */
  @Get()
  public async list(
    @Param() path: TaskTemplateSpacePath,
    @Query() query: ListTaskTemplatesQuery,
  ): Promise<TaskTemplatePage> {
    const caller = toTaskTemplateCaller(path.spaceId);
    const records = await answerTaskTemplateRefusal(() =>
      this.listTemplates.execute(caller, decodeTemplateCursor(query.cursor, caller), query.limit),
    );
    const page = records.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map(toTaskTemplate),
      nextCursor:
        records.length > query.limit && last !== undefined
          ? encodeTemplateCursor(last, caller)
          : null,
    };
  }

  /** Returns a template with its current revision as an ETag. */
  @Get(':templateId')
  public async get(@Param() path: TaskTemplatePath): Promise<TaskTemplate> {
    const caller = toTaskTemplateCaller(path.spaceId);
    return toTaskTemplate(
      await answerTaskTemplateRefusal(() =>
        this.getTemplate.execute(caller, path.templateId.toLowerCase()),
      ),
    );
  }

  /** Creates a snapshot and returns its resource location. */
  @Post()
  public async create(
    @Param() path: TaskTemplateSpacePath,
    @Body() body: CreateTaskTemplateBody,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TaskTemplate> {
    const caller = toTaskTemplateCaller(path.spaceId);
    const template = await answerTaskTemplateRefusal(() =>
      this.createTemplate.execute(caller, body.sourceTaskKey, body.name),
    );
    response.setHeader(
      'Location',
      `/internal/v1/spaces/${caller.spaceId}/task-templates/${template.id}`,
    );
    response.setHeader('ETag', formatEtag(template.version));
    return toTaskTemplate(template);
  }

  /** Deletes an existing template, optionally matching one of its revisions. */
  @Delete(':templateId')
  @HttpCode(204)
  public async delete(
    @Param() path: TaskTemplatePath,
    @Headers('if-match') header: string | undefined,
  ): Promise<void> {
    const caller = toTaskTemplateCaller(path.spaceId);
    const match = parseIfMatch(header);
    const versions = match === undefined || match === '*' ? null : match;
    await answerTaskTemplateRefusal(() =>
      this.deleteTemplate.execute(caller, path.templateId.toLowerCase(), versions),
    );
  }
  // #endregion
}
