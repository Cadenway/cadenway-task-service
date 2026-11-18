import { eventSchemas } from '@cadenway/contracts/events/organization-service';
import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import { EventConsumers } from '@cadenway/nest-messaging';
import type { EventRedelivery } from '@cadenway/nest-messaging';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OrganizationMembersModule } from '../../../../organization-members.module.js';
import { MEMBER_EVENTS_REDELIVERY } from '../../../tokens/membership/member-events-redelivery.token.js';

/** The schedule of the security projections (P2b security decision 3) for the three consumers. */
const productionSchedule: EventRedelivery = {
  delaysMs: [1_000, 5_000, 30_000, 120_000, 600_000, 1_800_000, 3_600_000],
  maxDeliveries: 32,
};

/** One day, the least a security projection keeps retrying before its dead letter. */
const oneDayMs: number = 24 * 60 * 60 * 1_000;

/**
 * Adds up the delays a failing message waits before its dead letter: one delay after each failed
 * delivery but the last, the last delay repeating, as the kit applies them.
 *
 * @param {EventRedelivery} schedule - The redelivery schedule.
 * @returns {number} The wait in milliseconds.
 */
function waitBeforeDeadLetter(schedule: EventRedelivery): number {
  const deliveries: number = schedule.maxDeliveries ?? schedule.delaysMs.length + 1;
  let total: number = 0;
  for (let failure: number = 0; failure < deliveries - 1; failure += 1) {
    total += schedule.delaysMs[Math.min(failure, schedule.delaysMs.length - 1)] ?? 0;
  }
  return total;
}

/** The registrations `OrganizationMembersModule` made, in order. */
const subscribe: Mock<(registration: unknown) => Promise<void>> =
  vi.fn<(registration: unknown) => Promise<void>>();

/**
 * Stands for the global providers of the kit that `OrganizationMembersModule` injects: the durable
 * consumers, which record the registrations instead of reaching a broker, and the tenant runner,
 * which no registration uses.
 */
@Global()
@Module({
  providers: [
    { provide: EventConsumers, useValue: { subscribe } },
    { provide: TenantTransactionRunner, useValue: {} },
  ],
  exports: [EventConsumers, TenantTransactionRunner],
})
class KitDoubles {}

describe('OrganizationMembersModule composition of the member event consumers', () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
    subscribe.mockReset();
    subscribe.mockResolvedValue(undefined);
    moduleRef = await Test.createTestingModule({ imports: [KitDoubles, OrganizationMembersModule] })
      .setLogger({ log: () => undefined, error: () => undefined, warn: () => undefined })
      .compile();
    await moduleRef.init();
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('binds the production schedule: 1 s, 5 s, 30 s, 2 min, 10 min, 30 min, then hourly, 32 deliveries', () => {
    expect(moduleRef.get(MEMBER_EVENTS_REDELIVERY)).toEqual(productionSchedule);
  });

  it('subscribes the three consumers the NATS grants allow, with that schedule, from the whole history', () => {
    const registrations: readonly unknown[] = subscribe.mock.calls.map(
      ([registration]: [unknown]): unknown => registration,
    );

    expect(registrations).toEqual([
      expect.objectContaining({
        handler: 'project-member-joined',
        schemas: eventSchemas,
        event: 'member.joined.v1',
        redelivery: productionSchedule,
      }),
      expect.objectContaining({
        handler: 'project-member-role-changed',
        schemas: eventSchemas,
        event: 'member.role-changed.v1',
        redelivery: productionSchedule,
      }),
      expect.objectContaining({
        handler: 'project-member-removed',
        schemas: eventSchemas,
        event: 'member.removed.v1',
        redelivery: productionSchedule,
      }),
    ]);
    for (const registration of registrations) {
      expect(registration).not.toHaveProperty('deliverPolicy');
    }
  });

  it('keeps retrying a failing event for more than a day before its dead letter', () => {
    const schedule: EventRedelivery = moduleRef.get(MEMBER_EVENTS_REDELIVERY);

    // 1 s + 5 s + 30 s + 2 min + 10 min + 30 min + 25 hours: 92,556 seconds.
    expect(waitBeforeDeadLetter(schedule)).toBe(92_556_000);
    expect(waitBeforeDeadLetter(schedule)).toBeGreaterThan(oneDayMs);
  });
});
