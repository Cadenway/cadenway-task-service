import { ResolveTaskSearchAccessInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';
import { z } from 'zod';

const published = ResolveTaskSearchAccessInternalBody.shape;
const [task, list, space] = published.candidates.element.options;
const candidate = z.union([task.strict(), list.strict(), space.strict()]);
const body = ResolveTaskSearchAccessInternalBody.extend({
  membership: published.membership.strict().transform((membership) => ({
    ...membership,
    memberId: membership.memberId.toLowerCase(),
  })),
  candidates: published.candidates.and(z.array(candidate)).transform((candidates) =>
    candidates.map((value) => ({
      ...value,
      id: value.kind === 'task' ? value.id : value.id.toLowerCase(),
    })),
  ),
}).superRefine(({ candidates }, context) => {
  const seen = new Set<string>();
  for (const [index, { kind, id }] of candidates.entries()) {
    const key = `${kind}:${id}`;
    if (seen.has(key)) {
      context.addIssue({
        code: 'custom',
        path: ['candidates', index, 'id'],
        message: 'Search candidates must be unique.',
      });
    }
    seen.add(key);
  }
});

/** Validates the published proof request, including strict nested shapes and canonical uniqueness. */
export class TaskSearchAccessBody extends zodDto(body) {}
