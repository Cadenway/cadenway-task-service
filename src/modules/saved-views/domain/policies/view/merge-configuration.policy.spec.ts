import { describe, expect, it } from 'vitest';

import {
  duplicateSavedViewName,
  patchSavedView,
  sameSettings,
} from '../../aggregates/view/saved-view.entity.js';
import type { SavedView } from '../../aggregates/view/saved-view.entity.js';
import { IncompleteSheetSort } from '../../errors/view/incomplete-sheet-sort.error.js';
import type { SavedViewConfiguration } from '../../value-objects/view/saved-view-configuration.value-object.js';
import { mergeConfiguration } from './merge-configuration.policy.js';

const configuration: SavedViewConfiguration = {
  layout: 'table',
  filters: { assignee: ['me', 'none'], status: ['review'], label: ['Sonar'] },
  sort: '-dueDate',
  groupBy: 'status',
  presentation: { hiddenSheetColumns: ['labels'], sheetSort: { column: 'name', direction: 'asc' } },
};

describe('saved-view settings', () => {
  it('merges nested settings and keeps sheet sort separate from the signed task sort', () => {
    const updated = mergeConfiguration(configuration, {
      filters: { status: null, priority: ['haute'] },
      presentation: { sheetSort: { direction: 'desc' } },
      groupBy: null,
    });
    expect(updated).toEqual({
      layout: 'table',
      filters: { assignee: ['me', 'none'], label: ['Sonar'], priority: ['haute'] },
      sort: '-dueDate',
      groupBy: null,
      presentation: {
        hiddenSheetColumns: ['labels'],
        sheetSort: { column: 'name', direction: 'desc' },
      },
    });
    expect(configuration.filters.status).toEqual(['review']);
    expect(configuration.presentation?.sheetSort?.direction).toBe('asc');
  });

  it('removes presentation or an individual presentation setting on explicit null', () => {
    expect(mergeConfiguration(configuration, { presentation: null })).not.toHaveProperty(
      'presentation',
    );
    expect(
      mergeConfiguration(configuration, { presentation: { sheetSort: null } }).presentation,
    ).toEqual({ hiddenSheetColumns: ['labels'] });
  });

  it('requires the two members when the merge introduces sheet sort', () => {
    const withoutSheetSort = mergeConfiguration(configuration, { presentation: null });
    expect(() =>
      mergeConfiguration(withoutSheetSort, { presentation: { sheetSort: { column: 'name' } } }),
    ).toThrow(IncompleteSheetSort);
    expect(
      mergeConfiguration(withoutSheetSort, {
        presentation: { sheetSort: { column: 'name', direction: 'desc' } },
      }).presentation?.sheetSort,
    ).toEqual({ column: 'name', direction: 'desc' });
  });

  it('recognizes an identical patch independent of JSON key order and distinguishes explicit clears', () => {
    const view: SavedView = {
      id: 'view',
      organizationId: 'organization',
      listId: 'list',
      name: 'Bugs',
      icon: 'bug',
      configuration,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      position: 1,
      version: 2,
    };
    expect(
      sameSettings(
        view,
        patchSavedView(view, { configuration: { filters: { status: ['review'] } } }),
      ),
    ).toBe(true);
    const changed = patchSavedView(view, { icon: null });
    expect(changed.icon).toBeNull();
    expect(sameSettings(view, changed)).toBe(false);
  });

  it('keeps an 80-code-point ceiling without splitting an emoji when naming a copy', () => {
    const name = duplicateSavedViewName('🧪'.repeat(80));
    expect(name).toBe(`${'🧪'.repeat(72)} (copie)`);
    expect(Array.from(name)).toHaveLength(80);
  });
});
