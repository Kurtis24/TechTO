"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CallModal, type CallState } from "./CallModal";
import { useToast, type ToastVariant } from "./Toast";

type CardAction = { id: string; label: string; kind: string; params: unknown };

type CardDoc = {
  _id: Id<"cards">;
  type: "overdraft" | "duplicate" | "creep" | "outlier" | "info";
  severity: "info" | "warn" | "critical";
  title: string;
  body: string;
  status: "open" | "resolved" | "dismissed";
  actions: CardAction[];
};

/** Pull "$800" or "$500" out of an action's label for confirmation copy. */
function amountFromLabel(label: string): string | null {
  const m = label.match(/\$[\d,]+(?:\.\d{2})?/);
  return m ? m[0] : null;
}

function heroToast(
  action: CardAction,
): { variant: ToastVariant; title: string; body?: string } {
  const amount = amountFromLabel(action.label);
  switch (action.kind) {
    case "move_money":
      return {
        variant: "success",
        title: amount
          ? `Moved ${amount} → TD chequing`
          : "Funds moved to TD chequing",
        body: "Rent is covered. Trip goal is untouched.",
      };
    case "send_etransfer":
    case "send_etransfer_request":
      return {
        variant: "success",
        title: amount
          ? `e-Transfer request sent to Dana for ${amount}`
          : "e-Transfer request sent to Dana",
        body: "She'll get the ping in her RBC inbox.",
      };
    case "both":
      return {
        variant: "success",
        title: "Done — request sent + funds moved",
        body: "Rent covered Saturday. Kin will confirm when Dana pays.",
      };
    default:
      return { variant: "success", title: action.label };
  }
}

