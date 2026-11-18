import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  DESIGN,
  InMemorySpaces,
  OTHER_ORGANIZATION,
  PRODUIT,
  UNKNOWN_SPACE,
  designState,
  spaceState,
} from '../../../spaces.fixture.js';
import type { AllocateTaskKeysInput } from './allocate-task-keys.input.js';
import { AllocateTaskKeys } from './allocate-task-keys.use-case.js';

/**
 * Builds the allocation of numbers in "Produit".
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function allocate(overrides: Partial<AllocateTaskKeysInput> = {}): AllocateTaskKeysInput {
  return { organizationId: ATELIER_NORD, spaceId: PRODUIT, count: 1, ...overrides };
}

/**
 * Atelier Nord: Produit (CAD) has given CAD-481, the private Design (DES) none yet.
 *
 * @param lastNumber - The last number given under CAD.
 */
function atelierNord(lastNumber: number = 481): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState(), designState()],
    lastNumbers: { CAD: lastNumber },
  });
}

describe('AllocateTaskKeys: it hands out consecutive numbers under the prefix of the space', () => {
  it('hands out one number after the last one given', async () => {
    const spaces = atelierNord();

    const output = await new AllocateTaskKeys(spaces).execute(allocate());

    expect(output).toEqual({ prefix: 'CAD', firstNumber: 482 });
    expect(spaces.lastNumberOf(ATELIER_NORD, 'CAD')).toBe(482);
  });

  it('hands out 26 numbers at once: a task and its 25 subtasks', async () => {
    const spaces = atelierNord();

    const output = await new AllocateTaskKeys(spaces).execute(allocate({ count: 26 }));

    expect(output).toEqual({ prefix: 'CAD', firstNumber: 482 });
    expect(spaces.lastNumberOf(ATELIER_NORD, 'CAD')).toBe(507);
  });

  it('starts at 1 for a prefix that has given no number yet', async () => {
    const spaces = atelierNord();

    const output = await new AllocateTaskKeys(spaces).execute(allocate({ spaceId: DESIGN }));

    expect(output).toEqual({ prefix: 'DES', firstNumber: 1 });
    expect(spaces.lastNumberOf(ATELIER_NORD, 'DES')).toBe(1);
  });

  it('never hands out a number twice across consecutive calls', async () => {
    const spaces = atelierNord();
    const allocator = new AllocateTaskKeys(spaces);

    const first = await allocator.execute(allocate({ count: 3 }));
    const second = await allocator.execute(allocate({ count: 26 }));
    const third = await allocator.execute(allocate());

    expect(first.firstNumber).toBe(482);
    expect(second.firstNumber).toBe(485);
    expect(third.firstNumber).toBe(511);
    expect(spaces.lastNumberOf(ATELIER_NORD, 'CAD')).toBe(511);
  });

  it('keeps the counters of the other prefixes apart', async () => {
    const spaces = atelierNord();

    await new AllocateTaskKeys(spaces).execute(allocate({ count: 5 }));
    const design = await new AllocateTaskKeys(spaces).execute(allocate({ spaceId: DESIGN }));

    expect(design.firstNumber).toBe(1);
  });

  it('hands out the numbers the next key previews', async () => {
    const spaces = atelierNord();

    const output = await new AllocateTaskKeys(spaces).execute(allocate());

    expect(`${output.prefix}-${String(output.firstNumber)}`).toBe('CAD-482');
    expect(await spaces.run((store) => store.prefixes.nextNumbers(ATELIER_NORD, ['CAD']))).toEqual(
      new Map([['CAD', 483]]),
    );
  });
});

