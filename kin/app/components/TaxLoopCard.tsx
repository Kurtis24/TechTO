"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type StrategyParams = {
  blurb: string;
  estSavingsCents: number;
  craRef: string;
  applies: string;
};

type CardAction = {
  id: string;
  label: string;
  kind: string;
  params: StrategyParams | Record<string, unknown>;
};

type CardDoc = {
  _id: Id<"cards">;
  type: "tax_loop";
  severity: "info" | "warn" | "critical";
  title: string;
  body: string;
  status: "open" | "resolved" | "dismissed";
  actions: CardAction[];
};

const dollars = (cents: number) =>
  `$${Math.round(cents / 100).toLocaleString("en-CA")}`;

export function TaxLoopCard({ card }: { card: CardDoc }) {
  const executeAction = useAction(api.agent.executeAction);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const strategies = card.actions.filter((a) => a.kind === "tax_strategy");
  const dismissAction = card.actions.find((a) => a.kind === "dismiss");

  const handleDismiss = async () => {
    if (!dismissAction) return;
    setBusy(true);
    try {
      await executeAction({ cardId: card._id, actionId: dismissAction.id });
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      className="kin-card kin-fade-in relative overflow-hidden"
      style={{
        background:
          "radial-gradient(120% 80% at 0% 100%, rgba(249, 168, 37, 0.10) 0%, rgba(249, 168, 37, 0.02) 35%, rgba(249, 168, 37, 0) 65%), var(--kin-surface)",
        borderColor: "rgba(249, 168, 37, 0.22)",
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-6 pt-6">
        <div className="flex items-center gap-2.5">
          <span
            className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.22em]"
            style={{
              color: "var(--kin-amber-soft)",
              background: "rgba(249, 168, 37, 0.10)",
              border: "1px solid rgba(249, 168, 37, 0.28)",
            }}
          >
            <LeafIcon />
            Family tax
          </span>
          <span className="text-[11px] uppercase tracking-[0.22em] text-kin-bone-soft">
            Cross-source · informational
          </span>
        </div>
        <span
          className="text-[10px] uppercase tracking-[0.22em] text-kin-bone-dim"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {strategies.length} {strategies.length === 1 ? "strategy" : "strategies"}
        </span>
      </div>

      {/* Title */}
      <div className="px-6 pt-3">
        <h2
          className="text-[26px] leading-[1.1] tracking-tight text-kin-bone text-pretty sm:text-[30px]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          <span className="italic">{card.title}</span>
        </h2>
      </div>

      {/* Summary body */}
      <div className="px-6 pb-2 pt-3">
        <p className="text-[14px] leading-relaxed text-kin-bone-mute">
          {card.body}
        </p>
      </div>

      {/* Strategies list */}
      <div className="mt-3 border-t border-[var(--kin-line)]">
        {strategies.map((s, i) => {
          const params = s.params as StrategyParams;
          const open = openId === s.id;
          return (
            <div
              key={s.id}
              className={
                i > 0 ? "border-t border-[var(--kin-line)]" : undefined
              }
            >
              <button
                type="button"
                onClick={() => setOpenId(open ? null : s.id)}
                aria-expanded={open}
                aria-controls={`strategy-${s.id}`}
                className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-[rgba(255,222,188,0.03)] focus-visible:bg-[rgba(255,222,188,0.04)] focus-visible:outline-none"
              >
                <div className="flex items-baseline gap-3 min-w-0">
                  <span
                    className="shrink-0 text-[11px] tabular-nums text-kin-bone-soft"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[15px] font-medium text-kin-bone truncate">
                    {s.label}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className="text-[12px] tabular-nums"
                    style={{
                      color: "var(--kin-amber-soft)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    ~{dollars(params.estSavingsCents)}/yr
                  </span>
                  <Chevron open={open} />
                </div>
              </button>

              {open && (
                <div
                  id={`strategy-${s.id}`}
                  className="kin-fade-in space-y-3 px-6 pb-5 pl-[3.25rem] pr-6"
                >
                  <p className="text-[13px] leading-relaxed text-kin-bone-mute">
                    {params.blurb}
                  </p>
                  <div className="space-y-1.5">
                    <DetailRow label="Why it applies" value={params.applies} />
                    <DetailRow
                      label="Estimated savings"
                      value={`~${dollars(params.estSavingsCents)} per year`}
                    />
                    <DetailRow label="Reference" value={params.craRef} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer disclaimer + actions */}
      <div className="border-t border-[var(--kin-line)] bg-[rgba(0,0,0,0.18)] px-6 py-4">
        <p className="text-[11px] leading-relaxed text-kin-bone-soft">
          <span style={{ fontFamily: "var(--font-serif)" }} className="italic">
            Not tax advice.
          </span>{" "}
          General Canadian household planning ideas. Confirm with an accountant —
          CRA attribution rules &amp; contribution rooms apply, and rates change
          year-to-year.
        </p>
        {dismissAction && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleDismiss}
              disabled={busy}
              className="kin-btn-pill"
              aria-label="Mark tax strategies as explored"
            >
              {busy ? "Working…" : "Mark as explored"}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

/* ── helpers ───────────────────────────────────────────────────── */

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3 text-[12px]">
      <span className="shrink-0 text-kin-bone-dim uppercase tracking-[0.18em] text-[10px]">
        {label}
      </span>
      <span className="text-kin-bone-mute">{value}</span>
    </div>
  );
}

function LeafIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
      <path
        d="M2 14C2 7 6 2 14 2c0 8-5 12-12 12zM2 14l5-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 text-kin-bone-soft transition-transform"
      style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
      aria-hidden="true"
    >
      <path
        d="M3 6l5 4 5-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
