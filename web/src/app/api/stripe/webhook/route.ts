import { NextResponse } from "next/server";
import Stripe from "stripe";
import { approveCloseFromPayment } from "@/lib/approveCloseFromPayment";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/** True if this event id was already processed (idempotent). */
async function recordWebhookEvent(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, id: string, type: string) {
  const { error } = await admin.from("stripe_webhook_events").insert({ id, type });
  if (!error) return true;
  if (String(error.message).toLowerCase().includes("duplicate") || error.code === "23505") return false;
  throw new Error(error.message);
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET missing" }, { status: 501 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 501 });
  }

  const raw = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "invalid signature";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    const first = await recordWebhookEvent(admin, event.id, event.type);
    if (!first) {
      return NextResponse.json({ received: true, duplicate: true });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "webhook log failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    const closeId = invoice.metadata?.crm_close_request_id?.trim();
    if (!closeId) {
      return NextResponse.json({ received: true, skipped: "no_crm_close_request_id" });
    }

    const paid = invoice.amount_paid;
    const overrideRaw = invoice.metadata?.crm_expected_amount_cents?.trim();
    const override = overrideRaw ? Number.parseInt(overrideRaw, 10) : undefined;

    const result = await approveCloseFromPayment(admin, closeId, {
      stripeInvoiceId: invoice.id,
      paymentSource: "stripe_invoice",
      amountPaidCents: paid,
      expectedAmountCentsOverride: Number.isFinite(override) ? override : undefined,
    });

    if (!result.ok) {
      console.error("[stripe webhook] invoice.paid approve failed", closeId, result.reason);
    }
    return NextResponse.json({ received: true, close: closeId, result: result.ok ? "ok" : result.reason });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const closeId = session.metadata?.crm_close_request_id?.trim();
    if (!closeId) {
      return NextResponse.json({ received: true, skipped: "no_crm_close_request_id" });
    }

    const paid = session.amount_total ?? 0;
    const overrideRaw = session.metadata?.crm_expected_amount_cents?.trim();
    const override = overrideRaw ? Number.parseInt(overrideRaw, 10) : undefined;

    const result = await approveCloseFromPayment(admin, closeId, {
      stripeCheckoutSessionId: session.id,
      paymentSource: "stripe_checkout",
      amountPaidCents: paid,
      expectedAmountCentsOverride: Number.isFinite(override) ? override : undefined,
    });

    if (!result.ok) {
      console.error("[stripe webhook] checkout.session.completed approve failed", closeId, result.reason);
    }
    return NextResponse.json({ received: true, close: closeId, result: result.ok ? "ok" : result.reason });
  }

  return NextResponse.json({ received: true });
}
