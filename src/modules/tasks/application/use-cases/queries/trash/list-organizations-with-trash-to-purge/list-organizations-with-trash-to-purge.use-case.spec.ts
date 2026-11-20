import { describe, expect, it } from 'vitest';

import type { TrashSystemStore } from '../../../../models/transactions/trash-system-store.model.js';
import type { TrashSystemUnitOfWork } from '../../../../ports/outbound/transactions/trash/trash-system-unit-of-work.port.js';
import { ATELIER_NORD, NOW, OTHER_ORGANIZATION } from '../../../tasks.fixture.js';
import { ListOrganizationsWithTrashToPurge } from './list-organizations-with-trash-to-purge.use-case.js';

/** A read the fake reader received. */
interface Read {
  // #region Properties
  /** The cut-off of the due entries. */
  readonly dueBefore: Date;

  /** The last organization of the previous page. */
  readonly after: string | null;

  /** The size of the page. */
  readonly limit: number;
  // #endregion
}

/**
 * A fake system unit of work over the organizations with trash to erase, at the instant NOW.
 */
class InMemoryTrashSystem implements TrashSystemUnitOfWork {
  // #region Properties
  /** The read-only runs. */
  public runs: number = 0;

  /** The reads, in order. */
  public readonly reads: Read[] = [];

  /** The organizations with trash to erase, in ascending order. */
  private readonly organizations: readonly string[];
  // #endregion

  // #region Constructor
  /**
   * Holds the organizations.
   *
   * @param organizations - The organizations with trash to erase.
   */
  public constructor(organizations: readonly string[]) {
    this.organizations = [...organizations].sort();
  }
  // #endregion

  // #region Methods
  /**
   * Runs the read on the fake store.
   *
   * @param work - The read.
   * @returns What it resolved with.
   */
  public runReadOnly<TResult>(
    work: (store: TrashSystemStore) => Promise<TResult>,
  ): Promise<TResult> {
    this.runs += 1;
    return work({
      clock: { now: (): Promise<Date> => Promise.resolve(NOW) },
      organizations: {
        withEntriesToPurge: (
          dueBefore: Date,
          after: string | null,
          limit: number,
        ): Promise<readonly string[]> => {
          this.reads.push({ dueBefore, after, limit });
          return Promise.resolve(
            this.organizations
              .filter((id: string): boolean => after === null || id > after)
              .slice(0, limit),
          );
        },
      },
    });
  }
  // #endregion
}

describe('ListOrganizationsWithTrashToPurge: the organizations with trash to erase, by id', () => {
  it('reads one page in a read-only system transaction, the entries due 30 days before its instant', async () => {
    const system = new InMemoryTrashSystem([OTHER_ORGANIZATION, ATELIER_NORD]);
    const useCase = new ListOrganizationsWithTrashToPurge(system);

    expect(await useCase.execute({ after: null, limit: 1000 })).toEqual({
      organizationIds: [ATELIER_NORD, OTHER_ORGANIZATION],
    });
    expect(system.runs).toBe(1);
    expect(system.reads).toEqual([
      { dueBefore: new Date('2026-10-09T10:20:00.000Z'), after: null, limit: 1000 },
    ]);
  });

  it('continues after the last organization of the previous page, lower-cased', async () => {
    const system = new InMemoryTrashSystem([OTHER_ORGANIZATION, ATELIER_NORD]);
    const useCase = new ListOrganizationsWithTrashToPurge(system);

    expect(await useCase.execute({ after: ATELIER_NORD.toUpperCase(), limit: 1 })).toEqual({
      organizationIds: [OTHER_ORGANIZATION],
    });
    expect(system.reads[0]?.after).toBe(ATELIER_NORD);
  });

  it.each([0, 1001, 1.5])(
    'refuses a page of %s organizations without reading',
    async (limit: number) => {
      const system = new InMemoryTrashSystem([]);

      await expect(
        new ListOrganizationsWithTrashToPurge(system).execute({ after: null, limit }),
      ).rejects.toThrow('A page of organizations holds 1 to 1000 of them.');
      expect(system.runs).toBe(0);
    },
  );
});
