import type {
  NotificationSubjectLookupResult,
  NotificationSubjectLookupSubjectsItem,
} from '@cadenway/contracts/types/internal/task-service';
import {
  getOrganizationContext,
  InternalAccess,
  principalOf,
  ProblemException,
} from '@cadenway/nest-common';
import { Body, Controller, Header, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import type { NotificationSubject } from '../../../../application/models/subject/notification-subject.model.js';
import { ResolveNotificationSubjects } from '../../../../application/use-cases/queries/subject/resolve-notification-subjects/resolve-notification-subjects.use-case.js';
import { NotificationSubjectLookupDto } from '../../dto/input/subject/notification-subject-lookup.dto.js';

/** Resolves visibility for a verified gateway caller without exposing hidden subjects. */
@Controller('internal/v1/notification-subjects')
@InternalAccess({
  issuers: ['api-gateway', 'realtime-gateway'],
  actors: ['user'],
  organization: 'required',
})
export class NotificationSubjectsController {
  // #region Constructor
  /** Takes the current-visibility use case. */
  public constructor(private readonly resolveSubjects: ResolveNotificationSubjects) {}
  // #endregion

  // #region Methods
  /** Resolves each submitted subject in the same order within one current snapshot. */
  @Post('resolve')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  public async resolve(
    @Body() body: NotificationSubjectLookupDto,
    @Req() request: Request,
  ): Promise<NotificationSubjectLookupResult> {
    const principal = principalOf(request);
    if (
      principal === undefined ||
      !['api-gateway', 'realtime-gateway'].includes(principal.issuer)
    ) {
      throw new ProblemException({ status: 403, code: 'auth.issuer-not-allowed' });
    }
    if (
      principal.issuer === 'realtime-gateway' &&
      body.subjects.some((item) => 'display' in item)
    ) {
      throw new ProblemException({ status: 403, code: 'auth.issuer-not-allowed' });
    }
    const context = getOrganizationContext();
    if (context?.actor.type !== 'user' || context.actor.id === null) {
      throw new ProblemException({ status: 403, code: 'auth.actor-not-allowed' });
    }
    if (context.organizationId === null) {
      throw new ProblemException({ status: 403, code: 'auth.organization-required' });
    }
    const subjects = body.subjects.map((item): NotificationSubject => this.toSubject(item));
    let results: Awaited<ReturnType<ResolveNotificationSubjects['execute']>>;
    try {
      results = await this.resolveSubjects.execute({
        organizationId: context.organizationId.toLowerCase(),
        userId: context.actor.id.toLowerCase(),
        subjects,
      });
    } catch (cause: unknown) {
      throw new ProblemException({
        status: 503,
        code: 'task.notification-visibility-unavailable',
        cause,
      });
    }
    if (results === null) {
      throw new ProblemException({ status: 404, code: 'organization.not-found' });
    }
    return { results: [...results] };
  }

  /** Maps the contract's tagged resource to the application selector. */
  private toSubject(item: NotificationSubjectLookupSubjectsItem): NotificationSubject {
    const subject = item.subject;
    const display = 'display' in item ? { display: item.display } : {};
    switch (subject.kind) {
      case 'task-id':
        return { kind: subject.kind, reference: subject.taskId, ...display };
      case 'task-key':
        return { kind: subject.kind, reference: subject.taskKey, ...display };
      case 'list':
        return { kind: subject.kind, reference: subject.listId };
      case 'space':
        return { kind: subject.kind, reference: subject.spaceId };
    }
  }
  // #endregion
}
