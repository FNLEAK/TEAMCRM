import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import type { ServicePlan } from "@/components/ui/pricing";
import { isUserCrmAccessApproved } from "@/lib/crmAccessApproved";
import {
  isProbablyEmail,
  normalizePhoneForSms,
  packageEmailBody,
  packageEmailSubject,
  packageSmsBody,
} from "@/lib/packageShareMessage";

type BodyPlan = {
  name: string;
  info: string;
  priceLabel: string;
  bestFor?: string;
  features: { text: string; tooltip?: string }[];
};

type IncomingBody = {
  channel: "email" | "sms";
  to: string;
  plan: BodyPlan;
};

function toServicePlan(p: BodyPlan): ServicePlan {
  return {
    name: p.name,
    info: p.info,
    priceLabel: p.priceLabel,
    bestFor: p.bestFor,
    features: p.features.map((f) => ({ text: f.text, tooltip: f.tooltip })),
    btn: { text: "" },
  };
}

export type SendPackageCapabilities = {
  emailConfigured: boolean;
  smsConfigured: boolean;
};

function gmailAppCredentials(): { user: string; pass: string } | null {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "") ?? "";
  if (!user || !pass) return null;
  return { user, pass };
}

/** Whether server-side email/SMS are wired (no secrets exposed). Requires login. */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  if (!(await isUserCrmAccessApproved(supabase, user.id, user.email))) {
    return NextResponse.json(
      { error: "Owner approval required", code: "WAITING_APPROVAL" },
      { status: 403 },
    );
  }

  const caps: SendPackageCapabilities = {
    emailConfigured: !!gmailAppCredentials(),
    smsConfigured: !!(
      process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER
    ),
  };
  return NextResponse.json(caps);
}

/**
 * Server-side package delivery (no customer mail/SMS app required).
 *
 * Email: GMAIL_USER (full address) + GMAIL_APP_PASSWORD (Google App Password, 2FA).
 * SMS: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER (E.164).
 *
 * @see https://support.google.com/mail/answer/185833
 * @see https://www.twilio.com/docs/sms
 */
export async function POST(req: Request) {
  let json: IncomingBody;
  try {
    json = (await req.json()) as IncomingBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { channel, to, plan: rawPlan } = json;
  if (!channel || !to?.trim() || !rawPlan?.name) {
    return NextResponse.json({ error: "Missing channel, to, or plan" }, { status: 400 });
  }
  if (channel !== "email" && channel !== "sms") {
    return NextResponse.json({ error: "channel must be email or sms" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  if (!(await isUserCrmAccessApproved(supabase, user.id, user.email))) {
    return NextResponse.json(
      { error: "Owner approval required", code: "WAITING_APPROVAL" },
      { status: 403 },
    );
  }

  const plan = toServicePlan(rawPlan);
  const toTrim = to.trim();

  if (channel === "email") {
    if (!isProbablyEmail(toTrim)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }
    const creds = gmailAppCredentials();
    if (!creds) {
      return NextResponse.json(
        {
          error: "Email sending is not configured",
          hint: "Add GMAIL_USER and GMAIL_APP_PASSWORD to your environment (Google App Password with 2-Step Verification).",
        },
        { status: 503 },
      );
    }

    const subject = packageEmailSubject(plan);
    const text = packageEmailBody(plan);

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: creds,
    });

    try {
      const info = await transporter.sendMail({
        from: creds.user,
        to: toTrim,
        subject,
        text,
      });
      return NextResponse.json({
        ok: true,
        id: info.messageId ?? null,
        channel: "email",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "SMTP send failed";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  // SMS via Twilio
  const e164 = normalizePhoneForSms(toTrim);
  if (!e164) {
    return NextResponse.json({ error: "Invalid phone number (use 10 digits or +country code)" }, { status: 400 });
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const fromRaw = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!sid || !token || !fromRaw) {
    return NextResponse.json(
      {
        error: "SMS sending is not configured",
        hint: "Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER to your environment.",
      },
      { status: 503 },
    );
  }

  // Vercel/hosting sometimes drops a leading "+" from env values; Twilio requires E.164 (e.g. +18777804236).
  const fromE164 = normalizePhoneForSms(fromRaw);
  if (!fromE164) {
    return NextResponse.json(
      {
        error: "Invalid TWILIO_FROM_NUMBER",
        hint: "Use E.164 (e.g. +18777804236). If Vercel ate the +, try digits only: 18777804236 — the server will add +.",
      },
      { status: 503 },
    );
  }

  const bodyText = packageSmsBody(plan);
  const params = new URLSearchParams();
  params.set("To", e164);
  params.set("From", fromE164);
  params.set("Body", bodyText);

  const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const twilioData = (await twilioRes.json().catch(() => ({}))) as { message?: string; sid?: string; code?: number };
  if (!twilioRes.ok) {
    return NextResponse.json(
      { error: twilioData.message ?? "Twilio rejected the request", code: twilioData.code },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, id: twilioData.sid ?? null, channel: "sms" });
}
