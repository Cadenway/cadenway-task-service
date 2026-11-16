import type { HealthIndicator, PostgresProbe } from '@cadenway/nest-common';
import { z } from 'zod';

const readyResult = z.object({ rows: z.tuple([z.object({ ready: z.literal(true) })]) });

/** Checks the lease schema and the application role required by the standalone relay. */
export function outboxRelayIndicator(pool: PostgresProbe): HealthIndicator {
  return {
    name: 'outbox-relay',
    async check(): Promise<void> {
      // Selecting the actual columns also checks the relation and column-level SELECT privileges.
      await pool.query(
        `select id, status, lease_token, lease_expires_at
           from public.outbox_events where false`,
      );
      const result = await pool.query(
        `select
           has_table_privilege(current_user, 'public.outbox_events', 'SELECT')
           and has_table_privilege(current_user, 'public.outbox_events', 'UPDATE')
           and has_table_privilege(current_user, 'public.outbox_events', 'DELETE')
           and exists (
             select 1 from pg_index
              where indexrelid = to_regclass('public.outbox_events_lease_expiry_index')
                and indrelid = 'public.outbox_events'::regclass
                and indisvalid and indisready
           )
           and (
             select count(*) = 2 from pg_constraint
              where conrelid = 'public.outbox_events'::regclass
                and conname in ('outbox_events_status_check', 'outbox_events_lease_check')
                and convalidated
           ) as ready`,
      );
      if (!readyResult.safeParse(result).success) {
        throw new Error('Outbox lease schema or application permissions are unavailable');
      }
    },
  };
}
