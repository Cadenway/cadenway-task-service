import { InternalAccess, ProblemException } from '@cadenway/nest-common';
import { Controller, Header, HttpCode, Post, Req, UseFilters } from '@nestjs/common';
import type { Request } from 'express';

import { TaskRefusal } from '../../../../application/models/task/task-refusal.model.js';
import { AuthorizeAutomationNotification } from '../../../../application/use-cases/queries/task/authorize-automation-notification/authorize-automation-notification.use-case.js';
import { AutomationNotificationAuthorizationFilter } from '../../errors/task/automation-notification-authorization.filter.js';
import { toAutomationNotificationAuthorization } from '../../mappers/task/automation-notification-authorization.mapper.js';

/** Checks the current task audience for a notification proposed by an automation rule. */
@Controller('internal/v1/tasks')
@InternalAccess({ issuers: ['notification-service'], actors: ['system'], organization: 'required' })
@UseFilters(AutomationNotificationAuthorizationFilter)
export class AutomationNotificationAuthorizationController {
  // #region Constructor
  /** Binds the current tenant snapshot query. */
  public constructor(private readonly authorization: AuthorizeAutomationNotification) {}
  // #endregion

  // #region Methods
  /** Returns an empty response only when both accounts retain their required access. */
  @Post(':taskKey/automation-notification-authorization')
  @HttpCode(204)
  @Header('Cache-Control', 'private, no-store')
  public async authorize(@Req() request: Request): Promise<void> {
    const input = toAutomationNotificationAuthorization(request);
    try {
      await this.authorization.execute(input);
    } catch (error: unknown) {
      if (error instanceof TaskRefusal) {
        throw new ProblemException({ status: 404, code: 'task.not-found' });
      }
      throw new ProblemException({
        status: 503,
        code: 'task.notification-authorization-unavailable',
        title: 'Notification authorization unavailable.',
      });
    }
  }
  // #endregion
}
