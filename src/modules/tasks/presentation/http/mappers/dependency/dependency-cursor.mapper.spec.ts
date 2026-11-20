import { encodeCursor, ProblemException } from '@cadenway/nest-common';
import { describe, expect, it } from 'vitest';

import type { DependencyCandidatePosition } from '../../../../application/models/dependency/dependency-candidate-position.model.js';
import type { PagePosition } from '../../../../application/models/page/page-position.model.js';
import {
  toCandidateCursor,
  toCandidatePosition,
  toDependencyCursor,
  toDependencyPosition,
} from './dependency-cursor.mapper.js';

/** Reads the problem raised when an invalid cursor is decoded. */
function refusalOf(decode: () => unknown): ProblemException {
  try {
    decode();
  } catch (error) {
    if (error instanceof ProblemException) return error;
    throw error;
  }
  throw new Error('Expected an invalid cursor.');
}

/** Checks that a malformed cursor receives the contract's query issue. */
function expectInvalidCursor(decode: () => unknown): void {
  const refusal = refusalOf(decode);
  expect(refusal.problem.status).toBe(400);
  expect(refusal.problem.code).toBe('request.invalid');
  expect(refusal.problem.details).toMatchObject({
    issues: [{ in: 'query', path: 'cursor', code: 'invalid_cursor' }],
  });
}

describe('dependency cursors', () => {
  const anchor = {
    organizationId: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b02',
    taskKey: 'CAD-482',
  };
  const otherTask = { ...anchor, taskKey: 'CAD-483' };
  const otherOrganization = {
    ...anchor,
    organizationId: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b03',
  };
  const edge: PagePosition = {
    createdAt: new Date('2026-11-18T10:15:30.123Z'),
    id: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01',
  };
  const candidate: DependencyCandidatePosition = {
    rank: 0,
    name: 'Refondre la connexion 🚀',
    keyPrefix: 'CAD',
    keyNumber: 483,
  };

  it('binds an edge cursor to its anchor task and organization', () => {
    const cursor = toDependencyCursor(edge, anchor);
    expect(toDependencyPosition(cursor ?? undefined, anchor)).toEqual(edge);
    expect(toDependencyCursor(null, anchor)).toBeNull();
    expect(toDependencyPosition(undefined, anchor)).toBeNull();
    expectInvalidCursor(() => toDependencyPosition(cursor ?? undefined, otherTask));
    expectInvalidCursor(() => toDependencyPosition(cursor ?? undefined, otherOrganization));
  });

  it('binds a candidate cursor to its task, direction and search', () => {
    const cursor = toCandidateCursor(candidate, anchor, 'blocks', 'connexion');
    expect(toCandidatePosition(cursor ?? undefined, anchor, 'blocks', 'connexion')).toEqual(
      candidate,
    );
    expect(toCandidateCursor(null, anchor, 'blocks', null)).toBeNull();
    expect(toCandidatePosition(undefined, anchor, 'blocks', null)).toBeNull();
    expectInvalidCursor(() =>
      toCandidatePosition(cursor ?? undefined, otherTask, 'blocks', 'connexion'),
    );
    expectInvalidCursor(() =>
      toCandidatePosition(cursor ?? undefined, anchor, 'blocked-by', 'connexion'),
    );
    expectInvalidCursor(() => toCandidatePosition(cursor ?? undefined, anchor, 'blocks', null));
    expectInvalidCursor(() =>
      toCandidatePosition(cursor ?? undefined, otherOrganization, 'blocks', 'connexion'),
    );
  });

  it('refuses forged ranks, keys and text that PostgreSQL cannot store', () => {
    const filters = {
      collection: 'dependency-candidates',
      ...anchor,
      direction: 'blocks',
      search: null,
    };
    for (const position of [
      { sort: [2, 'Task'], id: 'CAD-483' },
      { sort: [0, 'Task'], id: 'CAD-0001' },
      { sort: [0, 'a\u0000b'], id: 'CAD-483' },
      { sort: [0, 'a\ud800'], id: 'CAD-483' },
      { sort: [0, 'a'.repeat(301)], id: 'CAD-483' },
    ]) {
      const cursor = encodeCursor(position, filters);
      expectInvalidCursor(() => toCandidatePosition(cursor, anchor, 'blocks', null));
    }
  });

  it('keeps a maximum length name with supplementary characters inside the codec limit', () => {
    const large: DependencyCandidatePosition = { ...candidate, name: '🚀'.repeat(300) };
    const cursor = toCandidateCursor(large, anchor, 'blocks', null);
    expect(cursor?.length).toBeLessThanOrEqual(2048);
    expect(toCandidatePosition(cursor ?? undefined, anchor, 'blocks', null)).toEqual(large);
  });

  it('keeps a valid name containing many JSON-escaped characters within the cursor limit', () => {
    const escaped: DependencyCandidatePosition = {
      ...candidate,
      name: `A${'\u0001'.repeat(298)}B`,
    };
    const cursor = toCandidateCursor(escaped, anchor, 'blocks', null);
    expect(cursor?.length).toBeLessThanOrEqual(2048);
    expect(toCandidatePosition(cursor ?? undefined, anchor, 'blocks', null)).toEqual(escaped);
  });
});
