"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { isOwnerEmail } from "@/lib/ownerRoleGate";

type PrizeCard = {
  title: string;
  description: string;
  rewardText: string;
  bigDog?: boolean;
};

const PRIZE_VAULT: PrizeCard[] = [
  { title: "Cash: $75 (Starter)", description: "Starter cash boost for reps building momentum.", rewardText: "$75 (Starter) Cash Bonus" },
  { title: "Cash: $100 (Standard)", description: "Standard weekly cash reward for clean performance.", rewardText: "$100 (Standard) Cash Bonus" },
  { title: "Cash: $150 (Pro)", description: "Pro-tier bonus for higher quality locked appointments.", rewardText: "$150 (Pro) Cash Bonus" },
  { title: "Cash: $250 Stretch Goal", description: "Stretch-level reward for elite weekly output.", rewardText: "$250 Stretch Goal Bonus" },
  { title: "Cash: $300 Big Dog Stretch", description: "Big Dog target for dominant leaderboard results.", rewardText: "$300 Big Dog Stretch Goal", bigDog: true },
  { title: "Food: $120 Uber Eats", description: "Date Night at Home credit for the weekly winner.", rewardText: "$120 Uber Eats (Date Night at Home)" },
  { title: "Food: $150 Restaurant Choice", description: "Winner picks the restaurant and the tab is covered.", rewardText: "$150 Restaurant Choice" },
  { title: "Helpful: $100 Gas Card", description: "Fuel support reward for top performer.", rewardText: "$100 Gas Card" },
  { title: "Helpful: $150 Grocery Card", description: "Practical weekly win with grocery value.", rewardText: "$150 Grocery Card" },
  { title: "Helpful: Electric Bill Paid", description: "Up to $100 of electric bill covered.", rewardText: "$100 Electric Bill Paid Bonus" },
  { title: "Lifestyle: $100 Car Detail", description: "Clean ride reward for hard work.", rewardText: "$100 Car Detail" },
  { title: "Lifestyle: $150 ANC Headphones", description: "Focus upgrade with premium ANC headphones.", rewardText: "$150 ANC Headphones" },
  { title: "Lifestyle: Paid Friday Afternoon Off", description: "Half-day paid reward for the top closer.", rewardText: "Paid Friday Afternoon Off" },
  { title: "Games: Mystery Bonus", description: "Secret prize revealed on Friday.", rewardText: "Mystery Bonus (Reveal Friday)" },
  { title: "Games: Split Pot", description: "Top 3 teammates share $300.", rewardText: "Split Pot (Top 3 share $300)" },
  { title: "Big Dog: Cash + Spotlight", description: "Premium cash plus team spotlight.", rewardText: "BIG DOG BONUS - Cash + Spotlight", bigDog: true },
  { title: "Big Dog: VIP Weekend", description: "Heavyweight weekend package for #1.", rewardText: "BIG DOG BONUS - VIP Weekend Package", bigDog: true },
  {
    title: "Big Dog: President's Club credit",
    description: "Travel or experience credit toward an annual top-performer outing.",
    rewardText: "BIG DOG BONUS - President's Club Trip Credit",
    bigDog: true,
  },
];

