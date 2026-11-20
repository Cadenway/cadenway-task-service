import { describe, expect, it } from 'vitest';

import { DeletionStepError } from '../../../../models/deletion/deletion-step-error.model.js';
import type { TrashPurgeScheduleStore } from '../../../../models/transactions/trash-purge-schedule-store.model.js';
import type { OrganizationsWithTrash } from '../../../../ports/outbound/tasks/trash/organizations-with-trash.port.js';
import type { TrashPurgeScheduleUnitOfWork } from '../../../../ports/outbound/transactions/trash/trash-purge-schedule-unit-of-work.port.js';
import { ScheduleTrashPurge } from './schedule-trash-purge.use-case.js';

/** The id of the scheduled job of 19 November 2026. */
const SCHEDULED_JOB: string = '019a9000-0000-7000-8000-000000000003';

/**
 * The id of the organization at a position, in lower case.
 *
 * @param index - The position.
 * @returns The id.
 */
function organizationAt(index: number): string {
  return `019a5f3c-0000-7000-8000-${String(index).padStart(12, '0')}`;
}

/**
 * Wires the use case on organizations sorted by id and a unit of work whose runs record what they
 * enqueue, each run one system transaction, answering the organizations already enqueued as
 * duplicates.
 *
 * @param organizations - The organizations with trash to erase.
 * @param duplicates - The organizations a previous attempt enqueued.
 * @param onPage - Run at each read, before it answers.
 * @param failEnqueue - Makes every enqueue reject with this error.
 * @returns The use case, the pages asked for and what each run enqueued.
 */
function wire(
  organizations: readonly string[],
  duplicates: readonly string[] = [],
  onPage: () => void = () => undefined,
  failEnqueue: Error | null = null,
): {
  readonly useCase: ScheduleTrashPurge;
  readonly pages: { readonly after: string | null; readonly limit: number }[];
  readonly enqueued: { readonly organizationIds: readonly string[]; readonly key: string }[];
} {
  const pages: { readonly after: string | null; readonly limit: number }[] = [];
  const enqueued: { organizationIds: string[]; key: string }[] = [];
  const sorted = [...organizations].sort();
  const read: OrganizationsWithTrash = {
    page: (after: string | null, limit: number) => {
      pages.push({ after, limit });
      onPage();
      return Promise.resolve(
        sorted
          .filter((id) => after === null || id.toLowerCase() > after.toLowerCase())
          .slice(0, limit),
      );
    },
  };
  const unitOfWork: TrashPurgeScheduleUnitOfWork = {
    run: <TResult>(
      work: (store: TrashPurgeScheduleStore) => Promise<TResult>,
    ): Promise<TResult> => {
      const run: { organizationIds: string[]; key: string } = { organizationIds: [], key: '' };
      enqueued.push(run);
      return work({
        purges: {
          enqueue: (organizationId: string, occurrenceKey: string) => {
            if (failEnqueue !== null) {
              return Promise.reject(failEnqueue);
            }
            run.organizationIds.push(organizationId);
            run.key = occurrenceKey;
            return Promise.resolve(!duplicates.includes(organizationId));
          },
        },
      });
    },
  };
  return { useCase: new ScheduleTrashPurge(read, unitOfWork), pages, enqueued };
}

