import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { WEBSITE_BOOKED_LEAD_STATUS } from "@/lib/webFriendlyBooking";

export const runtime = "nodejs";

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
  const status = typeof b.status === "string" ? b.status.trim() : "";
  const createdAt = typeof b.createdAt === "string" ? b.createdAt.trim() : "";
  const updatedAt = typeof b.updatedAt === "string" ? b.updatedAt.trim() : "";

  const notesLines = [
    "[Web-friendly · studio_booking.created]",
    email ? `Email: ${email}` : null,
    topic ? `Topic: ${topic}` : null,
    message ? `Message: ${message}` : null,
    preferredAt ? `Preferred: ${preferredAt}` : null,
    status ? `Booking status: ${status}` : null,
    createdAt ? `Created (source): ${createdAt}` : null,
    updatedAt ? `Updated (source): ${updatedAt}` : null,
  ].filter(Boolean) as string[];

  const notes = notesLines.join("\n").slice(0, 8000);

  let apptDate: string | null = null;
  if (preferredAt) {
    const d = new Date(preferredAt);
    if (!Number.isNaN(d.getTime())) {
      apptDate = d.toISOString().slice(0, 10);
    } else if (/^\d{4}-\d{2}-\d{2}/.test(preferredAt)) {
      apptDate = preferredAt.slice(0, 10);
    }
  }

  const row = {
    source_booking_id: externalId,
    company_name: name,
    phone: phone && phone.length > 0 ? phone : null,
    website: null as string | null,
    status: WEBSITE_BOOKED_LEAD_STATUS,
    notes: notes.length > 0 ? notes : null,
    import_filename: "web-friendly",
    appt_date: apptDate,
  };

  const { error } = await admin.from("leads").upsert(row, { onConflict: "source_booking_id" });

  if (error) {
    console.error("[webhooks/booked-call] upsert failed", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, source_booking_id: externalId }, { status: 200 });
}
