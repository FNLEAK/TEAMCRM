import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { webhookLeadStatus } from "@/lib/webFriendlyBooking";

export const runtime = "nodejs";

/**
 * Writes use `getSupabaseAdmin()` → `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS). Do not use the anon key here.
 * If upsert fails, check Vercel → Deployment → Functions / Logs for the full PostgREST line (message, code, hint).
 */
function logSupabaseError(scope: string, err: { message: string; details?: string; hint?: string; code?: string }) {
  console.error(
    `[webhooks/booked-call] ${scope}`,
    JSON.stringify({
      message: err.message,
      details: err.details ?? null,
      hint: err.hint ?? null,
      code: err.code ?? null,
    }),
  );
}

/** POST only — friend’s app sends `studio_booking.created` here. */
export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export async function PUT() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export async function PATCH() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export async function POST(request: Request) {
  const secret = process.env.WEB_FRIENDLY_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "WEB_FRIENDLY_WEBHOOK_SECRET not configured" }, { status: 501 });
  }

  const auth = request.headers.get("authorization")?.trim();
  const token = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 501 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected JSON object" }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  if (o.source !== "web-friendly" || o.event !== "studio_booking.created") {
    return NextResponse.json({ error: "Unsupported event" }, { status: 400 });
  }

  const booking = o.booking;
  if (!booking || typeof booking !== "object") {
    return NextResponse.json({ error: "Missing booking" }, { status: 400 });
  }

  const b = booking as Record<string, unknown>;
  const externalId = typeof b.id === "string" && b.id.trim() ? b.id.trim() : null;
  if (!externalId) {
    return NextResponse.json({ error: "booking.id required" }, { status: 400 });
  }

  const name = typeof b.name === "string" && b.name.trim() ? b.name.trim() : "Website booking";
  const email = typeof b.email === "string" ? b.email.trim() : "";
  const phone = typeof b.phone === "string" ? b.phone.trim() : null;
  const topic = typeof b.topic === "string" ? b.topic.trim() : "";
  const message = typeof b.message === "string" ? b.message.trim() : "";
  const preferredAt = typeof b.preferredAt === "string" ? b.preferredAt.trim() : "";
  /** Partner app’s booking state — text only; never copied to `leads.status` (would break `leads_status_check`). */
  const sourceAppBookingStatus = typeof b.status === "string" ? b.status.trim() : "";
  const createdAt = typeof b.createdAt === "string" ? b.createdAt.trim() : "";
  const updatedAt = typeof b.updatedAt === "string" ? b.updatedAt.trim() : "";

  const notesLines = [
    "[Web-friendly · studio_booking.created]",
    email ? `Email: ${email}` : null,
    topic ? `Topic: ${topic}` : null,
    message ? `Message: ${message}` : null,
    preferredAt ? `Preferred (visitor text, not validated): ${preferredAt}` : null,
    sourceAppBookingStatus ? `Source app booking.status: ${sourceAppBookingStatus}` : null,
    createdAt ? `Created (source): ${createdAt}` : null,
    updatedAt ? `Updated (source): ${updatedAt}` : null,
  ].filter(Boolean) as string[];

  const notes = notesLines.join("\n").slice(0, 8000);

  const leadStatus = webhookLeadStatus();

  const row = {
    source_booking_id: externalId,
    company_name: name,
    phone: phone && phone.length > 0 ? phone : null,
    website: null as string | null,
    status: leadStatus,
    notes: notes.length > 0 ? notes : null,
    import_filename: "web-friendly",
  };

  const { error } = await admin.from("leads").upsert(row, { onConflict: "source_booking_id" });

  if (error) {
    logSupabaseError("upsert failed (see message/code/hint in logs)", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, source_booking_id: externalId }, { status: 200 });
}
