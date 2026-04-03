"use client";

import * as React from "react";
import { CheckCircleIcon, StarIcon } from "lucide-react";

import { useDeskLayout } from "@/components/DeskLayoutContext";
import { PackageAutoSendModal } from "@/components/PackageAutoSendModal";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type BillingMode = "oneTime" | "monthly";

export interface PlanFeature {
  text: string;
  tooltip?: string;
}

export interface ServicePlan {
  name: string;
  info: string;
  /** e.g. "$500 – $800" or "$100 – $125/mo" */
  priceLabel: string;
  /** Short subtitle under price */
  bestFor?: string;
  features: PlanFeature[];
  btn: { text: string };
  highlighted?: boolean;
}

interface PricingSectionProps extends React.ComponentProps<"div"> {
  oneTimePlans: ServicePlan[];
  monthlyPlans: ServicePlan[];
  heading: string;
  description?: string;
}

export function PricingSection({
  oneTimePlans,
  monthlyPlans,
  heading,
  description,
  className,
  ...props
}: PricingSectionProps) {
  const { isMobileShell: layoutMobileShell } = useDeskLayout();
  const [mode, setMode] = React.useState<BillingMode>("oneTime");
  const [sendPlan, setSendPlan] = React.useState<ServicePlan | null>(null);
  const plans = mode === "oneTime" ? oneTimePlans : monthlyPlans;

  return (
    <div className={cn("@container flex w-full flex-col items-center justify-center space-y-6 p-4", className)} {...props}>
      <PackageAutoSendModal plan={sendPlan} open={sendPlan !== null} onClose={() => setSendPlan(null)} />
      <div className="mx-auto max-w-2xl space-y-2 text-center">
        <h2
          className={cn(
            "text-xl font-bold tracking-tight text-white drop-shadow-[0_0_24px_rgba(167,139,250,0.35)]",
            layoutMobileShell ? "@md:text-2xl @lg:text-3xl @xl:text-4xl" : "md:text-2xl lg:text-3xl xl:text-4xl",
          )}
        >
          {heading}
        </h2>
        {description ? (
          <p
            className={cn(
              "text-sm text-slate-400",
              layoutMobileShell ? "@md:text-base" : "md:text-base",
            )}
          >
            {description}
          </p>
        ) : null}
      </div>

      <BillingModeToggle mode={mode} setMode={setMode} />

      <p className="max-w-xl text-center text-xs text-slate-400/90">
        Tip: Pair a one-time build with an optional monthly care plan for hosting, updates, and analytics.
      </p>

      <div
        className={cn(
          "mx-auto grid w-full max-w-6xl grid-cols-1 gap-4",
          layoutMobileShell
            ? plans.length >= 3
              ? "@lg:grid-cols-3"
              : "@lg:grid-cols-2"
            : plans.length >= 3
              ? "lg:grid-cols-3"
              : "lg:grid-cols-2",
        )}
      >
        {plans.map((plan) => (
          <PricingCard key={plan.name} plan={plan} onOpenSend={() => setSendPlan(plan)} />
        ))}
      </div>
    </div>
  );
}

type BillingModeToggleProps = {
  mode: BillingMode;
  setMode: React.Dispatch<React.SetStateAction<BillingMode>>;
  className?: string;
};

export function BillingModeToggle({ mode, setMode, className }: BillingModeToggleProps) {
  return (
    <div
      className={cn(
        "mx-auto flex w-fit rounded-full border border-cyan-300/20 bg-gradient-to-r from-cyan-500/[0.08] via-black/50 to-violet-500/[0.08] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_22px_-14px_rgba(34,211,238,0.7)]",
        className,
      )}
      role="tablist"
      aria-label="Billing type"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "oneTime"}
        onClick={() => setMode("oneTime")}
        className={cn(
          "relative rounded-full px-5 py-2 text-sm font-semibold transition-colors",
          mode === "oneTime"
            ? "bg-gradient-to-r from-emerald-500/90 to-cyan-500/80 text-white shadow-[0_0_24px_-6px_rgba(52,211,153,0.75)]"
            : "text-slate-400 hover:text-slate-100",
        )}
      >
        One-time project
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "monthly"}
        onClick={() => setMode("monthly")}
        className={cn(
          "relative rounded-full px-5 py-2 text-sm font-semibold transition-colors",
          mode === "monthly"
            ? "bg-gradient-to-r from-violet-500/90 to-cyan-500/80 text-white shadow-[0_0_24px_-6px_rgba(167,139,250,0.75)]"
            : "text-slate-400 hover:text-slate-100",
        )}
      >
        Monthly plans
      </button>
    </div>
  );
}

type PricingCardProps = {
  plan: ServicePlan;
  onOpenSend: () => void;
  className?: string;
};

