import type { SupabaseClient } from "@supabase/supabase-js";

export type ApproveCloseResult =
  | { ok: true; alreadyDone?: boolean }
  | { ok: false; reason: string };

const PENDING = "pending";
const APPROVED = "approved";

/** Compare Stripe amount_paid (cents) to CRM close amount (dollars). Allows ±1¢ float noise. */
export function closeAmountMatchesPaidCents(dealAmountDollars: unknown, paidCents: number): boolean {
  if (!Number.isFinite(paidCents) || paidCents < 0) return false;
  const dollars = Number(dealAmountDollars);
  if (!Number.isFinite(dollars) || dollars < 0) return false;
  const expected = Math.round(dollars * 100);
  return Math.abs(paidCents - expected) <= 1;
}

/**
 * Approves a pending close and marks the lead Closed Won — same outcome as CloseApprovalPanel approve.
 * When `amountPaidCents` is set, it must match `closed_deals.amount` (unless you use invoice metadata override in the webhook).
 */
export async function approveCloseFromPayment(
  admin: SupabaseClient,
  closeRequestId: string,
  opts?: {
    stripeInvoiceId?: string | null;
    stripeCheckoutSessionId?: string | null;
    paymentSource?: string;
    /** If set, must match row.amount (dollars) within 1¢. */
    amountPaidCents?: number;
    /** If set, must match this many cents exactly (from Stripe metadata override). */
    expectedAmountCentsOverride?: number;
  },
): Promise<ApproveCloseResult> {
  const { data: row, error: selErr } = await admin
    .from("closed_deals")
    .select("id, lead_id, amount, approval_status, stripe_invoice_id, stripe_checkout_session_id")
    .eq("id", closeRequestId)
    .maybeSingle();

  if (selErr) return { ok: false, reason: selErr.message };
  if (!row) return { ok: false, reason: "close_request_not_found" };

  const r = row as {
    approval_status?: string;
    lead_id: string;
    amount: unknown;
    stripe_invoice_id?: string | null;
    stripe_checkout_session_id?: string | null;
  };

  const status = String(r.approval_status ?? "");
  if (status === APPROVED) return { ok: true, alreadyDone: true };
  if (status !== PENDING) return { ok: false, reason: `unexpected_status:${status}` };

  if (opts?.amountPaidCents != null) {
    const override = opts.expectedAmountCentsOverride;
    const ok = override != null
      ? Math.abs(opts.amountPaidCents - override) <= 1
      : closeAmountMatchesPaidCents(r.amount, opts.amountPaidCents);
    if (!ok) return { ok: false, reason: "amount_mismatch" };
  }

  const inv = opts?.stripeInvoiceId;
  if (inv) {
    const existing = r.stripe_invoice_id;
    if (existing && existing !== inv) return { ok: false, reason: "stripe_invoice_mismatch" };
  }

  const sess = opts?.stripeCheckoutSessionId;
  if (sess) {
    const existing = r.stripe_checkout_session_id;
    if (existing && existing !== sess) return { ok: false, reason: "stripe_session_mismatch" };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    approval_status: APPROVED,
    approved_at: now,
    approved_by: null,
  };
  if (inv) patch.stripe_invoice_id = inv;
  if (sess) patch.stripe_checkout_session_id = sess;
  if (opts?.paymentSource) patch.payment_source = opts.paymentSource;

  const { error: updErr } = await admin.from("closed_deals").update(patch).eq("id", closeRequestId).eq("approval_status", PENDING);

  if (updErr) return { ok: false, reason: updErr.message };

  const { error: leadErr } = await admin.from("leads").update({ status: "Closed Won" }).eq("id", r.lead_id);

  if (leadErr) return { ok: false, reason: `lead_update_failed:${leadErr.message}` };

  return { ok: true };
}
