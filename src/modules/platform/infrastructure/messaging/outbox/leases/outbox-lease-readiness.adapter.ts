import type { HealthIndicator } from '@cadenway/nest-common';
import type { Pool } from 'pg';

/** Checks the table privileges needed to claim, settle, and purge outbox events. */
export function outboxRelayIndicator(pool: Pick<Pool, 'query'>): HealthIndicator {
  return {
    name: 'outbox-relay',
    async check(): Promise<void> {
      const result = await pool.query<{ permitted: boolean }>(`
        select pg_catalog.has_table_privilege(current_user, 'public.outbox_events', 'SELECT')
           and pg_catalog.has_table_privilege(current_user, 'public.outbox_events', 'UPDATE')
           and pg_catalog.has_table_privilege(current_user, 'public.outbox_events', 'DELETE')
           as permitted
      `);
      if (result.rows[0]?.permitted !== true) {
        throw new Error('The outbox relay lacks required table privileges.');
      }
    },
  };
}
