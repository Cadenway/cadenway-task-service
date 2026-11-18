import { describe, expect, it } from 'vitest';

import type { SpacesStore } from '../../models/transactions/spaces-store.model.js';
import {
  ATELIER_NORD,
  DESIGN,
  InMemorySpaces,
  OTHER_ORGANIZATION,
  designState,
  marketingState,
  spaceState,
} from '../../use-cases/spaces.fixture.js';
import { SpaceViewBuilder } from './space-view-builder.service.js';

describe('SpaceViewBuilder: the next key of a space is its prefix and the next number', () => {
  const views = new SpaceViewBuilder();

  it('names CAD-482 as the next key of Produit after CAD-481', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState()], lastNumbers: { CAD: 481 } });

    const view = await spaces.run((store: SpacesStore) =>
      views.buildOne(store.prefixes, ATELIER_NORD, spaceState()),
    );

    expect(view).toEqual({ space: spaceState(), nextKey: 'CAD-482' });
  });

  it('starts at 1 for a prefix that gave no number yet', async () => {
    const spaces = new InMemorySpaces({ spaces: [designState()] });

    const view = await spaces.run((store: SpacesStore) =>
      views.buildOne(store.prefixes, ATELIER_NORD, designState()),
    );

    expect(view.nextKey).toBe('DES-1');
  });

  it('counts per organization: the numbers of another organization are not read', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState()], lastNumbers: { CAD: 481 } });

    const view = await spaces.run((store: SpacesStore) =>
      views.buildOne(store.prefixes, OTHER_ORGANIZATION, spaceState()),
    );

    expect(view.nextKey).toBe('CAD-1');
  });

  it('builds a page of views with one read of the numbers, in the order of the spaces', async () => {
    const page = [spaceState(), designState(), marketingState()];
    const spaces = new InMemorySpaces({ spaces: page, lastNumbers: { CAD: 481, MKT: 9 } });

    const built = await spaces.run((store: SpacesStore) =>
      views.build(store.prefixes, ATELIER_NORD, page),
    );

    expect(built.map((view) => view.nextKey)).toEqual(['CAD-482', 'DES-1', 'MKT-10']);
    expect(spaces.nextNumbersCalls).toEqual([['CAD', 'DES', 'MKT']]);
  });

  it('asks for each prefix once when several spaces share it', async () => {
    const page = [spaceState(), spaceState({ id: DESIGN })];
    const spaces = new InMemorySpaces({ spaces: [spaceState()] });

    await spaces.run((store: SpacesStore) => views.build(store.prefixes, ATELIER_NORD, page));

    expect(spaces.nextNumbersCalls).toEqual([['CAD']]);
  });

  it('reads nothing for an empty page', async () => {
    const spaces = new InMemorySpaces();

    const built = await spaces.run((store: SpacesStore) =>
      views.build(store.prefixes, ATELIER_NORD, []),
    );

    expect(built).toEqual([]);
    expect(spaces.nextNumbersCalls).toEqual([]);
  });
});
