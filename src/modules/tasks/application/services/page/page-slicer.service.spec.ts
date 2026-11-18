import { describe, expect, it } from 'vitest';

import { PageSlicer } from './page-slicer.service.js';

const slicer: PageSlicer = new PageSlicer();
const idOf = (row: { readonly id: string }): string => row.id;
const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('PageSlicer: the extra row proves a next page exists', () => {
  it('keeps the first rows and points at the last kept one when a row more was read', () => {
    const page = slicer.slice(rows, 2, idOf);

    expect(page.items).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(page.next).toBe('b');
  });

  it('has no next page when the rows fit', () => {
    expect(slicer.slice(rows, 3, idOf)).toEqual({ items: rows, next: null });
  });

  it('has no next page and no item for no row', () => {
    expect(slicer.slice([], 2, idOf)).toEqual({ items: [], next: null });
  });
});
