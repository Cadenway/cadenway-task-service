import type { SearchAccessProof } from '@cadenway/contracts/types/internal/task-service';
import { ResolveTaskSearchAccessInternalResponse } from '@cadenway/contracts/validators/internal/task-service';
import { InternalAccess, ProblemException } from '@cadenway/nest-common';
import { Body, Controller, Header, HttpCode, Post } from '@nestjs/common';

import { ResolveTaskSearchAccess } from '../../../../application/use-cases/queries/search-access/resolve-task-search-access/resolve-task-search-access.use-case.js';
import { TaskSearchAccessBody } from '../../dto/input/search-access/task-search-access-body.dto.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';

/** Proves the verified user's current access to candidates selected by Search. */
@Controller('internal/v1/task-search-access')
@InternalAccess({ issuers: ['search-service'], actors: ['user'], organization: 'required' })
export class TaskSearchAccessController {
  // #region Constructor
  /** Binds the operation that reads all evidence from a common tenant snapshot. */
  public constructor(private readonly resolveTaskSearchAccess: ResolveTaskSearchAccess) {}
  // #endregion

  // #region Methods
  /** Returns only current visible metadata under the signed user and tenant. */
  @Post('resolve')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  public async resolve(@Body() body: TaskSearchAccessBody): Promise<SearchAccessProof> {
    const caller = toCaller();
    try {
      const proof = await this.resolveTaskSearchAccess.execute({
        ...caller,
        membership: body.membership,
        candidates: body.candidates,
      });
      const response = ResolveTaskSearchAccessInternalResponse.safeParse(proof);
      if (response.success) return response.data;
    } catch (cause: unknown) {
      throw new ProblemException({ status: 503, code: 'task.search-access-unavailable', cause });
    }
    throw new ProblemException({ status: 503, code: 'task.search-access-unavailable' });
  }
  // #endregion
}
