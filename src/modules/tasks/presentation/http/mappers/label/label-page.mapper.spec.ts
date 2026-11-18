import { ListLabelsInternalResponse } from '@cadenway/contracts/validators/internal/task-service';
import { describe, expect, it } from 'vitest';

import { toLabelPage } from './label-page.mapper.js';

describe('the page of the labels', () => {
  it('maps a page to a body the contract validates, with the name of each label only', () => {
    const body = toLabelPage(
      {
        items: [{ name: 'Auth' }, { name: 'Design' }],
        next: { sortKey: 'design', labelKey: 'design' },
      },
      'cursor-of-the-next-page',
    );

    expect(ListLabelsInternalResponse.parse(body)).toEqual(body);
    expect(body).toEqual({
      items: [{ name: 'Auth' }, { name: 'Design' }],
      nextCursor: 'cursor-of-the-next-page',
    });
  });

  it('gives the last page a null cursor', () => {
    expect(toLabelPage({ items: [], next: null }, null)).toEqual({ items: [], nextCursor: null });
  });
});
