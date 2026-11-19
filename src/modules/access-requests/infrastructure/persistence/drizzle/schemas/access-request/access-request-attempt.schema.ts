import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import { index, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Table `access_request_attempts`: one row per request for access a member sent, stored or not,
 * for the hourly limit (10 per requester and organization within the last hour, decision 11 of
 * P3b-1): the count includes the requests that were not stored, so that a `429` tells nothing
 * about a target. A row records no target. The rows of a requester older than an hour are deleted
 * by their next request, and those of a removed member by the member clean-up, so the table stays
 * bounded by the requests of the last hour. `access_request_attempts_user_index` serves the count
 * and the deletion. A tenant table: `organization_id` carries the policy of the kit, which the
 * migration forces by hand (`ALTER TABLE "access_request_attempts" FORCE ROW LEVEL SECURITY;`).
 */
export const accessRequestAttempts = pgTable(
  'access_request_attempts',
  {
    organizationId: uuid('organization_id').notNull(),
    id: uuid('id')
      .notNull()
      .default(sql`uuidv7()`),
    userId: uuid('user_id').notNull(),
    attemptedAt: timestamp('attempted_at', { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'access_request_attempts_pkey', columns: [table.organizationId, table.id] }),
    index('access_request_attempts_user_index').on(
      table.organizationId,
      table.userId,
      table.attemptedAt,
    ),
    organizationPolicy('access_request_attempts_organization_isolation'),
  ],
);
