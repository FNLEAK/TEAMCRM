"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Copy, Loader2, Mail, MessageSquare, Send, X } from "lucide-react";

import type { ServicePlan } from "@/components/ui/pricing";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  isProbablyEmail,
  normalizePhoneForSms,
  packageEmailBody,
  packageEmailSubject,
  packageSmsBody,
  planToApiPayload,
} from "@/lib/packageShareMessage";

type Props = {
  plan: ServicePlan | null;
  open: boolean;
  onClose: () => void;
};

export function PackageAutoSendModal({ plan, open, onClose }: Props) {
  const [mounted, setMounted] = React.useState(false);
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [copied, setCopied] = React.useState<"email" | "sms" | null>(null);
  const [sending, setSending] = React.useState<null | "email" | "sms">(null);
  const [apiError, setApiError] = React.useState<string | null>(null);
  const [apiOk, setApiOk] = React.useState<string | null>(null);
  const [caps, setCaps] = React.useState<{ emailConfigured: boolean; smsConfigured: boolean } | null>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) {
      setPhone("");
      setEmail("");
      setCopied(null);
      setSending(null);
      setApiError(null);
      setApiOk(null);
      setCaps(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/send-package", { credentials: "same-origin" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { emailConfigured?: boolean; smsConfigured?: boolean };
        if (cancelled) return;
        setCaps({
          emailConfigured: data.emailConfigured === true,
          smsConfigured: data.smsConfigured === true,
        });
      } catch {
        if (!cancelled) setCaps({ emailConfigured: false, smsConfigured: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);

  const smsHref = React.useMemo(() => {
    if (!plan) return null;
    const to = normalizePhoneForSms(phone);
    if (!to) return null;
    const body = packageSmsBody(plan);
    return `sms:${to}?body=${encodeURIComponent(body)}`;
  }, [plan, phone]);

  const mailtoHref = React.useMemo(() => {
    if (!plan || !isProbablyEmail(email)) return null;
    const subject = packageEmailSubject(plan);
    const body = packageEmailBody(plan);
    return `mailto:${email.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [plan, email]);

  const copyFull = async () => {
    if (!plan) return;
    await navigator.clipboard.writeText(packageEmailBody(plan));
    setCopied("email");
    setTimeout(() => setCopied(null), 2000);
  };

  const copySms = async () => {
    if (!plan) return;
    await navigator.clipboard.writeText(packageSmsBody(plan));
    setCopied("sms");
    setTimeout(() => setCopied(null), 2000);
  };

  const sendFromCrm = async (channel: "email" | "sms") => {
    if (!plan) return;
    setApiError(null);
    setApiOk(null);
    const to = channel === "email" ? email.trim() : phone.trim();
    if (channel === "email" && !isProbablyEmail(to)) {
      setApiError("Enter a valid customer email first.");
      return;
    }
    if (channel === "sms" && !normalizePhoneForSms(to)) {
      setApiError("Enter a valid phone number first (10 digits or +1…).");
      return;
    }
    setSending(channel);
    try {
      const res = await fetch("/api/send-package", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          to,
          plan: planToApiPayload(plan),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; hint?: string };
      if (!res.ok) {
        setApiError([data.error, data.hint].filter(Boolean).join(" "));
        return;
      }
      setApiOk(channel === "email" ? "Email sent from the app." : "SMS sent from the app.");
    } catch {
      setApiError("Network error — try again.");
    } finally {
      setSending(null);
    }
  };

  if (!open || !plan || !mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-labelledby="package-send-title"
        className={cn(
          "relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/[0.1] bg-[#0c0e12] p-5 shadow-2xl",
        )}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/10 hover:text-white"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 id="package-send-title" className="pr-10 text-lg font-semibold text-white">
          Send package to customer
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Enter the customer&apos;s phone or email. You can <strong className="text-slate-300">send from this CRM</strong>{" "}
          (server-side — no mail/SMS app needed on your machine if configured), or use your device&apos;s apps below.
        </p>

        <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-950/20 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400/90">{plan.name}</p>
          <p className="mt-0.5 text-sm font-medium text-emerald-200">{plan.priceLabel}</p>
        </div>

        <label className="mt-4 block">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Customer phone (SMS)</span>
          <input
            type="tel"
            autoComplete="tel"
            placeholder="e.g. 5025551234"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </label>

        <label className="mt-3 block">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Customer email</span>
          <input
            type="email"
            autoComplete="email"
            placeholder="name@business.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </label>

        <div className="mt-5 rounded-xl border border-emerald-500/25 bg-emerald-950/15 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/90">Send from CRM (website)</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Uses Resend (email) or Twilio (SMS) on the server. Add keys in Vercel/hosting env. Only message contacts who
            agreed to receive them.
          </p>
          {caps && (!caps.emailConfigured || !caps.smsConfigured) ? (
            <ul className="mt-2 space-y-1 text-[11px] text-amber-200/90">
              {!caps.emailConfigured ? (
                <li>
                  Email (CRM): add <span className="font-mono text-amber-100/95">RESEND_API_KEY</span> +{" "}
                  <span className="font-mono text-amber-100/95">RESEND_FROM_EMAIL</span>
                </li>
              ) : null}
              {!caps.smsConfigured ? (
                <li>
                  SMS (CRM): add <span className="font-mono text-amber-100/95">TWILIO_ACCOUNT_SID</span>,{" "}
                  <span className="font-mono text-amber-100/95">TWILIO_AUTH_TOKEN</span>,{" "}
                  <span className="font-mono text-amber-100/95">TWILIO_FROM_NUMBER</span>
                </li>
              ) : null}
            </ul>
          ) : null}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="default"
              className="flex-1 gap-2 bg-emerald-800/90 hover:bg-emerald-700/90"
              title={
                caps === null
                  ? "Loading…"
                  : !caps.emailConfigured
                    ? "Configure Resend env vars to enable"
                    : !isProbablyEmail(email)
                      ? "Enter customer email above"
                      : undefined
              }
              disabled={
                sending !== null ||
                caps === null ||
                !caps.emailConfigured ||
                !isProbablyEmail(email)
              }
              onClick={() => void sendFromCrm("email")}
            >
              {sending === "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send email (CRM)
            </Button>
            <Button
              type="button"
              variant="default"
              className="flex-1 gap-2 bg-emerald-500 text-white hover:bg-emerald-400"
              title={
                caps === null
                  ? "Loading…"
                  : !caps.smsConfigured
                    ? "Configure Twilio env vars to enable"
                    : !normalizePhoneForSms(phone)
                      ? "Enter customer phone above"
                      : undefined
              }
              disabled={
                sending !== null || caps === null || !caps.smsConfigured || !normalizePhoneForSms(phone)
              }
              onClick={() => void sendFromCrm("sms")}
            >
              {sending === "sms" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send SMS (CRM)
            </Button>
          </div>
          {apiError ? (
            <p className="mt-2 text-xs leading-snug text-rose-300">{apiError}</p>
          ) : null}
          {apiOk ? <p className="mt-2 text-xs text-emerald-300">{apiOk}</p> : null}
        </div>

        <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Or use your device</p>

        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="flex-1 gap-2"
            disabled={!smsHref}
            onClick={() => smsHref && (window.location.href = smsHref)}
          >
            <MessageSquare className="h-4 w-4" />
            Open in SMS
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1 gap-2"
            disabled={!mailtoHref}
            onClick={() => mailtoHref && (window.location.href = mailtoHref)}
          >
            <Mail className="h-4 w-4" />
            Open in email
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void copyFull()}>
            <Copy className="h-3.5 w-3.5" />
            {copied === "email" ? "Copied full message" : "Copy full message"}
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void copySms()}>
            <Copy className="h-3.5 w-3.5" />
            {copied === "sms" ? "Copied SMS text" : "Copy SMS text"}
          </Button>
        </div>

        <p className="mt-4 text-[11px] leading-snug text-zinc-500">
          Device options open your local SMS or mail app. CRM sending works from any browser once Resend/Twilio env vars
          are set. US numbers: 10 digits or +1…
        </p>
      </div>
    </div>,
    document.body,
  );
}
