import type { DocumentSpaceAccessResult } from '@cadenway/contracts/types/internal/task-service';
import { InternalAccess, ProblemException } from '@cadenway/nest-common';
import { Body, Controller, Header, HttpCode, Post, UseGuards } from '@nestjs/common';

import { ResolveDocumentSpaceAccess } from '../../../../application/use-cases/queries/access/resolve-document-space-access/resolve-document-space-access.use-case.js';
import { DocumentSpaceAccessBody } from '../../dto/input/access/document-space-access-body.dto.js';
import { answerRefusals } from '../../errors/space/space-refusal.problem.js';
import { CurrentMembershipGuard } from '../../guards/space/current-membership.guard.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';

/** Provides current direct-space roles only to the authenticated document service. */
@Controller('internal/v1/spaces/access')
@InternalAccess({ issuers: ['document-service'], actors: ['user'], organization: 'required' })
@UseGuards(CurrentMembershipGuard)
export class DocumentSpaceAccessController {
  // #region Constructor
  /** Binds the use case that reads membership and space grants in a shared snapshot. */
  public constructor(private readonly resolveSpaceAccess: ResolveDocumentSpaceAccess) {}
  // #endregion

  // #region Methods
  /** Returns only authorized roles, including an empty result after a membership check. */
  @Post('resolve')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  public async resolve(@Body() body: DocumentSpaceAccessBody): Promise<DocumentSpaceAccessResult> {
    const caller = toCaller();
    try {
      const access = await answerRefusals(() =>
        this.resolveSpaceAccess.execute({
          organizationId: caller.organizationId,
          viewerUserId: caller.actorUserId,
          spaceIds: body.spaceIds,
        }),
      );
      return { results: access.results.map(({ spaceId, role }) => ({ spaceId, role })) };
    } catch (cause: unknown) {
      if (cause instanceof ProblemException) throw cause;
      throw new ProblemException({
        status: 503,
        code: 'task.document-space-access-unavailable',
        cause,
      });
    }
  }
  // #endregion
}