export function RewardVaultPanel() {
  const [weeklyReward, setWeeklyReward] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [ownerChecked, setOwnerChecked] = useState(false);
  const [settingsSchema, setSettingsSchema] = useState<"key" | "setting_key" | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (isOwnerEmail(user?.email)) {
        setIsOwner(true);
        setOwnerChecked(true);
        return;
      }
      if (!user?.id) {
        setIsOwner(false);
        setOwnerChecked(true);
        return;
      }
      const { data, error: roleErr } = await (supabase as any)
        .from("team_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setIsOwner(!roleErr && data?.role === "owner");
      setOwnerChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const detectSettingsSchema = useCallback(async (): Promise<"key" | "setting_key" | null> => {
    const supabase = createSupabaseBrowserClient();
    const keyProbe = await (supabase as any).from("crm_settings").select("key, value").limit(1);
    if (!keyProbe.error) return "key";
    const altProbe = await (supabase as any).from("crm_settings").select("setting_key, setting_value").limit(1);
    if (!altProbe.error) return "setting_key";
    return null;
  }, []);

  const loadReward = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const schema = settingsSchema ?? (await detectSettingsSchema());
    if (!schema) return;
    setSettingsSchema(schema);
    if (schema === "key") {
      const byKey = await (supabase as any).from("crm_settings").select("key, value").eq("key", "weekly_reward").maybeSingle();
      if (!byKey.error && byKey.data) setWeeklyReward(String(byKey.data.value ?? ""));
      return;
    }
    const byAlt = await (supabase as any)
      .from("crm_settings")
      .select("setting_key, setting_value")
      .eq("setting_key", "weekly_reward")
      .maybeSingle();
    if (!byAlt.error && byAlt.data) setWeeklyReward(String(byAlt.data.setting_value ?? ""));
  }, [detectSettingsSchema, settingsSchema]);

  useEffect(() => {
    if (!isOwner) return;
    void loadReward();
  }, [isOwner, loadReward]);

  const saveWeeklyReward = useCallback(async (nextValueRaw: string): Promise<boolean> => {
    const supabase = createSupabaseBrowserClient();
    const nextValue = nextValueRaw.trim();
    const schema = settingsSchema ?? (await detectSettingsSchema());
    if (!schema) {
      setError("Could not detect crm_settings schema. Expected key/value or setting_key/setting_value.");
      return false;
    }
    setSettingsSchema(schema);

    if (schema === "key") {
      const check = await (supabase as any).from("crm_settings").select("key").eq("key", "weekly_reward").maybeSingle();
      if (check.error) {
        setError(check.error.message);
        return false;
      }
      const res = check.data
        ? await (supabase as any).from("crm_settings").update({ value: nextValue }).eq("key", "weekly_reward")
        : await (supabase as any).from("crm_settings").insert({ key: "weekly_reward", value: nextValue });
      if (res.error) {
        setError(res.error.message);
        return false;
      }
      return true;
    }

    const check = await (supabase as any)
      .from("crm_settings")
      .select("setting_key")
      .eq("setting_key", "weekly_reward")
      .maybeSingle();
    if (check.error) {
      setError(check.error.message);
      return false;
    }
    const res = check.data
      ? await (supabase as any).from("crm_settings").update({ setting_value: nextValue }).eq("setting_key", "weekly_reward")
      : await (supabase as any).from("crm_settings").insert({ setting_key: "weekly_reward", setting_value: nextValue });
    if (res.error) {
      setError(res.error.message);
      return false;
    }
    return true;
  }, [detectSettingsSchema, settingsSchema]);

  const onManualUpdate = useCallback(async () => {
    setBusy(true);
    setError(null);
    const ok = await saveWeeklyReward(weeklyReward);
    if (ok) setToast("Weekly reward updated.");
    setBusy(false);
  }, [saveWeeklyReward, weeklyReward]);

  const onQuickPostReward = useCallback(
    async (rewardText: string) => {
      setBusy(true);
      setError(null);
      const ok = await saveWeeklyReward(rewardText);
      if (ok) {
        setWeeklyReward(rewardText);
        setToast("New Prize is Live! The team has been notified.");
      }
      setBusy(false);
    },
    [saveWeeklyReward],
  );

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (!ownerChecked || !isOwner) return null;

  const bigDog = PRIZE_VAULT.filter((p) => p.bigDog);
  const catalog = PRIZE_VAULT.filter((p) => !p.bigDog);

  return (
    <section className="@container min-w-0 rounded-2xl border border-white/[0.08] bg-[#0a0a0a]/90 p-4 backdrop-blur-md @md:p-5">
      {error ? (
        <p className="mb-3 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-sm text-red-200">{error}</p>
      ) : null}
      {toast ? (
        <p className="mb-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-sm font-medium text-emerald-100">
          {toast}
        </p>
      ) : null}

      <div className="mb-6 rounded-xl border border-white/[0.06] bg-black/40 p-4 @md:p-5">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-violet-400/90">Weekly reward</p>
        <p className="mt-1 text-sm text-zinc-500">Shown on the live leaderboard for weekly performance.</p>
        <div className="mt-4 flex min-w-0 flex-col gap-3 @md:flex-row @md:items-stretch">
          <textarea
            value={weeklyReward}
            onChange={(e) => setWeeklyReward(e.target.value)}
            rows={3}
            className="min-h-[5.5rem] w-full min-w-0 resize-none rounded-xl border border-white/[0.1] bg-black/50 px-3 py-3 text-base leading-relaxed text-zinc-100 [overflow-wrap:anywhere] placeholder:text-zinc-600 focus:border-violet-500/40 focus:outline-none focus:ring-1 focus:ring-violet-500/30 @md:flex-1"
            placeholder="$500 + Dinner Bonus"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void onManualUpdate()}
            className="inline-flex min-h-[2.75rem] w-full shrink-0 items-center justify-center rounded-full border border-emerald-500/35 bg-emerald-500/15 px-6 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50 @md:w-auto @md:self-end"
          >
            {busy ? "Updating…" : "Save prize"}
          </button>
        </div>
      </div>

      <div className="border-b border-white/[0.06] pb-3">
        <h3 className="text-base font-semibold tracking-tight text-zinc-50 @md:text-lg">Prize vault</h3>
        <p className="mt-1 text-sm text-zinc-500">Tap a preset to push it live — list scrolls so the page stays short.</p>
      </div>

      <div className="mt-4 max-h-[min(480px,52dvh)] overflow-y-auto overscroll-contain rounded-xl border border-white/[0.06] bg-black/35 p-3 @md:max-h-[min(560px,56dvh)] @md:p-4">
        <div className="space-y-6">
          <div>
            <p className="sticky top-0 z-[1] -mx-1 mb-3 bg-black/80 px-1 py-1 font-mono text-xs uppercase tracking-[0.16em] text-amber-200/90 backdrop-blur-sm">
              Big Dog
            </p>
            <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
              {bigDog.map((card) => (
                <article
                  key={card.title}
                  className="flex flex-col rounded-xl border border-white/[0.08] bg-white/[0.04] p-4 transition hover:border-amber-400/30 hover:bg-white/[0.06]"
                >
                  <h4 className="text-[15px] font-semibold leading-snug text-zinc-50 @md:text-base">{card.title}</h4>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-500">{card.description}</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onQuickPostReward(card.rewardText)}
                    className="mt-4 inline-flex min-h-[2.75rem] w-full items-center justify-center rounded-full border border-emerald-500/35 bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50 @sm:w-auto @sm:self-start"
                  >
                    Use this
                  </button>
                </article>
              ))}
            </div>
          </div>

          <div className="border-t border-white/[0.06] pt-5">
            <p className="sticky top-0 z-[1] -mx-1 mb-3 bg-black/80 px-1 py-1 font-mono text-xs uppercase tracking-[0.16em] text-zinc-500 backdrop-blur-sm">
              Catalog
            </p>
            <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
              {catalog.map((card) => (
                <article
                  key={card.title}
                  className="flex flex-col rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 transition hover:bg-white/[0.05]"
                >
                  <h4 className="text-[15px] font-semibold leading-snug text-zinc-100 @md:text-base">{card.title}</h4>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-500">{card.description}</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onQuickPostReward(card.rewardText)}
                    className="mt-4 inline-flex min-h-[2.75rem] w-full items-center justify-center rounded-full border border-violet-500/35 bg-violet-500/10 px-4 py-2.5 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/18 disabled:cursor-not-allowed disabled:opacity-50 @sm:w-auto @sm:self-start"
                  >
                    Use this
                  </button>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