describe('AllocateTaskKeys: it only moves the counter', () => {
  it('appends no event and leaves the space as it was, version included', async () => {
    const spaces = atelierNord();
    const before = new Map(spaces.spaces);

    await new AllocateTaskKeys(spaces).execute(allocate({ count: 4 }));

    expect(spaces.events).toEqual([]);
    expect(spaces.spaces).toEqual(before);
    expect(spaces.spaces.get(PRODUIT)?.version).toBe(1);
  });

  it('runs once in the unit of work and allocates for the organization, prefix and space of the input', async () => {
    const spaces = atelierNord();

    await new AllocateTaskKeys(spaces).execute(allocate({ count: 2 }));

    expect(spaces.runs).toBe(1);
    expect(spaces.allocateCalls).toEqual([
      { organizationId: ATELIER_NORD, prefix: 'CAD', spaceId: PRODUIT, count: 2 },
    ]);
  });
});

describe('AllocateTaskKeys: a defect throws a plain error and keeps the counter', () => {
  it('throws for a space the organization does not have', async () => {
    const spaces = atelierNord();

    await expect(
      new AllocateTaskKeys(spaces).execute(allocate({ spaceId: UNKNOWN_SPACE })),
    ).rejects.toThrow('unknown to the organization');
    expect(spaces.allocateCalls).toEqual([]);
  });

  it('names the space, and the prefix, in the message so the failure can be traced', async () => {
    const unknown = atelierNord();
    await expect(
      new AllocateTaskKeys(unknown).execute(allocate({ spaceId: UNKNOWN_SPACE })),
    ).rejects.toThrow(UNKNOWN_SPACE);

    const noCounter = atelierNord();
    noCounter.prefixOwners.clear();
    await expect(new AllocateTaskKeys(noCounter).execute(allocate())).rejects.toThrow(
      `prefix CAD of the space ${PRODUIT}`,
    );

    const exhausted = atelierNord(999_999_999);
    await expect(new AllocateTaskKeys(exhausted).execute(allocate())).rejects.toThrow(
      `prefix CAD (space ${PRODUIT})`,
    );
  });

  it('throws for a space of another organization', async () => {
    const spaces = atelierNord();

    await expect(
      new AllocateTaskKeys(spaces).execute(allocate({ organizationId: OTHER_ORGANIZATION })),
    ).rejects.toThrow('unknown to the organization');
  });

  it('throws when the prefix of the space has no counter row', async () => {
    const spaces = atelierNord();
    spaces.prefixOwners.clear();

    await expect(new AllocateTaskKeys(spaces).execute(allocate())).rejects.toThrow(
      'has no counter',
    );
  });

  it.each([0, -1, 27, 1.5, Number.NaN])(
    'throws for the count %s before opening a transaction',
    async (count) => {
      const spaces = atelierNord();

      await expect(new AllocateTaskKeys(spaces).execute(allocate({ count }))).rejects.toThrow(
        '1 to 26',
      );
      expect(spaces.runs).toBe(0);
    },
  );

  it('hands out the last number a key can carry, 999,999,999', async () => {
    const spaces = atelierNord(999_999_998);

    const output = await new AllocateTaskKeys(spaces).execute(allocate());

    expect(output.firstNumber).toBe(999_999_999);
  });

  it('hands out a block that ends exactly on 999,999,999', async () => {
    const spaces = atelierNord(999_999_973);

    const output = await new AllocateTaskKeys(spaces).execute(allocate({ count: 26 }));

    expect(output.firstNumber).toBe(999_999_974);
    expect(spaces.lastNumberOf(ATELIER_NORD, 'CAD')).toBe(999_999_999);
  });

  it('throws when the block would pass 999,999,999 and keeps the counter where it was', async () => {
    const spaces = atelierNord(999_999_999);

    await expect(new AllocateTaskKeys(spaces).execute(allocate())).rejects.toThrow('exhausted');
    expect(spaces.lastNumberOf(ATELIER_NORD, 'CAD')).toBe(999_999_999);
  });

  it('throws when only the last number of a block of 26 passes the bound', async () => {
    const spaces = atelierNord(999_999_974);

    await expect(new AllocateTaskKeys(spaces).execute(allocate({ count: 26 }))).rejects.toThrow(
      'exhausted',
    );
    expect(spaces.lastNumberOf(ATELIER_NORD, 'CAD')).toBe(999_999_974);
  });
});
