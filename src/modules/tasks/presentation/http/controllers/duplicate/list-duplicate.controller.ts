import type { ListDuplication } from '@cadenway/contracts/types/internal/task-service';
import { formatEtag, InternalAccess } from '@cadenway/nest-common';
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { DuplicateList } from '../../../../application/use-cases/commands/list/duplicate-list/duplicate-list.use-case.js';
import { DuplicateListBody } from '../../dto/input/duplicate/duplicate-list-body.dto.js';
import { DuplicateListPath } from '../../dto/input/duplicate/duplicate-list-path.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import { toPlacedList } from '../../mappers/placement/placed-list.mapper.js';
import { toExpectedVersions } from '../../mappers/version/expected-versions.mapper.js';
import { requireDuplicateBody } from '../../validation/duplicate/required-duplicate-body.validator.js';
import { RequiredDuplicateBodyGuard } from '../../guards/duplicate/required-duplicate-body.guard.js';

/** Duplicates a visible list and its eligible live tasks within the verified organization. */
@Controller('internal/v1/lists')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class ListDuplicateController {
  // #region Constructor
  /** Binds the list duplication use case. */
  public constructor(private readonly duplicateList: DuplicateList) {}
  // #endregion

  // #region Methods
  /** Creates a list copy and returns its location and version ETag. */
  @Post(':listId/duplicate')
  @HttpCode(201)
  @UseGuards(RequiredDuplicateBodyGuard)
  public async duplicate(
    @Param() path: DuplicateListPath,
    @Body() _body: DuplicateListBody,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ListDuplication> {
    requireDuplicateBody(request);
    const result = await answerRefusals(() =>
      this.duplicateList.execute({
        ...toCaller(),
        listId: path.listId.toLowerCase(),
        expectedVersions: toExpectedVersions(ifMatch),
      }),
    );
    response.setHeader('Location', `/internal/v1/lists/${result.list.id}`);
    response.setHeader('ETag', formatEtag(result.list.version));
    return { list: toPlacedList(result.list), taskCount: result.taskCount };
  }
  // #endregion
}
