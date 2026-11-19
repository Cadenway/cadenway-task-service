/**
 * Type QuotaVerdict
 *
 * @description
 * Whether a requester may ask for access once more within the hourly limit: `allowed`, or refused
 * with `nextAvailableAt`, when the oldest request counted leaves the hour, and `retryAfterSeconds`,
 * the whole seconds until then, at least 1 (`429 access-request.limit-reached` of
 * `openapi/internal/task-service.yaml`, with `details.nextAvailableAt` and `Retry-After`).
 *
 * @type {{ readonly allowed: true } | { readonly allowed: false; readonly nextAvailableAt: Date; readonly retryAfterSeconds: number }}
 */
export type QuotaVerdict =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly nextAvailableAt: Date;
      readonly retryAfterSeconds: number;
    };
