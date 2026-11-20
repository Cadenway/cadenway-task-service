import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, eq, sql } from 'drizzle-orm';

import type { NotificationDeliveryDecision } from '../../../../../application/models/delivery-authorization/notification-delivery-decision.model.js';
import type { NotificationDeliveryDecisionStore } from '../../../../../application/ports/outbound/persistence/delivery-authorization/notification-delivery-decision-store.port.js';
import { notificationDeliveryAuthorizationDecisions } from '../../schemas/decision/notification-delivery-authorization-decision.schema.js';

/** Persists immutable authorization decisions inside the caller's tenant transaction. */
export class DrizzleNotificationDeliveryDecisionRepository implements NotificationDeliveryDecisionStore {
  // #region Constructor
  /** Binds all reads, writes and advisory locks to the caller's transaction. */
  public constructor(private readonly db: TransactionDatabase) {}
  // #endregion

  // #region Methods
  /** Serializes concurrent requests for one tenant and correlation until commit or rollback. */
  public async lock(organizationId: string, authorizationRequestId: string): Promise<void> {
    const key = `notification-delivery-decision:${organizationId.toLowerCase()}:${authorizationRequestId.toLowerCase()}`;
    await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }

  /** Reads a previously committed binding, or null if this correlation is new. */
  public async find(
    organizationId: string,
    authorizationRequestId: string,
  ): Promise<NotificationDeliveryDecision | null> {
    const rows = await this.db
      .select()
      .from(notificationDeliveryAuthorizationDecisions)
      .where(
        and(
          eq(notificationDeliveryAuthorizationDecisions.organizationId, organizationId),
          eq(
            notificationDeliveryAuthorizationDecisions.authorizationRequestId,
            authorizationRequestId,
          ),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  /** Inserts once; the primary key refuses any second write to the same correlation. */
  public async insert(record: NotificationDeliveryDecision): Promise<void> {
    await this.db.insert(notificationDeliveryAuthorizationDecisions).values(record);
  }
  // #endregion
}
