import { describe, expect, it } from 'vitest';

import { CreateTimeEntryBody } from './create-time-entry-body.dto.js';

describe('the time entry body', () => {
  const body = { minutes: 30, workDate: '2026-11-07' };

  it('accepts Unicode notes and rejects unrepresentable text', () => {
    expect(CreateTimeEntryBody.schema.safeParse({ ...body, note: 'Maquette 🖥️' }).success).toBe(
      true,
    );
    expect(CreateTimeEntryBody.schema.safeParse({ ...body, note: 'note\u0000' }).success).toBe(
      false,
    );
    expect(CreateTimeEntryBody.schema.safeParse({ ...body, note: '\ud800' }).success).toBe(false);
  });

  it('refuses invalid calendar dates and fields outside the published schema', () => {
    expect(CreateTimeEntryBody.schema.safeParse({ ...body, workDate: '2026-02-30' }).success).toBe(
      false,
    );
    expect(CreateTimeEntryBody.schema.safeParse({ ...body, authorUserId: 'other' }).success).toBe(
      false,
    );
    expect(CreateTimeEntryBody.schema.safeParse({ ...body, minutes: 0 }).success).toBe(false);
  });
});