export function PricingCard({ plan, onOpenSend, className, ...props }: PricingCardProps) {
  const { isMobileShell: layoutMobileShell } = useDeskLayout();
  const [isHovering, setIsHovering] = React.useState(false);
  const [tilt, setTilt] = React.useState({ x: 0, y: 0 });
  const [glowPos, setGlowPos] = React.useState({ x: 50, y: 50 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;

    const rotateY = (px - 0.5) * 9;
    const rotateX = (0.5 - py) * 9;

    setTilt({ x: rotateX, y: rotateY });
    setGlowPos({ x: px * 100, y: py * 100 });
  };

  const handleMouseEnter = () => setIsHovering(true);
  const handleMouseLeave = () => {
    setIsHovering(false);
    setTilt({ x: 0, y: 0 });
    setGlowPos({ x: 50, y: 50 });
  };

  return (
    <div
      className={cn(
        "group relative flex w-full flex-col overflow-hidden rounded-xl border border-cyan-300/15 bg-gradient-to-b from-cyan-500/[0.04] via-[#0b0c0f]/92 to-[#0b0c0f]/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_28px_-20px_rgba(34,211,238,0.55)] transition hover:-translate-y-0.5 hover:border-cyan-300/35 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_34px_-24px_rgba(34,211,238,0.65)]",
        plan.highlighted && "border-emerald-400/45 ring-1 ring-emerald-400/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_34px_-18px_rgba(16,185,129,0.75)]",
        className,
      )}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateY(${isHovering ? -3 : 0}px)`,
        transition: isHovering ? "transform 90ms linear, box-shadow 220ms ease" : "transform 300ms ease, box-shadow 260ms ease",
      }}
      {...props}
    >
      <div
        aria-hidden
        className={cn("pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-200", isHovering && "opacity-100")}
        style={{
          background: `radial-gradient(240px circle at ${glowPos.x}% ${glowPos.y}%, rgba(255,255,255,0.18), rgba(34,211,238,0.1) 35%, transparent 70%)`,
        }}
      />
      {plan.highlighted ? (
        <div
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-55"
          style={{
            background:
              "linear-gradient(135deg, rgba(52,211,153,0.2) 0%, transparent 45%, rgba(34,211,238,0.16) 100%)",
          }}
        />
      ) : null}

      <div
        className={cn(
          "relative rounded-t-xl border-b border-white/[0.06] p-4",
          plan.highlighted ? "bg-gradient-to-r from-emerald-500/[0.14] to-cyan-500/[0.08]" : "bg-gradient-to-r from-cyan-500/[0.08] to-violet-500/[0.08]",
        )}
      >
        <div className="absolute right-2 top-2 z-10 flex flex-wrap items-center justify-end gap-2">
          {plan.highlighted ? (
            <p className="flex items-center gap-1 rounded-md border border-amber-300/40 bg-black/45 px-2 py-0.5 text-xs font-semibold text-amber-100 shadow-[0_0_14px_-8px_rgba(251,191,36,0.8)]">
              <StarIcon className="h-3 w-3 fill-current text-amber-400" />
              Popular
            </p>
          ) : null}
        </div>

        <div className="text-lg font-semibold text-white">{plan.name}</div>
        <p className="text-sm text-slate-300">{plan.info}</p>
        {plan.bestFor ? <p className="mt-2 text-xs leading-snug text-slate-500">{plan.bestFor}</p> : null}
        <h3 className="mt-3 flex flex-wrap items-baseline gap-1">
          <span
            className={cn(
              "text-2xl font-bold tracking-tight text-emerald-200 drop-shadow-[0_0_18px_rgba(52,211,153,0.35)]",
              layoutMobileShell ? "@lg:text-3xl" : "lg:text-3xl",
            )}
          >
            {plan.priceLabel}
          </span>
        </h3>
      </div>

      <TooltipProvider delayDuration={200}>
        <div className={cn("relative space-y-3 px-4 py-5 text-sm text-slate-200", plan.highlighted && "bg-black/15")}>
          {plan.features.map((feature, index) => (
            <div key={index} className="flex items-start gap-2">
              <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400/95" />
              {feature.tooltip ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="cursor-help border-b border-dashed border-slate-500 leading-snug">{feature.text}</p>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{feature.tooltip}</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <p className="leading-snug">{feature.text}</p>
              )}
            </div>
          ))}
        </div>
      </TooltipProvider>

      <div className={cn("relative mt-auto w-full border-t border-white/[0.06] p-3", plan.highlighted && "bg-emerald-950/20")}>
        <Button
          type="button"
          className="w-full font-semibold"
          variant={plan.highlighted ? "default" : "outline"}
          onClick={onOpenSend}
        >
          {plan.btn.text}
        </Button>
      </div>
    </div>
  );
}
