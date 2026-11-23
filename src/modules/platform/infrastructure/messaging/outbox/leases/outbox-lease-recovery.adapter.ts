import type { DatabaseSchema, SystemTransactionRunner } from '@cadenway/nest-common/database';
import { recoverExpiredOutboxLeases } from '@cadenway/nest-messaging/outbox/relay';

/** Releases expired reservations in bounded transactions after the leased relay is stopped. */
export async function recoverOutboxLeases<TSchema extends DatabaseSchema>(
  system: SystemTransactionRunner<TSchema>,
): Promise<{ readonly released: number; readonly leasesRemain: boolean }> {
  const batchSize = 100;
  const maxBatches = 20;
  let released = 0;

  for (let batch = 0; batch < maxBatches; batch++) {
    const count = await system.run((tx) => recoverExpiredOutboxLeases(tx, batchSize));
    released += count;
    if (count < batchSize) break;
  }

  const leasesRemain = await system.run(async ({ client }) => {
    const result = await client.query(
      "select 1 from public.outbox_events where status = 'leased' limit 1",
    );
    return result.rows.length > 0;
  });
  return { released, leasesRemain };
}