export function HeroCard({ card }: { card: CardDoc }) {
  const runAgent = useAction(api.agent.runAgent);
  const executeAction = useAction(api.agent.executeAction);
  const placeCall = useAction(api.agent.placeCall);
  const { push } = useToast();

  const [reasoning, setReasoning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [call, setCall] = useState<CallState | null>(null);

  const handleReason = async () => {
    setReasoning(true);
    try {
      await runAgent({ cardId: card._id });
      push({
        variant: "info",
        title: "Kin reasoned across your accounts",
        body: "Pulled balances, agreements, and the trip goal. Proposed actions below.",
      });
    } catch (err) {
      push({
        variant: "error",
        title: "Kin couldn't reason about this",
        body:
          err instanceof Error
            ? err.message
            : "Likely missing BACKBOARD_API_KEY in Convex env.",
      });
    } finally {
      setReasoning(false);
    }
  };

  const handleAction = async (action: CardAction) => {
    if (action.kind === "call_dana") {
      setCall({ status: "dialing" });
      setTimeout(() => setCall({ status: "ringing" }), 600);
      try {
        const res = await placeCall({ cardId: card._id });
        setCall({
          status: "connected",
          agentAudio: res.agentAudio,
          danaAudio: res.danaAudio,
          agentLine: res.agentLine,
          danaLine: res.danaLine,
        });
        push({
          variant: "success",
          title: "Call complete — Dana confirmed",
          body: "Agreement settling. Funds on the way to your TD chequing.",
        });
      } catch (err) {
        console.error("placeCall failed", err);
        setCall(null);
        push({
          variant: "error",
          title: "Call failed",
          body:
            err instanceof Error
              ? err.message
              : "Check ELEVENLABS_API_KEY in the Convex dashboard env.",
        });
      }
      return;
    }
    setBusy(action.id);
    try {
      await executeAction({ cardId: card._id, actionId: action.id });
      push(heroToast(action));
    } catch (err) {
      push({
        variant: "error",
        title: "Couldn't complete that action",
        body:
          err instanceof Error
            ? err.message
            : "The mutation failed — check Convex logs.",
      });
    } finally {
      setBusy(null);
    }
  };

  const hasAgentRun = card.actions.length > 0;
  const isResolved = card.status === "resolved";

  return (
    <>
      <article className="kin-hero kin-fade-in">
        {/* Vertical ember rail along the left edge */}
        <div className="kin-hero-rail" aria-hidden="true" />

        {/* ── Header strip ───────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 px-7 pt-7 sm:px-9 sm:pt-9">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.22em]"
              style={{
                color: "var(--kin-ember-soft)",
                background: "rgba(255, 107, 31, 0.10)",
                border: "1px solid rgba(255, 107, 31, 0.28)",
              }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-kin-ember kin-pulse"
                aria-hidden="true"
              />
              Critical
            </span>
            <span className="text-[11px] uppercase tracking-[0.22em] text-kin-bone-soft">
              Overdraft incoming
            </span>
          </div>

          <span
            className="text-[10px] uppercase tracking-[0.22em] text-kin-bone-dim"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {isResolved ? "✓ resolved" : "open"}
          </span>
        </div>

        {/* ── Editorial title ───────────────────────────────────────── */}
        <div className="px-7 pt-5 sm:px-9">
          <h2
            className="text-[34px] leading-[1.05] tracking-tight text-kin-bone text-pretty sm:text-[42px]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            <span className="italic">{card.title}</span>
          </h2>
        </div>

        {/* ── Body — the agent's reasoning ──────────────────────────── */}
        <div className="px-7 pb-2 pt-5 sm:px-9">
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-kin-bone-mute">
            {card.body}
          </p>
        </div>

        {/* ── Cross-source trace — the moat made tangible ───────────── */}
        <div className="px-7 pt-5 sm:px-9">
          <div className="text-[10px] uppercase tracking-[0.22em] text-kin-bone-dim">
            Sight across silos
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-kin-bone-mute">
            <SourceTag color="#6dd28e" label="td-alex" sub="chequing" />
            <Plus />
            <SourceTag color="#ff8a4a" label="tangerine-joint" sub="savings" />
            <Plus />
            <SourceTag color="#cbbfac" label="inbox" sub="agreement" />
          </div>

          <div className="mt-4 text-[10px] uppercase tracking-[0.22em] text-kin-bone-dim">
            Memory cited
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <MemoryChip>cottage-trip agreement · $800</MemoryChip>
            <MemoryChip>$5K trip goal · December</MemoryChip>
            <MemoryChip>“leave Netflix” · prior decision</MemoryChip>
          </div>
        </div>

        {/* ── Actions ───────────────────────────────────────────────── */}
        <div className="mt-7 border-t border-[var(--kin-line)] bg-[rgba(0,0,0,0.18)] px-7 py-5 sm:px-9">
          {!hasAgentRun ? (
            <div>
              <button
                type="button"
                onClick={handleReason}
                disabled={reasoning}
                className="kin-btn kin-btn-primary"
                aria-label="Have Kin reason about this card"
              >
                {reasoning ? (
                  <>
                    <Spinner />
                    Reasoning…
                  </>
                ) : (
                  <>
                    <SparkIcon />
                    Have Kin reason about this
                  </>
                )}
              </button>
              <p className="mt-3 text-xs text-kin-bone-soft">
                Kin will read accounts &amp; agreements, consult memory, then
                propose actions.
              </p>
            </div>
          ) : !isResolved ? (
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-kin-bone-dim">
                Proposed actions
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {/* Ghost (individual) options in a row, primary actions full-width below */}
                <div className="flex flex-wrap gap-2">
                  {card.actions.filter(a => a.kind !== "call_dana" && a.kind !== "both").map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => handleAction(a)}
                      disabled={busy !== null}
                      className="kin-btn kin-btn-ghost flex-1"
                      aria-label={a.label}
                    >
                      {busy === a.id ? (
                        <><Spinner />Working…</>
                      ) : (
                        <><ArrowIcon />{a.label}</>
                      )}
                    </button>
                  ))}
                </div>
                {card.actions.filter(a => a.kind === "both" || a.kind === "call_dana").map((a) => {
                  const isCall = a.kind === "call_dana";
                  const isBoth = a.kind === "both";
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => handleAction(a)}
                      disabled={busy !== null}
                      className="kin-btn kin-btn-primary w-full"
                      aria-label={a.label}
                    >
                      {busy === a.id ? (
                        <><Spinner />Working…</>
                      ) : (
                        <>
                          {isCall && <PhoneIcon />}
                          {isBoth && <SparkIcon />}
                          {a.label}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm"
              style={{
                background: "rgba(109, 210, 142, 0.08)",
                border: "1px solid rgba(109, 210, 142, 0.22)",
                color: "var(--kin-good)",
              }}
            >
              <CheckIcon />
              <span className="text-kin-bone">
                Handled before Saturday.{" "}
                <span className="text-kin-bone-mute">
                  Kin will keep watching.
                </span>
              </span>
            </div>
          )}
        </div>
      </article>

      <CallModal state={call} onClose={() => setCall(null)} />
    </>
  );
}

/* ── Local presentation helpers ─────────────────────────────────── */

function SourceTag({
  color,
  label,
  sub,
}: {
  color: string;
  label: string;
  sub: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--kin-line)] bg-[rgba(0,0,0,0.25)] px-2 py-1"
      style={{ fontFamily: "var(--font-mono)" }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span className="text-[11px] text-kin-bone" translate="no">
        {label}
      </span>
      <span className="text-[10px] text-kin-bone-soft">{sub}</span>
    </span>
  );
}

function Plus() {
  return (
    <span className="text-kin-bone-dim" aria-hidden="true">
      +
    </span>
  );
}

function MemoryChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]"
      style={{
        borderColor: "rgba(249, 168, 37, 0.22)",
        background: "rgba(249, 168, 37, 0.06)",
        color: "var(--kin-amber-soft)",
      }}
    >
      <svg
        viewBox="0 0 16 16"
        className="h-3 w-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="5.5" />
        <path d="M8 5v3l2 1.5" strokeLinecap="round" />
      </svg>
      {children}
    </span>
  );
}

function Spinner() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 animate-spin"
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
      <path
        d="M8 1.5l1.4 4.1 4.1 1.4-4.1 1.4L8 12.5 6.6 8.4 2.5 7l4.1-1.4L8 1.5z"
        fill="currentColor"
      />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
      <path
        d="M4.4 7.2a10 10 0 0 0 4.4 4.4l1.5-1.5a.7.7 0 0 1 .7-.17 7.6 7.6 0 0 0 2.4.38.7.7 0 0 1 .7.7v2.4a.7.7 0 0 1-.7.7A11.3 11.3 0 0 1 2 2.7.7.7 0 0 1 2.7 2h2.4a.7.7 0 0 1 .7.7c0 .83.13 1.64.38 2.4a.7.7 0 0 1-.17.7L4.4 7.2z"
        fill="currentColor"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
      <path
        d="M3 8h9m0 0L8 4m4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <path
        d="M3 8.5l3 3 7-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
