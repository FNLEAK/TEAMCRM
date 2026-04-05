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

  return (
    <section className="@container min-w-0 rounded-xl border border-white/10 bg-[#070709] p-4 ring-1 ring-white/10 shadow-[0_0_42px_-24px_rgba(244,63,94,0.65)] @md:p-5">
      {error ? <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}
      {toast ? (
        <p className="mb-3 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-100">{toast}</p>
      ) : null}

      <section className="mb-5 rounded-xl border border-emerald-400/35 bg-[radial-gradient(95%_120%_at_0%_0%,rgba(16,185,129,0.14),rgba(5,5,8,0.96))] p-3 ring-1 ring-emerald-400/20 shadow-[0_0_36px_-16px_rgba(16,185,129,0.7)] @md:p-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">Rewards Command Deck</p>
        <div className="overflow-visible rounded-lg border border-emerald-400/25 bg-black/30 p-3 @md:p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300">Weekly reward</p>
          <p className="mt-1 text-xs text-zinc-300">Prize text shown for weekly performance.</p>
          <div className="mt-3 flex min-w-0 flex-col gap-3 @md:flex-row @md:items-start">
            <textarea
              value={weeklyReward}
              onChange={(e) => setWeeklyReward(e.target.value)}
              rows={3}
              className="min-h-[5.25rem] w-full min-w-0 max-w-full resize-none rounded-lg border border-emerald-300/35 bg-black/50 px-3 py-2.5 text-sm leading-relaxed text-zinc-100 [overflow-wrap:anywhere] placeholder:text-zinc-500 focus:border-emerald-400/55 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 @md:min-w-0 @md:flex-1"
              placeholder="$500 + Dinner Bonus"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void onManualUpdate()}
              className="inline-flex w-full shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-emerald-400/40 bg-emerald-500/[0.14] px-5 py-2.5 text-sm font-semibold text-emerald-50 transition-colors hover:border-emerald-300/55 hover:bg-emerald-500/22 disabled:cursor-not-allowed disabled:opacity-50 @md:w-auto @md:self-stretch @md:py-3"
            >
              {busy ? "Updating…" : "Update prize"}
            </button>
          </div>
        </div>
      </section>

      <section className="mb-1 rounded-xl border border-white/10 bg-[linear-gradient(160deg,rgba(16,16,18,0.95),rgba(8,8,10,0.92))] p-3 ring-1 ring-white/10 shadow-[0_0_28px_-18px_rgba(248,113,113,0.6)] @md:p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-white">Prize Inspiration Vault</h3>
          <p className="mt-1 text-xs text-zinc-400">Quick-post rewards to the live leaderboard prize without leaving this panel.</p>
        </div>

        <div className="mb-4 overflow-visible rounded-lg border border-amber-300/50 bg-amber-400/[0.09] p-3 pb-4 shadow-[0_0_28px_-10px_rgba(251,191,36,0.85)] @md:p-4 @md:pb-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-100">Big Dog Bonuses</p>
          <div className="mt-3 grid grid-cols-1 gap-3 @md:grid-cols-2">
            {PRIZE_VAULT.filter((p) => p.bigDog).map((card) => (
              <article
                key={card.title}
                className="flex flex-col rounded-lg border border-amber-300/60 bg-black/35 p-3 pb-3.5 ring-1 ring-amber-200/25 transition hover:border-amber-300/80 hover:bg-black/40"
              >
                <h4 className="break-words text-sm font-bold text-amber-100">{card.title}</h4>
                <p className="mt-1 flex-1 break-words text-xs leading-relaxed text-zinc-300">{card.description}</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onQuickPostReward(card.rewardText)}
                  className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-emerald-400/45 bg-emerald-500/[0.14] px-3 py-2 text-xs font-semibold text-emerald-50 transition-colors hover:border-emerald-300/55 hover:bg-emerald-500/22 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Use this
                </button>
              </article>
            ))}
          </div>
        </div>

        <div className="pr-1 @md:max-h-[min(360px,55dvh)] @md:overflow-y-auto @md:overscroll-contain">
          <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
            {PRIZE_VAULT.filter((p) => !p.bigDog).map((card) => (
              <article key={card.title} className="rounded-lg border border-rose-500/60 bg-black/30 p-3 ring-1 ring-rose-400/10 transition hover:scale-[1.01] hover:border-rose-400/80 hover:shadow-[0_0_20px_-10px_rgba(244,63,94,0.95)]">
                <h4 className="break-words text-sm font-semibold text-zinc-100">{card.title}</h4>
                <p className="mt-1 break-words text-xs leading-relaxed text-zinc-400">{card.description}</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onQuickPostReward(card.rewardText)}
                  className="mt-3 rounded-lg border border-emerald-300/70 bg-emerald-500/20 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-emerald-100 shadow-[0_0_20px_-6px_rgba(52,211,153,0.95)] hover:bg-emerald-500/30 disabled:opacity-60"
                >
                  Use This
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>
    </section>
  );
}

