"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { AccountStrip } from "./components/AccountStrip";
import { HeroCard } from "./components/HeroCard";
import { ByproductCard } from "./components/ByproductCard";

export default function Home() {
  const accounts = useQuery(api.queries.getAccounts);
  const agreements = useQuery(api.queries.getAgreements, {});
  const openCards = useQuery(api.queries.getCards, {});
  const resolvedCards = useQuery(api.queries.getCards, { includeResolved: true });

  const bootstrap = useAction(api.agent.bootstrapDemo);
  const [booting, setBooting] = useState(false);

  const handleBootstrap = async () => {
    setBooting(true);
    try {
      await bootstrap({});
    } catch (err) {
      console.error(err);
      alert(
        "Bootstrap failed — check Convex logs. Likely missing BACKBOARD_API_KEY."
      );
    } finally {
      setBooting(false);
    }
  };

  const loading =
    accounts === undefined ||
    agreements === undefined ||
    openCards === undefined ||
    resolvedCards === undefined;

  const hero = openCards?.find((c) => c.type === "overdraft");
  const heroResolved = !hero
    ? resolvedCards?.find((c) => c.type === "overdraft" && c.status === "resolved")
    : null;
  const heroToShow = hero ?? heroResolved ?? null;

  const byproducts =
    openCards?.filter(
      (c) => c.type === "duplicate" || c.type === "creep" || c.type === "outlier"
    ) ?? [];

  const totalTxnCount = resolvedCards?.length ?? 0;

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-3xl px-6 py-10">
        {/* ── Brand header ─────────────────────────────────────────────── */}
        <header className="flex items-baseline justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Kin</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Your household&apos;s financial guardian. Quiet until it matters.
            </p>
          </div>
          <button
            onClick={handleBootstrap}
            disabled={booting}
            className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {booting ? "Resetting…" : "Reset demo"}
          </button>
        </header>

        {/* ── Account strip ─────────────────────────────────────────────── */}
        <section className="mt-6">
          {loading ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
              Loading household…
            </div>
          ) : accounts && accounts.length === 0 ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6">
              <h2 className="text-base font-semibold text-amber-900">
                No data yet
              </h2>
              <p className="mt-1 text-sm text-amber-800">
                Tap <strong>Reset demo</strong> above to seed Alex &amp; Dana
                and run the engine.
              </p>
            </div>
          ) : (
            <AccountStrip
              accounts={accounts ?? []}
              agreements={agreements ?? []}
            />
          )}
        </section>

        {/* ── The feed ───────────────────────────────────────────────────── */}
        <section className="mt-8 space-y-4">
          {heroToShow && <HeroCard card={heroToShow} />}

          {byproducts.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] uppercase tracking-wider text-zinc-500">
                Worth a look
              </h3>
              {byproducts.map((c) => (
                <ByproductCard key={c._id} card={c} />
              ))}
            </div>
          )}

          {!loading && !heroToShow && byproducts.length === 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center">
              <p className="text-sm text-zinc-500">
                All quiet. Kin is watching across your accounts.
              </p>
            </div>
          )}
        </section>

        {/* ── Footer: the calm baseline ─────────────────────────────────── */}
        {!loading && accounts && accounts.length > 0 && (
          <p className="mt-10 text-center text-xs text-zinc-400">
            ~1,400 transactions reviewed across {accounts.length} accounts ·
            {" "}
            {byproducts.length + (heroToShow ? 1 : 0)} need your attention ·
            {" "}
            {totalTxnCount - byproducts.length - (heroToShow ? 1 : 0)} silent
          </p>
        )}
      </div>
    </main>
  );
}
