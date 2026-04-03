import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import type { ServicePlan } from "@/components/ui/pricing";
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

/** Whether server-side email/SMS are wired (no secrets exposed). Requires login. */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const caps: SendPackageCapabilities = {
    emailConfigured: !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL),
    smsConfigured: !!(
      process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER
    ),
  };
  return NextResponse.json(caps);
}

/**
 * Server-side package delivery (no customer mail/SMS app required).
 *
 * Email: set RESEND_API_KEY and RESEND_FROM_EMAIL (verified domain in production).
 * SMS: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER (E.164).
 *
 * @see https://resend.com/docs/send-with-nextjs
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

  const plan = toServicePlan(rawPlan);
  const toTrim = to.trim();

  if (channel === "email") {
    if (!isProbablyEmail(toTrim)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }
    const key = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!key || !from) {
      return NextResponse.json(
        {
          error: "Email sending is not configured",
          hint: "Add RESEND_API_KEY and RESEND_FROM_EMAIL to your environment (see Resend dashboard).",
        },
        { status: 503 },
      );
    }

    const subject = packageEmailSubject(plan);
    const text = packageEmailBody(plan);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [toTrim],
        subject,
        text,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as { message?: string; id?: string };
    if (!res.ok) {
      return NextResponse.json(
        { error: data.message ?? "Resend rejected the request", details: data },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, id: data.id ?? null, channel: "email" });
  }

  // SMS via Twilio
  const e164 = normalizePhoneForSms(toTrim);
  if (!e164) {
    return NextResponse.json({ error: "Invalid phone number (use 10 digits or +country code)" }, { status: 400 });
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const fromNum = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !fromNum) {
    return NextResponse.json(
      {
        error: "SMS sending is not configured",
        hint: "Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER to your environment.",
      },
      { status: 503 },
    );
  }

  const bodyText = packageSmsBody(plan);
  const params = new URLSearchParams();
  params.set("To", e164);
  params.set("From", fromNum);
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
