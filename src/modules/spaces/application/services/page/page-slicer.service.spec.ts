import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';

import type { PagePosition } from '../../models/page/page-position.model.js';
import { PageSlicer } from './page-slicer.service.js';

/**
 * Builds rows created one minute apart, as the keyset of a page reads them.
 *
 * @param count - How many rows.
 * @returns The rows.
 */
function rows(count: number): PagePosition[] {
  return Array.from({ length: count }, (_: unknown, index: number): PagePosition => ({
    createdAt: new Date(Date.UTC(2026, 10, 3, 8, index)),
    id: `019a7000-0000-7000-8000-${String(index + 1).padStart(12, '0')}`,
  }));
}

describe('PageSlicer: a page holds the limit and a next position only when a row remains', () => {
  const pages = new PageSlicer();

  it('returns every row and no next position when fewer rows than the limit are read', () => {
    expect(pages.slice(rows(2), 3)).toEqual({ items: rows(2), next: null });
  });

  it('returns no next position when exactly the limit is read', () => {
    expect(pages.slice(rows(3), 3)).toEqual({ items: rows(3), next: null });
  });

  it('drops the extra row and points at the last row kept when limit + 1 rows are read', () => {
    const read: PagePosition[] = rows(4);

    const page = pages.slice(read, 3);

    expect(page.items).toEqual(read.slice(0, 3));
    expect(page.next).toEqual({ createdAt: read[2]?.createdAt, id: read[2]?.id });
  });

  it('returns an empty page with no next position when nothing is read', () => {
    expect(pages.slice([], 3)).toEqual({ items: [], next: null });
  });

  it('keeps the position to the two fields of the keyset', () => {
    const page = pages.slice(
      rows(2).map((row: PagePosition) => ({ ...row, name: 'Sprint 14' })),
      1,
    );

    expect(Object.keys(page.next ?? {}).sort()).toEqual(['createdAt', 'id']);
  });

  test.prop([fc.integer({ min: 0, max: 40 }), fc.integer({ min: 1, max: 20 })])(
    'never returns more than the limit and points to a next page if and only if rows remain',
    (count: number, limit: number) => {
      const page = pages.slice(rows(count), limit);

      expect(page.items).toHaveLength(Math.min(count, limit));
      expect(page.next !== null).toBe(count > limit);
    },
  );
});
