import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { DrizzleSavedViewRepository } from './drizzle-saved-view.repository.js';

const organizationId = '019a7000-0000-7000-8000-000000000001';
const removedViewId = '019a7000-0000-7000-8000-000000000002';

/** Records PostgreSQL statements and returns one removed view as a driver row. */
function captureDeletion() {
  const query = vi
    .fn<
      (
        config: { text: string },
        values: readonly unknown[],
      ) => Promise<{ rows: string[][]; fields: unknown[] }>
    >()
    .mockResolvedValue({ rows: [[removedViewId]], fields: [] });
  const repository = new DrizzleSavedViewRepository(drizzle({ query } as unknown as Pool));
  return { repository, query };
}

describe('DrizzleSavedViewRepository parent cleanup', () => {
  it('deletes views with one statement and one UUID array even above the PostgreSQL bind limit', async () => {
    const listIds = Array.from(
      { length: 65_536 },
      (_, index) => `019a7100-0000-7000-8000-${index.toString(16).padStart(12, '0')}`,
    );
    const { repository, query } = captureDeletion();

    await expect(repository.removeLists(organizationId, listIds)).resolves.toEqual([removedViewId]);

    expect(query).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        text: 'delete from "saved_views" where ("saved_views"."organization_id" = $1 and "saved_views"."list_id" = any($2::uuid[])) returning "id"',
      }),
      [organizationId, listIds],
    );
  });

  it('does not query PostgreSQL for an empty list selection', async () => {
    const { repository, query } = captureDeletion();

    await expect(repository.removeLists(organizationId, [])).resolves.toEqual([]);

    expect(query).not.toHaveBeenCalled();
  });
});
