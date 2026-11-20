import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { spacePositionInSidebar } from './space-position.mapper.js';

describe('spacePositionInSidebar: a space restored from the trash goes to the end of the sidebar', () => {
  it('places a space by its last restoration, or else by its creation', () => {
    expect(new PgDialect().sqlToQuery(spacePositionInSidebar()).sql).toBe(
      'coalesce("spaces"."restored_at", "spaces"."created_at")',
    );
  });
});
