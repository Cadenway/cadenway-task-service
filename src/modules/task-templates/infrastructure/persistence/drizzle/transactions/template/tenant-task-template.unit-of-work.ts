import type {
  TenantTransactionRunner,
  TransactionOptions,
  TransactionScope,
} from '@cadenway/nest-common/database';
import type { OutboxRelay, OutboxWriter } from '@cadenway/nest-messaging/outbox';

import type { TaskTemplateStore } from '../../../../../application/models/transactions/task-template-store.model.js';
import type { TaskTemplateUnitOfWork } from '../../../../../application/ports/outbound/transactions/template/task-template-unit-of-work.port.js';
import { OutboxTaskTemplateEvents } from '../../../../messaging/outbox/template/outbox-task-template-events.adapter.js';
import { DrizzleTaskTemplateRepository } from '../../repositories/template/drizzle-task-template.repository.js';

/** Runs template reads and writes in the tenant transaction, with its transactional outbox. */
export class TenantTaskTemplateUnitOfWork implements TaskTemplateUnitOfWork {
  // #region Constructor
  /** Binds the tenant runner, outbox writer and relay. */
  public constructor(
    private readonly runner: TenantTransactionRunner,
    private readonly outbox: OutboxWriter,
    private readonly relay: OutboxRelay,
  ) {}
  // #endregion

  // #region Methods
  /** Runs a write, joining an idempotency transaction when one is active. */
  public async run<TResult>(
    work: (store: TaskTemplateStore) => Promise<TResult>,
  ): Promise<TResult> {
    return this.execute(work, {});
  }

  /** Reads a page and its authorization in one read-only snapshot. */
  public async read<TResult>(
    work: (store: TaskTemplateStore) => Promise<TResult>,
  ): Promise<TResult> {
    return this.execute(work, { readOnly: true, isolationLevel: 'repeatable read' });
  }

  /** Binds every repository and event writer to the same transaction. */
  private async execute<TResult>(
    work: (store: TaskTemplateStore) => Promise<TResult>,
    options: TransactionOptions,
  ): Promise<TResult> {
    const appends: { count: number } = { count: 0 };
    const result: TResult = await this.runner.run(
      (transaction: TransactionScope): Promise<TResult> =>
        work({
          templates: new DrizzleTaskTemplateRepository(transaction.db),
          events: new OutboxTaskTemplateEvents(transaction, this.outbox, (): void => {
            appends.count += 1;
          }),
        }),
      options,
    );
    if (appends.count > 0) this.relay.wake();
    return result;
  }
  // #endregion
}
