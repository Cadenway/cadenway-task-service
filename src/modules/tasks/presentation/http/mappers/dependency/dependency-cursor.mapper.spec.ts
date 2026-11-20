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

  it('binds an edge cursor to its anchor task', () => {
    const cursor = toDependencyCursor(edge, 'CAD-482');
    expect(toDependencyPosition(cursor ?? undefined, 'CAD-482')).toEqual(edge);
    expect(toDependencyCursor(null, 'CAD-482')).toBeNull();
    expect(toDependencyPosition(undefined, 'CAD-482')).toBeNull();
    expectInvalidCursor(() => toDependencyPosition(cursor ?? undefined, 'CAD-483'));
  });

  it('binds a candidate cursor to its task, direction and search', () => {
    const cursor = toCandidateCursor(candidate, 'CAD-482', 'blocks', 'connexion');
    expect(toCandidatePosition(cursor ?? undefined, 'CAD-482', 'blocks', 'connexion')).toEqual(
      candidate,
    );
    expect(toCandidateCursor(null, 'CAD-482', 'blocks', null)).toBeNull();
    expect(toCandidatePosition(undefined, 'CAD-482', 'blocks', null)).toBeNull();
    expectInvalidCursor(() =>
      toCandidatePosition(cursor ?? undefined, 'CAD-483', 'blocks', 'connexion'),
    );
    expectInvalidCursor(() =>
      toCandidatePosition(cursor ?? undefined, 'CAD-482', 'blocked-by', 'connexion'),
    );
    expectInvalidCursor(() => toCandidatePosition(cursor ?? undefined, 'CAD-482', 'blocks', null));
  });

  it('refuses forged ranks, keys and text that PostgreSQL cannot store', () => {
    const filters = {
      collection: 'dependency-candidates',
      taskKey: 'CAD-482',
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
      expectInvalidCursor(() => toCandidatePosition(cursor, 'CAD-482', 'blocks', null));
    }
  });

  it('keeps a maximum length name with supplementary characters inside the codec limit', () => {
    const large: DependencyCandidatePosition = { ...candidate, name: '🚀'.repeat(300) };
    const cursor = toCandidateCursor(large, 'CAD-482', 'blocks', null);
    expect(cursor?.length).toBeLessThanOrEqual(2048);
    expect(toCandidatePosition(cursor ?? undefined, 'CAD-482', 'blocks', null)).toEqual(large);
  });

  it('keeps a valid name containing many JSON-escaped characters within the cursor limit', () => {
    const escaped: DependencyCandidatePosition = {
      ...candidate,
      name: `A${'\u0001'.repeat(298)}B`,
    };
    const cursor = toCandidateCursor(escaped, 'CAD-482', 'blocks', null);
    expect(cursor?.length).toBeLessThanOrEqual(2048);
    expect(toCandidatePosition(cursor ?? undefined, 'CAD-482', 'blocks', null)).toEqual(escaped);
  });
});
