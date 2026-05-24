"use client";

import { useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { AccountStrip } from "./components/AccountStrip";
import { HeroCard } from "./components/HeroCard";
import { ByproductCard } from "./components/ByproductCard";
import { FocusBrief } from "./components/FocusBrief";
import { HandledRail } from "./components/HandledRail";
import { HouseholdSnapshot } from "./components/HouseholdSnapshot";
import { ViewerCard } from "./components/ViewerCard";

export default function Home() {
  const people = useQuery(api.queries.getPeople);
  const currentViewer = useQuery(api.queries.getCurrentViewer);

  const viewerId = currentViewer?._id ?? undefined;

  // Viewer-scoped data — re-runs reactively when the viewer switches.
  const accounts = useQuery(
    api.queries.getAccounts,
    viewerId ? { forViewerId: viewerId } : "skip",
  );
  const allAccounts = useQuery(api.queries.getAccounts, {}); // for HouseholdPanel
  const agreements = useQuery(
    api.queries.getAgreements,
    viewerId ? { forViewerId: viewerId } : "skip",
  );
  const openCards = useQuery(
    api.queries.getCards,
    viewerId ? { forViewerId: viewerId } : "skip",
  );
  const resolvedCards = useQuery(
    api.queries.getCards,
    viewerId ? { includeResolved: true, forViewerId: viewerId } : "skip",
  );

  const bootstrap = useAction(api.agent.bootstrapDemo);
  const [booting, setBooting] = useState(false);

  const handleBootstrap = async () => {
    setBooting(true);
    try {
      await bootstrap({});
    } catch (err) {
      console.error(err);
      alert(
        "Bootstrap failed — check Convex logs. Likely missing BACKBOARD_API_KEY.",
      );
    } finally {
      setBooting(false);
    }
  };

  const loading =
    accounts === undefined ||
    agreements === undefined ||
    openCards === undefined ||
    resolvedCards === undefined ||
    people === undefined ||
    currentViewer === undefined;

  const hero = openCards?.find((c) => c.type === "overdraft");
  const heroResolved = !hero
    ? resolvedCards?.find(
        (c) => c.type === "overdraft" && c.status === "resolved",
      )
    : null;
  const heroToShow = hero ?? heroResolved ?? null;

  const byproducts =
    openCards?.filter(
      (c) =>
        c.type === "duplicate" || c.type === "creep" || c.type === "outlier",
    ) ?? [];

  const totalTxnCount = resolvedCards?.length ?? 0;
  const attentionCount = byproducts.length + (heroToShow ? 1 : 0);
  const silentCount = Math.max(
    1400 - attentionCount,
    totalTxnCount - attentionCount,
  );

  const partner = useMemo(
    () =>
      people?.find((p) => p._id !== currentViewer?._id) ?? null,
    [people, currentViewer],
  );

  const hasAccounts = (accounts?.length ?? 0) > 0;
  const snapshotProps = {
    accounts: allAccounts ?? [],
    agreements: agreements ?? [],
    people: people ?? [],
    viewerId: currentViewer?._id ?? null,
  };

  return (
    <main className="relative min-h-screen">
      <div className="mx-auto w-full max-w-3xl xl:max-w-[1200px] px-6 pt-10 pb-20 sm:pt-14">
        {/* ── Brand header ─────────────────────────────────────────────
            Wordmark on the left; the interactive viewer card on the right.
            The viewer card is the door to the household panel — it tells
            you whose view this is and lets you switch. */}
        <header className="kin-rise kin-header">
          <div className="kin-header-brand">
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
          {currentViewer ? (
            <ViewerCard
              people={people ?? undefined}
              currentViewer={currentViewer}
              accounts={allAccounts ?? []}
              onResetDemo={handleBootstrap}
              resetting={booting}
            />
          ) : (
            // No seed yet — surface Reset Demo prominently so the household
            // panel (which lives behind the viewer card) is reachable.
            <button
              type="button"
              onClick={handleBootstrap}
              disabled={booting}
              className="kin-btn kin-btn-primary"
              aria-label="Bootstrap the demo with seed data"
            >
              {booting ? "Initializing…" : "Initialize demo"}
            </button>
          )}
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
          <span>{(accounts?.length ?? 0)} sources</span>
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
              attentionCount > 0 ? "text-kin-ember-soft" : "text-kin-bone-soft"
            }
          >
            {attentionCount} {attentionCount === 1 ? "ping" : "pings"}
          </span>
        </div>

        <div className="kin-hr mt-5" aria-hidden="true" />

        {/* ── Two-column dashboard ─────────────────────────────────────
            At xl+: household (left, sticky) + scrollable feed (right).
            Below xl: single column, household first then feed. */}
        <div className="kin-dashboard mt-7">

          {/* ── LEFT: household column ──────────────────────────────── */}
          <div className="kin-dashboard-household">
            <section
              className="kin-rise"
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
                    Open the household panel and tap{" "}
                    <span className="text-kin-amber-soft">Reset demo</span> to seed
                    the household and run the engine.
                  </p>
                </div>
              ) : (
                <>
                  <AccountStrip
                    accounts={accounts ?? []}
                    agreements={agreements ?? []}
                    people={people ?? []}
                    viewerId={currentViewer?._id ?? null}
                  />
                  {hasAccounts && <HouseholdSnapshot {...snapshotProps} />}
                </>
              )}
            </section>
          </div>

          {/* ── RIGHT: feed column (scrollable) ─────────────────────── */}
          <div className="kin-dashboard-feed">
            {/* Focus brief — only shown when there's no open hero card. */}
            {!loading && hasAccounts && !hero && (
              <section className="kin-rise" style={{ animationDelay: "150ms" }} aria-label="Right now">
                <FocusBrief
                  hero={heroToShow ?? null}
                  byproductCount={byproducts.length}
                  viewer={currentViewer ?? null}
                  partner={partner}
                />
              </section>
            )}

            {/* The feed */}
            <section
              className="kin-rise mt-7 space-y-5"
              style={{ animationDelay: "180ms" }}
              aria-label="Kin feed"
            >
              <div className="kin-section-eyebrow justify-between">
                <span className="kin-section-eyebrow-label">The Feed</span>
                {heroToShow ? (
                  heroToShow.status === "resolved" ? (
                    <span className="text-[11px] uppercase tracking-[0.18em] text-kin-good">
                      Handled
                    </span>
                  ) : (
                    <span className="text-[11px] uppercase tracking-[0.18em] text-kin-ember-soft">
                      1 tap will land it
                    </span>
                  )
                ) : null}
              </div>

              {heroToShow && <HeroCard card={heroToShow} />}

              {byproducts.length > 0 && (
                <div className="space-y-2">
                  <div className="kin-section-eyebrow">
                    <span className="kin-section-eyebrow-label">Worth a look</span>
                    <span className="kin-section-eyebrow-hint">
                      {byproducts.length} small flag
                      {byproducts.length === 1 ? "" : "s"} — none time-sensitive
                    </span>
                  </div>
                  <div className="kin-card overflow-hidden">
                    {byproducts.map((c, i) => (
                      <div
                        key={c._id}
                        className={
                          i > 0 ? "border-t border-[var(--kin-line)]" : undefined
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
                    Nothing here for{" "}
                    {currentViewer?.displayName ?? currentViewer?.name ?? "you"}{" "}
                    right now. Kin is still watching.
                  </p>
                </div>
              )}
            </section>

            {/* Handled today */}
            {!loading && resolvedCards && <HandledRail cards={resolvedCards} />}

            {/* Footer */}
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
              </footer>
            )}
          </div>

        </div>
      </div>
    </main>
  );
}