describe('ScheduleTrashPurge: one purge job per organization with trash to erase', () => {
  it('enqueues the organizations of a page under the occurrence of the scheduled job', async () => {
    const atelierNord = organizationAt(1);
    const other = organizationAt(2);
    const { useCase, pages, enqueued } = wire([other, atelierNord]);

    const output = await useCase.execute({ jobId: SCHEDULED_JOB });

    expect(output).toEqual({ organizations: 2, enqueued: 2, pages: 1 });
    expect(pages).toEqual([{ after: null, limit: 1_000 }]);
    expect(enqueued).toEqual([
      { organizationIds: [atelierNord, other], key: `scheduled:${SCHEDULED_JOB}` },
    ]);
  });

  it('pages 1,000 organizations at a time after the last id, and stops after a shorter page', async () => {
    const organizations = Array.from({ length: 2_001 }, (_, index) => organizationAt(index + 1));
    const { useCase, pages, enqueued } = wire(organizations);

    const output = await useCase.execute({ jobId: SCHEDULED_JOB });

    expect(output).toEqual({ organizations: 2_001, enqueued: 2_001, pages: 3 });
    expect(pages.map((page) => page.after)).toEqual([
      null,
      organizationAt(1_000),
      organizationAt(2_000),
    ]);
    expect(enqueued.map((call) => call.organizationIds.length)).toEqual([1_000, 1_000, 1]);
  });

  it('reads one more, empty page after a full last page, and enqueues nothing for it', async () => {
    const organizations = Array.from({ length: 1_000 }, (_, index) => organizationAt(index + 1));
    const { useCase, pages, enqueued } = wire(organizations);

    const output = await useCase.execute({ jobId: SCHEDULED_JOB });

    expect(output).toEqual({ organizations: 1_000, enqueued: 1_000, pages: 2 });
    expect(pages).toHaveLength(2);
    expect(enqueued).toHaveLength(1);
  });

  it('enqueues nothing when no organization has trash to erase', async () => {
    const { useCase, enqueued } = wire([]);

    const output = await useCase.execute({ jobId: SCHEDULED_JOB });

    expect(output).toEqual({ organizations: 0, enqueued: 0, pages: 1 });
    expect(enqueued).toEqual([]);
  });

  it('enqueues the organizations in lower case, so their jobs run in the organization of their tables', async () => {
    const upper = organizationAt(1).toUpperCase();
    const { useCase, enqueued } = wire([upper]);

    await useCase.execute({ jobId: SCHEDULED_JOB });

    expect(enqueued[0]?.organizationIds).toEqual([organizationAt(1)]);
  });

  it('counts only the jobs a retried attempt adds, under the same occurrence', async () => {
    const { useCase, enqueued } = wire([organizationAt(1), organizationAt(2)], [organizationAt(1)]);

    const output = await useCase.execute({ jobId: SCHEDULED_JOB });

    expect(output).toEqual({ organizations: 2, enqueued: 1, pages: 1 });
    expect(enqueued[0]?.key).toBe(`scheduled:${SCHEDULED_JOB}`);
  });

  it('rejects with a step error of the step schedule, with the pages before, when an enqueue fails', async () => {
    const failure = new Error('canceling statement due to statement timeout');
    const { useCase } = wire([organizationAt(1)], [], () => undefined, failure);

    const rejection: unknown = await useCase
      .execute({ jobId: SCHEDULED_JOB })
      .catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(DeletionStepError);
    expect(rejection).toMatchObject({ step: 'schedule', batches: 0, cause: failure });
  });

  it('rejects with a step error of the step schedule when the read of the organizations fails', async () => {
    const failure = new Error('canceling statement due to statement timeout');
    const read: OrganizationsWithTrash = { page: () => Promise.reject(failure) };
    const unitOfWork: TrashPurgeScheduleUnitOfWork = {
      run: () => Promise.reject(new Error('Not reached.')),
    };

    await expect(
      new ScheduleTrashPurge(read, unitOfWork).execute({ jobId: SCHEDULED_JOB }),
    ).rejects.toThrow(
      expect.objectContaining({ step: 'schedule', batches: 0, cause: failure }) as Error,
    );
  });

  it('reads no page once the signal of the attempt aborted', async () => {
    const attempt = new AbortController();
    const organizations = Array.from({ length: 1_500 }, (_, index) => organizationAt(index + 1));
    const { useCase, pages } = wire(organizations, [], () => {
      attempt.abort(new Error('The attempt expired.'));
    });

    await expect(useCase.execute({ jobId: SCHEDULED_JOB, signal: attempt.signal })).rejects.toThrow(
      'The attempt expired.',
    );
    expect(pages).toHaveLength(1);
  });
});
