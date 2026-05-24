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
  const attentionCount = byproducts.length + (heroToShow ? 1 : 0);
  const silentCount = Math.max(
    1400 - attentionCount,
    totalTxnCount - attentionCount,
  );

  return (
    <main className="relative min-h-screen">
      <div className="mx-auto w-full max-w-3xl px-6 pt-10 pb-20 sm:pt-14">
        {/* ── Brand header ─────────────────────────────────────────────
            Editorial wordmark with the watchful "ember" eye. */}
        <header className="kin-rise flex items-start justify-between gap-6">
          <div className="flex items-center gap-3.5">
            <span className="kin-eye" aria-hidden="true" />
            <div className="leading-none">
              <h1
                className="text-[44px] sm:text-[56px] leading-none tracking-tight text-kin-bone"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                <span className="italic">Kin</span>
              </h1>
              <p className="mt-2 max-w-md text-sm text-kin-bone-mute text-pretty">
                Your household&rsquo;s financial guardian.{" "}
                <span className="text-kin-bone">Quiet</span> until it matters.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleBootstrap}
            disabled={booting}
            className="kin-btn-pill"
            aria-label="Reset demo to seed data"
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full bg-kin-amber"
              aria-hidden="true"
            />
            {booting ? "Resetting…" : "Reset demo"}
          </button>
        </header>

        {/* ── Status bar ────────────────────────────────────────────────
            Quiet, watchful. Three labels separated by dots. */}
        <div
          className="kin-rise mt-9 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] uppercase tracking-[0.18em] text-kin-bone-soft"
          style={{ animationDelay: "60ms" }}
        >
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full bg-kin-good kin-pulse"
              aria-hidden="true"
            />
            Watching
          </span>
          <span aria-hidden="true" className="text-kin-bone-dim">
            ·
          </span>
          <span>4 sources</span>
          <span aria-hidden="true" className="text-kin-bone-dim">
            ·
          </span>
          <span className="tabular-nums" style={{ fontFeatureSettings: '"tnum"' }}>
            {silentCount.toLocaleString("en-CA")} silent
          </span>
          <span aria-hidden="true" className="text-kin-bone-dim">
            ·
          </span>
          <span
            className={
              attentionCount > 0
                ? "text-kin-ember-soft"
                : "text-kin-bone-soft"
            }
          >
            {attentionCount} {attentionCount === 1 ? "ping" : "pings"}
          </span>
        </div>

        <div className="kin-hr mt-5" aria-hidden="true" />

        {/* ── Account strip ─────────────────────────────────────────────
            Cross-source balances. The "sight across silos" made tangible. */}
        <section
          className="kin-rise mt-7"
          style={{ animationDelay: "120ms" }}
          aria-label="Household accounts"
        >
          {loading ? (
            <div className="kin-card p-6 text-sm text-kin-bone-mute">
              Loading household…
            </div>
          ) : accounts && accounts.length === 0 ? (
            <div
              className="kin-card p-6"
              style={{
                borderColor: "rgba(249, 168, 37, 0.35)",
                background:
                  "linear-gradient(180deg, rgba(249, 168, 37, 0.06) 0%, rgba(249, 168, 37, 0) 100%), var(--kin-surface)",
              }}
            >
              <h2
                className="text-xl text-kin-bone"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                No data yet
              </h2>
              <p className="mt-1 text-sm text-kin-bone-mute">
                Tap{" "}
                <span className="text-kin-amber-soft">Reset demo</span> above
                to seed Alex &amp; Dana and run the engine.
              </p>
            </div>
          ) : (
            <AccountStrip
              accounts={accounts ?? []}
              agreements={agreements ?? []}
            />
          )}
        </section>

        {/* ── The feed ────────────────────────────────────────────────── */}
        <section
          className="kin-rise mt-10 space-y-5"
          style={{ animationDelay: "180ms" }}
          aria-label="Kin feed"
        >
          {/* Section eyebrow */}
          <div className="flex items-baseline justify-between">
            <h2 className="text-[11px] uppercase tracking-[0.22em] text-kin-bone-soft">
              The Feed
            </h2>
            {heroToShow && (
              <span className="text-[11px] uppercase tracking-[0.18em] text-kin-ember-soft">
                Action required
              </span>
            )}
          </div>

          {heroToShow && <HeroCard card={heroToShow} />}

          {byproducts.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] uppercase tracking-[0.22em] text-kin-bone-soft pl-1">
                Worth a look
              </h3>
              <div className="kin-card overflow-hidden">
                {byproducts.map((c, i) => (
                  <div
                    key={c._id}
                    className={
                      i > 0
                        ? "border-t border-[var(--kin-line)]"
                        : undefined
                    }
                  >
                    <ByproductCard card={c} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && !heroToShow && byproducts.length === 0 && (
            <div className="kin-card grid place-items-center px-6 py-14 text-center">
              <span
                className="kin-eye mb-4"
                style={{ width: 18, height: 18 }}
                aria-hidden="true"
              />
              <p
                className="text-2xl text-kin-bone"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                <span className="italic">All quiet.</span>
              </p>
              <p className="mt-1 text-sm text-kin-bone-mute">
                Kin is watching across your accounts.
              </p>
            </div>
          )}
        </section>

        {/* ── Footer: the calm baseline ────────────────────────────────── */}
        {!loading && accounts && accounts.length > 0 && (
          <footer className="mt-16">
            <div className="kin-hr mb-6" aria-hidden="true" />
            <p className="text-center text-[11px] uppercase tracking-[0.22em] text-kin-bone-dim">
              <span className="tabular-nums">
                {silentCount.toLocaleString("en-CA")}
              </span>{" "}
              transactions silent ·{" "}
              <span className="text-kin-bone-soft">
                {attentionCount} surfaced
              </span>{" "}
              · across{" "}
              <span className="tabular-nums">{accounts.length}</span> accounts
            </p>
            <p className="mt-3 text-center text-[10px] uppercase tracking-[0.3em] text-kin-bone-dim/70">
              <span style={{ fontFamily: "var(--font-serif)" }} className="italic normal-case tracking-normal text-[12px] text-kin-bone-soft">
                Memory by Backboard
              </span>
              <span className="mx-2 text-kin-bone-dim/50">·</span>
              <span style={{ fontFamily: "var(--font-serif)" }} className="italic normal-case tracking-normal text-[12px] text-kin-bone-soft">
                Voice by ElevenLabs
              </span>
            </p>
          </footer>
        )}
      </div>
    </main>
  );
}
