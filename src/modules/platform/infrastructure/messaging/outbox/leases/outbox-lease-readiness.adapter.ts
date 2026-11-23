import type { HealthIndicator, PostgresProbe } from '@cadenway/nest-common';
import { z } from 'zod';

const permissionResult = z.object({ rows: z.tuple([z.object({ permitted: z.literal(true) })]) });

/** Checks the table privileges needed to claim, settle, and purge outbox events. */
export function outboxRelayIndicator(pool: PostgresProbe): HealthIndicator {
  return {
    name: 'outbox-relay',
    async check(): Promise<void> {
      const result = await pool.query(`
        select pg_catalog.has_table_privilege(current_user, 'public.outbox_events', 'SELECT')
           and pg_catalog.has_table_privilege(current_user, 'public.outbox_events', 'UPDATE')
           and pg_catalog.has_table_privilege(current_user, 'public.outbox_events', 'DELETE')
           as permitted
      `);
      if (!permissionResult.safeParse(result).success) {
        throw new Error('The outbox relay lacks required table privileges.');
      }
    },
  };
}
