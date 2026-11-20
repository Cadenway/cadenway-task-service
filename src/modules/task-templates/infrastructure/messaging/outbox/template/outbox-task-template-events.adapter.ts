import { eventSchemas } from '@cadenway/contracts/events/task-service';
import type { TransactionScope } from '@cadenway/nest-common/database';
import type { OutboxWriter } from '@cadenway/nest-messaging/outbox';

import type { TaskTemplateRecord } from '../../../../application/models/template/task-template-record.model.js';
import type { TaskTemplateEvents } from '../../../../application/ports/outbound/messaging/template/task-template-events.port.js';

/** Appends the library revision without copying template content into events. */
export class OutboxTaskTemplateEvents implements TaskTemplateEvents {
  // #region Constructor
  /** Binds the event writer to the transaction that changes the library. */
  public constructor(
    private readonly transaction: TransactionScope,
    private readonly outbox: OutboxWriter,
    private readonly onAppend: () => void,
  ) {}
  // #endregion

  // #region Methods
  /** Stores a creation or deletion event before the library transaction commits. */
  public async changed(
    template: TaskTemplateRecord,
    actorUserId: string,
    action: 'created' | 'deleted',
  ): Promise<void> {
    await this.outbox.append(this.transaction, eventSchemas, 'space.task-template-changed.v1', {
      organizationId: template.organizationId,
      actor: { type: 'user', id: actorUserId },
      version: template.version,
      spaceId: template.spaceId,
      templateId: template.id,
      action,
    });
    this.onAppend();
  }
  // #endregion
}
