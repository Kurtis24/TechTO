"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CallModal, type CallState } from "./CallModal";

type CardDoc = {
  _id: Id<"cards">;
  type: "overdraft" | "duplicate" | "creep" | "outlier" | "info";
  severity: "info" | "warn" | "critical";
  title: string;
  body: string;
  status: "open" | "resolved" | "dismissed";
  actions: { id: string; label: string; kind: string; params: unknown }[];
};

export function HeroCard({ card }: { card: CardDoc }) {
  const runAgent = useAction(api.agent.runAgent);
  const executeAction = useAction(api.agent.executeAction);
  const placeCall = useAction(api.agent.placeCall);

  const [reasoning, setReasoning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [call, setCall] = useState<CallState | null>(null);

  const handleReason = async () => {
    setReasoning(true);
    try {
      await runAgent({ cardId: card._id });
    } finally {
      setReasoning(false);
    }
  };

  const handleAction = async (actionId: string, kind: string) => {
    if (kind === "call_dana") {
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
      } catch (err) {
        console.error("placeCall failed", err);
        setCall(null);
        alert(
          "Call failed — check ELEVENLABS_API_KEY in the Convex dashboard env."
        );
      }
      return;
    }
    setBusy(actionId);
    try {
      await executeAction({ cardId: card._id, actionId });
    } finally {
      setBusy(null);
    }
  };

  // Buttons: if agent hasn't generated actions yet, show the "Have Kin reason" CTA.
  const hasAgentRun = card.actions.length > 0;

  const buttonStyle = (primary: boolean) =>
    primary
      ? "rounded-xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      : "rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50";

  return (
    <>
      <div className="rounded-2xl border border-rose-300 bg-white shadow-sm">
        <div className="flex items-start gap-3 border-b border-zinc-100 px-6 py-4">
          <div className="mt-1 grid h-8 w-8 place-items-center rounded-full bg-rose-100 text-rose-700">
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
              <path d="M12 2 1 21h22L12 2Zm0 6 7.5 13h-15L12 8Zm-1 4v4h2v-4h-2Zm0 5v2h2v-2h-2Z" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="text-[11px] uppercase tracking-wider text-rose-600">
              Critical · Overdraft incoming
            </div>
            <h2 className="text-lg font-semibold text-zinc-900">{card.title}</h2>
          </div>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
            {card.status === "resolved" ? "✓ resolved" : "open"}
          </span>
        </div>

        <div className="px-6 py-5">
          <p className="text-[15px] leading-relaxed text-zinc-800 whitespace-pre-wrap">
            {card.body}
          </p>

          <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-zinc-500">
            <span className="rounded-full bg-zinc-100 px-2 py-0.5">
              cross-source · td-alex + tangerine-joint + inbox
            </span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5">
              memory · agreement + goal + normal
            </span>
          </div>

          {!hasAgentRun ? (
            <div className="mt-5">
              <button
                onClick={handleReason}
                disabled={reasoning}
                className={buttonStyle(true)}
              >
                {reasoning ? "Reasoning…" : "Have Kin reason about this"}
              </button>
              <p className="mt-2 text-xs text-zinc-500">
                Kin will read accounts + agreements + memory, then propose actions.
              </p>
            </div>
          ) : card.status === "open" ? (
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {card.actions.map((a) => {
                const isCall = a.kind === "call_dana";
                const isBoth = a.kind === "both";
                return (
                  <button
                    key={a.id}
                    onClick={() => handleAction(a.id, a.kind)}
                    disabled={busy !== null}
                    className={
                      isCall || isBoth
                        ? buttonStyle(true)
                        : buttonStyle(false)
                    }
                  >
                    {busy === a.id ? "…" : a.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              ✓ Handled before Saturday. Kin will keep watching.
            </div>
          )}
        </div>
      </div>

      <CallModal state={call} onClose={() => setCall(null)} />
    </>
  );
}
