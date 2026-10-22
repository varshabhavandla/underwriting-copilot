/**
 * Boundary to a lender's loan servicing system. A real adapter implements this interface; nothing else in the product
 * knows how boarding works. Contract:
 *  - `board` is called at least once per approved case with the same `idempotencyKey` every time; implementations must treat a repeat
 *    as the same request and return the same `externalId` (at-least-once delivery, exactly-once effect).
 *  - `retryable: true` means try again later (timeouts, 5xx, rate limits); false means the system refused and a person must act.
 *  - The adapter never decides anything: it is called only after a recorded human decision.
 */
export interface BoardingPackage {
  idempotencyKey: string;
  caseId: string;
  decisionId: string;
  policyVersion: string;
  decidedAt: string;
  borrower: { legalName: string; einLast4: string };
  loan: { amountCents: string; termMonths: number | null; purposes: string[] };
}

export type ServicingResult =
  | { accepted: true; externalId: string }
  | { accepted: false; retryable: boolean; error: string };

export interface ServicingAdapter {
  readonly name: string;
  board(pkg: BoardingPackage, signal: AbortSignal): Promise<ServicingResult>;
}
