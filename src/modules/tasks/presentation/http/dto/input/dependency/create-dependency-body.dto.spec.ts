import { describe, expect, it } from 'vitest';

import { CreateDependencyBody } from './create-dependency-body.dto.js';
import { DependencyPath } from './dependency-path.dto.js';
import { ListDependenciesQuery } from './list-dependencies-query.dto.js';
import { ListDependencyCandidatesQuery } from './list-dependency-candidates-query.dto.js';

describe('the dependency route inputs', () => {
  it('requires a valid task key and declared direction for creation', () => {
    expect(
      CreateDependencyBody.schema.parse({ otherTaskKey: 'CAD-483', direction: 'blocks' }),
    ).toEqual({ otherTaskKey: 'CAD-483', direction: 'blocks' });
    expect(CreateDependencyBody.schema.safeParse({}).success).toBe(false);
    expect(
      CreateDependencyBody.schema.safeParse({ otherTaskKey: 'cad-483', direction: 'blocks' })
        .success,
    ).toBe(false);
    expect(
      CreateDependencyBody.schema.safeParse({ otherTaskKey: 'CAD-483', direction: 'both' }).success,
    ).toBe(false);
  });

  it('checks both parts of a dependency item path', () => {
    const valid = { taskKey: 'CAD-482', dependencyId: '019a7007-8b9c-7d0e-8f1a-2b3c4d5e6f01' };
    expect(DependencyPath.schema.parse(valid)).toEqual(valid);
    expect(DependencyPath.schema.safeParse({ ...valid, dependencyId: 'bad' }).success).toBe(false);
    expect(DependencyPath.schema.safeParse({ ...valid, taskKey: 'CAD-00' }).success).toBe(false);
  });

  it('validates the bounded page and required direction from the published contract', () => {
    expect(ListDependenciesQuery.schema.parse({})).toEqual({ limit: 50 });
    expect(ListDependenciesQuery.schema.safeParse({ limit: '101' }).success).toBe(false);
    expect(
      ListDependencyCandidatesQuery.schema.parse({ direction: 'blocked-by', limit: '100' }),
    ).toEqual({ direction: 'blocked-by', limit: 100 });
    expect(ListDependencyCandidatesQuery.schema.safeParse({}).success).toBe(false);
    expect(
      ListDependencyCandidatesQuery.schema.safeParse({
        direction: 'blocks',
        search: 'bad\u0000text',
      }).success,
    ).toBe(false);
  });
});
