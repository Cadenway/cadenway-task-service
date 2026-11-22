import type { DelegatedMembershipProof } from '../../../../application/models/membership/delegated-membership-proof.model.js';

const actionProofs = new WeakMap<object, DelegatedMembershipProof>();

/** Keeps a proof from the pre-interceptor guard in server-side request state. */
export function keepActionProof(request: object, proof: DelegatedMembershipProof): void {
  actionProofs.set(request, proof);
}

/** Reads the proof without trusting any request body or header fields. */
export function actionProofOf(request: object): DelegatedMembershipProof | undefined {
  return actionProofs.get(request);
}
