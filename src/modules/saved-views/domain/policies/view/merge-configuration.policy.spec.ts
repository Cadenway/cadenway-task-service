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

const points = '019a700a-1234-7567-89ab-cdef01234567';
const client = '019a700a-1234-7567-89ab-cdef01234568';
const retired = '019a700a-1234-7567-89ab-cdef01234569';
const withCustomFields: SavedViewConfiguration = {
  ...configuration,
  presentation: {
    ...configuration.presentation,
    hiddenCustomFieldIds: [client, retired],
    customFieldSort: { fieldId: points, direction: 'asc' },
  },
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

  it('preserves custom field preferences when another presentation setting changes', () => {
    const updated = mergeConfiguration(withCustomFields, {
      presentation: { hiddenSheetColumns: ['people'] },
    });

    expect(updated.presentation).toEqual({
      ...withCustomFields.presentation,
      hiddenSheetColumns: ['people'],
    });
    expect(updated.presentation?.hiddenCustomFieldIds).not.toBe(
      withCustomFields.presentation?.hiddenCustomFieldIds,
    );
    expect(updated.presentation?.customFieldSort).not.toBe(
      withCustomFields.presentation?.customFieldSort,
    );
  });

  it('merges either custom sort member independently and keeps the fallback sheet sort', () => {
    const changedDirection = mergeConfiguration(withCustomFields, {
      presentation: { customFieldSort: { direction: 'desc' } },
    });
    const changedField = mergeConfiguration(changedDirection, {
      presentation: { customFieldSort: { fieldId: retired } },
    });

    expect(changedDirection.presentation?.customFieldSort).toEqual({
      fieldId: points,
      direction: 'desc',
    });
    expect(changedField.presentation?.customFieldSort).toEqual({
      fieldId: retired,
      direction: 'desc',
    });
    expect(changedField.presentation?.sheetSort).toEqual(configuration.presentation?.sheetSort);
    expect(changedField.sort).toBe(configuration.sort);
    expect(withCustomFields.presentation?.customFieldSort).toEqual({
      fieldId: points,
      direction: 'asc',
    });
  });

  it('replaces or clears individual preferences without correlating them to active definitions', () => {
    const changed = mergeConfiguration(withCustomFields, {
      presentation: { hiddenCustomFieldIds: [], customFieldSort: null },
    });

    expect(changed.presentation?.hiddenCustomFieldIds).toEqual([]);
    expect(changed.presentation).not.toHaveProperty('customFieldSort');
    expect(changed.presentation?.sheetSort).toEqual(configuration.presentation?.sheetSort);
    expect(
      mergeConfiguration(changed, { presentation: { hiddenCustomFieldIds: null } }).presentation,
    ).not.toHaveProperty('hiddenCustomFieldIds');
  });

  it('requires both custom sort members the first time and points the error to customFieldSort', () => {
    expect(() =>
      mergeConfiguration(configuration, { presentation: { customFieldSort: { fieldId: points } } }),
    ).toThrow(expect.objectContaining({ field: 'customFieldSort' }));
    expect(() =>
      mergeConfiguration(configuration, { presentation: { customFieldSort: {} } }),
    ).toThrow(IncompleteSheetSort);
    expect(
      mergeConfiguration(configuration, {
        presentation: { customFieldSort: { fieldId: points, direction: 'asc' } },
      }).presentation?.customFieldSort,
    ).toEqual({ fieldId: points, direction: 'asc' });
  });

  it('keeps identical custom preferences as a no-op and detects actual changes to either setting', () => {
    const view: SavedView = {
      id: 'view',
      organizationId: 'organization',
      listId: 'list',
      name: 'Bugs',
      icon: null,
      configuration: withCustomFields,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      position: 1,
      version: 2,
    };

    expect(
      sameSettings(
        view,
        patchSavedView(view, {
          configuration: {
            presentation: {
              customFieldSort: { direction: 'asc', fieldId: points },
              hiddenCustomFieldIds: [client, retired],
            },
          },
        }),
      ),
    ).toBe(true);
    expect(
      sameSettings(
        view,
        patchSavedView(view, {
          configuration: { presentation: { hiddenCustomFieldIds: [retired, client] } },
        }),
      ),
    ).toBe(false);
    expect(
      sameSettings(
        view,
        patchSavedView(view, {
          configuration: { presentation: { customFieldSort: { fieldId: client } } },
        }),
      ),
    ).toBe(false);
    expect(
      sameSettings(
        view,
        patchSavedView(view, {
          configuration: { presentation: { customFieldSort: null } },
        }),
      ),
    ).toBe(false);
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
