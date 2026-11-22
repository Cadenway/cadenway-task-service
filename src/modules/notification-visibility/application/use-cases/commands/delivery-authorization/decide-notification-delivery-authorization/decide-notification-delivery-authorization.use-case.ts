import type { NotificationDeliveryAuthorizationInput } from '../../../../models/delivery-authorization/notification-delivery-authorization.model.js';
import type { NotificationDeliveryDecision } from '../../../../models/delivery-authorization/notification-delivery-decision.model.js';
import type { NotificationDeliveryDecisionStore } from '../../../../ports/outbound/persistence/delivery-authorization/notification-delivery-decision-store.port.js';
import type { ResolveNotificationSubjects } from '../../../queries/subject/resolve-notification-subjects/resolve-notification-subjects.use-case.js';

/** With the ambient event transaction, binds a single current visibility decision. */
export class DecideNotificationDeliveryAuthorization {
  // #region Constructor
  /** The unit joins admission, decision and outbox in the existing tenant snapshot. */
  public constructor(
    private readonly inTransaction: (
      decide: (
        repository: NotificationDeliveryDecisionStore,
        publish: (
          fact: Pick<
            NotificationDeliveryDecision,
            'organizationId' | 'authorizationRequestId' | 'decision' | 'validUntil'
          >,
        ) => Promise<{ readonly id: string }>,
      ) => Promise<void>,
    ) => Promise<void>,
    private readonly visibility: Pick<ResolveNotificationSubjects, 'execute'>,
    private readonly now: () => number,
  ) {}
  // #endregion

  // #region Methods
  /** Emits one generic decision for a correlation. Later requests keep the original binding. */
  public execute(
    input: NotificationDeliveryAuthorizationInput,
    signal: AbortSignal,
    membershipAgrees: () => Promise<boolean>,
  ): Promise<void> {
    return this.inTransaction(async (repository, publish) => {
      signal.throwIfAborted();
      const { organizationId, authorizationRequestId, recipientId, subject, expiresAt } = input;
      await repository.lock(organizationId, authorizationRequestId);
      if ((await repository.find(organizationId, authorizationRequestId)) !== null) return;
      signal.throwIfAborted();

      const current =
        this.now() < expiresAt.getTime() && (await membershipAgrees())
          ? await this.visibility.execute({
              organizationId,
              userId: recipientId,
              subjects: [subject],
            })
          : null;
      const decidedAt = new Date(this.now());
      const decision =
        current?.[0]?.visible === true && decidedAt.getTime() < expiresAt.getTime()
          ? 'permit'
          : 'deny';
      const fact = {
        organizationId,
        authorizationRequestId,
        decision,
        validUntil: expiresAt,
      } as const;
      signal.throwIfAborted();
      const { id } = await publish(fact);
      await repository.insert({
        ...fact,
        recipientId,
        subjectKind: subject.kind,
        subjectValue: subject.reference,
        expiresAt,
        decidedAt,
        eventId: id,
        eventVersion: 1,
      });
      signal.throwIfAborted();
    });
  }
  // #endregion
}
