import type { ServicePlan } from "@/components/ui/pricing";

const BRAND = "Web Friendly CRM";

export function packageEmailSubject(plan: ServicePlan): string {
  return `${plan.name} — ${plan.priceLabel} (${BRAND})`;
}

/** Full detail for email / copy. */
export function packageEmailBody(plan: ServicePlan): string {
  const lines: string[] = [
    `Hi — here's a quick summary of the ${plan.name} (${plan.priceLabel}).`,
    "",
    plan.info,
  ];
  if (plan.bestFor) lines.push("", plan.bestFor);
  lines.push("", "Includes:", ...plan.features.map((f) => `• ${f.text}`), "", `— ${BRAND}`);
  return lines.join("\n");
}

/** Shorter text for SMS (character limits). */
export function packageSmsBody(plan: ServicePlan): string {
  const top = plan.features.slice(0, 4).map((f) => `• ${f.text}`).join("\n");
  return [
    `${plan.name} ${plan.priceLabel}`,
    plan.info,
    "",
    top,
    plan.features.length > 4 ? `+ ${plan.features.length - 4} more…` : "",
    "",
    `Details: ask your rep or reply by email.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Normalize to E.164-style for sms: links (+1 for 10-digit US). */
export function normalizePhoneForSms(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const digits = t.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (t.startsWith("+") && digits.length >= 10) return `+${digits}`;
  return null;
}

export function isProbablyEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/** JSON-safe plan for POST /api/send-package (no btn / highlighted). */
export function planToApiPayload(plan: ServicePlan): {
  name: string;
  info: string;
  priceLabel: string;
  bestFor?: string;
  features: { text: string; tooltip?: string }[];
} {
  return {
    name: plan.name,
    info: plan.info,
    priceLabel: plan.priceLabel,
    ...(plan.bestFor ? { bestFor: plan.bestFor } : {}),
    features: plan.features.map((f) => ({
      text: f.text,
      ...(f.tooltip ? { tooltip: f.tooltip } : {}),
    })),
  };
}
