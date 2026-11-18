import type { MemberRemovedV1 } from '@cadenway/contracts/events/organization-service';
import type { EventConsumers, EventContext, EventRedelivery } from '@cadenway/nest-messaging';
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import type { ApplyMemberEventInput } from '../../../../application/use-cases/commands/membership/apply-member-event/apply-member-event.input.js';
import type { ApplyMemberEventOutput } from '../../../../application/use-cases/commands/membership/apply-member-event/apply-member-event.output.js';
import type { ApplyMemberEvent } from '../../../../application/use-cases/commands/membership/apply-member-event/apply-member-event.use-case.js';
import { MemberEventsHandler } from './member-events.handler.js';

const redelivery: EventRedelivery = { delaysMs: [1_000], maxDeliveries: 3 };

const removed: MemberRemovedV1 = {
  eventId: '019a8000-0000-7000-8000-000000000001',
  memberId: '019A5F3C-8D2E-7C4A-9B1F-3E5D7A9C1B50',
  organizationId: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b99',
  userId: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b32',
  role: 'member',
  version: 3,
  occurredAt: '2026-11-18T09:00:00.000Z',
} as unknown as MemberRemovedV1;

/** The handler of `member.removed.v1` the module registered, as the kit would call it. */
type RemovedHandler = (payload: MemberRemovedV1, context: EventContext) => Promise<void>;

/**
 * Builds the handler over a use case that answers with `execute`, starts it and returns what it
 * registered for `member.removed.v1`.
 *
 * @param execute - The use case.
 * @returns The function the kit calls for each delivery.
 */
async function removedHandlerOver(
  execute: (input: ApplyMemberEventInput) => Promise<ApplyMemberEventOutput>,
): Promise<RemovedHandler> {
  const registrations: { event: string; handle: unknown }[] = [];
  const consumers = {
    subscribe: (registration: { event: string; handle: unknown }): Promise<void> => {
      registrations.push(registration);
      return Promise.resolve();
    },
  } as unknown as EventConsumers;
  const useCase = { execute } as unknown as ApplyMemberEvent;
  await new MemberEventsHandler(consumers, useCase, redelivery).onApplicationBootstrap();
  const registration = registrations.find((candidate) => candidate.event === 'member.removed.v1');
  if (registration === undefined) {
    throw new Error('The handler of member.removed.v1 was not registered.');
  }
  return registration.handle as RemovedHandler;
}

/**
 * Builds the delivery metadata the kit gives a handler.
 *
 * @param deliveryCount - The one-based number of the delivery.
 * @returns The context.
 */
function deliveryOf(deliveryCount: number): EventContext {
  return { deliveryCount } as unknown as EventContext;
}

describe('MemberEventsHandler: a removal that fails is logged once with its cause and rethrown', () => {
  let warn: MockInstance<Logger['warn']>;

  beforeEach(() => {
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('rethrows the very error of the use case so the kit retries the delivery', async () => {
    const failure = new Error('canceling statement due to lock timeout');
    const handle = await removedHandlerOver(() => Promise.reject(failure));

    await expect(handle(removed, deliveryOf(2))).rejects.toBe(failure);
  });

  it('logs the failure once, with the error under err and the delivery count', async () => {
    const failure = new Error('canceling statement due to lock timeout');
    const handle = await removedHandlerOver(() => Promise.reject(failure));

    await handle(removed, deliveryOf(4)).catch((): undefined => undefined);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toEqual({ err: failure, deliveryCount: 4 });
  });

  it('puts no identifier of the member in the fields of the log', async () => {
    const handle = await removedHandlerOver(() => Promise.reject(new Error('failed')));

    await handle(removed, deliveryOf(1)).catch((): undefined => undefined);

    const fields = JSON.stringify(warn.mock.calls[0]?.[0] ?? {});
    expect(fields).not.toContain(removed.userId);
    expect(fields).not.toContain(removed.memberId.toLowerCase());
  });

  it('logs nothing when the removal succeeds without private spaces awaiting an owner', async () => {
    const handle = await removedHandlerOver(() =>
      Promise.resolve({ privateSpacesAwaitingOwner: 0 }),
    );

    await handle(removed, deliveryOf(1));

    expect(warn).not.toHaveBeenCalled();
  });

  it('still reports once the private spaces left awaiting an owner', async () => {
    const handle = await removedHandlerOver(() =>
      Promise.resolve({ privateSpacesAwaitingOwner: 2 }),
    );

    await handle(removed, deliveryOf(1));

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('passes the lower-cased ids of the event to the use case', async () => {
    const execute = vi.fn<(input: ApplyMemberEventInput) => Promise<ApplyMemberEventOutput>>(() =>
      Promise.resolve({ privateSpacesAwaitingOwner: 0 }),
    );
    const handle = await removedHandlerOver(execute);

    await handle(removed, deliveryOf(1));

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'removed', memberId: removed.memberId.toLowerCase() }),
    );
  });
});
