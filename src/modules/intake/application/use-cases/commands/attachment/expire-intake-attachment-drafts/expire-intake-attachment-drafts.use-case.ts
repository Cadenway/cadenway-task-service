import type { ExpireIntakeDrafts } from '../../../../ports/outbound/transactions/attachment/expire-intake-drafts.port.js';

const BATCH_SIZE = 100;

/** Releases expired reservations without keeping one transaction across tenants. */
export class ExpireIntakeAttachmentDrafts {
  // #region Constructor
  /** Binds the bounded candidate query and atomic tenant processing. */
  public constructor(private readonly drafts: ExpireIntakeDrafts) {}
  // #endregion

  // #region Methods
  /** Stops on contention and resumes remaining drafts on the next scheduled occurrence. */
  public async execute(signal: AbortSignal): Promise<number> {
    let expired = 0;
    let candidates;
    do {
      signal.throwIfAborted();
      candidates = await this.drafts.findExpired(BATCH_SIZE);
      let processed = 0;
      for (const candidate of candidates) {
        signal.throwIfAborted();
        if (await this.drafts.expire(candidate)) processed += 1;
      }
      expired += processed;
      if (processed < candidates.length) break;
    } while (candidates.length === BATCH_SIZE);
    return expired;
  }
  // #endregion
}
