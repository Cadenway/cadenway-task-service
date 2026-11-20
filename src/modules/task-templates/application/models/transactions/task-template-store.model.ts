import type { TaskTemplateEvents } from '../../ports/outbound/messaging/template/task-template-events.port.js';
import type { TaskTemplateRepository } from '../../ports/outbound/persistence/template/task-template-repository.port.js';

/** Repositories and outbox bound to one tenant transaction. */
export interface TaskTemplateStore {
  // #region Properties
  /** Persistence in the current transaction. */
  readonly templates: TaskTemplateRepository;

  /** Outbox in the current transaction. */
  readonly events: TaskTemplateEvents;
  // #endregion
}
