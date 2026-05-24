"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useToast, type ToastVariant } from "./Toast";

type CardAction = {
  id: string;
  label: string;
  kind: string;
  params: unknown;
};

type CardDoc = {
  _id: Id<"cards">;
  type: "overdraft" | "duplicate" | "creep" | "outlier" | "info";
  severity: "info" | "warn" | "critical";
  title: string;
  body: string;
  status: "open" | "resolved" | "dismissed";
  actions: CardAction[];
};

type Meta = {
  label: string;
  color: string;
  glyph: React.ReactNode;
};

const META: Record<CardDoc["type"], Meta> = {
  duplicate: {
    label: "Duplicate",
    color: "#f9a03f",
    glyph: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
        <rect
          x="4"
          y="4"
          width="8"
          height="8"
          rx="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <rect
          x="2"
          y="2"
          width="8"
          height="8"
          rx="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
      </svg>
    ),
  },
  creep: {
    label: "Creep",
    color: "#ffd56a",
    glyph: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
        <path
          d="M2 12l4-4 3 3 5-6m0 0H10m3 0v3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  outlier: {
    label: "Outlier",
    color: "#7aa9ff",
    glyph: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
        <path
          d="M8 1.8l5.6 3v4.4L8 14.2 2.4 9.2V4.8L8 1.8z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path
          d="M8 5.5v3.5M8 11v.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  info: {
    label: "Note",
    color: "#cbbfac",
    glyph: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
        <circle
          cx="8"
          cy="8"
          r="6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M8 7v4M8 5v.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  overdraft: {
    label: "Overdraft",
    color: "#ff6b1f",
    glyph: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
        <path d="M8 1.5L15 14H1L8 1.5z" fill="currentColor" />
      </svg>
    ),
  },
};

/** Pull the merchant (after the colon) from titles like "Possible duplicate: Toronto Hydro". */
function extractSubject(title: string): string {
  const i = title.indexOf(":");
  return i > -1 ? title.slice(i + 1).trim() : title;
}

type Receipt = {
  inline: string;
  toast: { variant: ToastVariant; title: string; body?: string };
};

/** Map (action.kind, action.id) → user-visible receipt copy. */
function receiptFor(card: CardDoc, action: CardAction): Receipt {
  const subject = extractSubject(card.title);

  switch (action.kind) {
    case "dispute_charge":
      return {
        inline: "Dispute filed",
        toast: {
          variant: "success",
          title: `Dispute filed — ${subject}`,
          body: "Kin will watch for the refund and ping you when it lands.",
        },
      };
    case "flag_review":
      return {
        inline: "Flagged for review",
        toast: {
          variant: "warn",
          title: `Flagged ${subject} for review`,
          body: "Kept on the watchlist. We'll surface anything similar.",
        },
      };
    case "cancel_subscription":
      return {
        inline: "Cancellation queued",
        toast: {
          variant: "success",
          title: `Cancellation queued — ${subject}`,
          body: "Kin will handle the unsubscribe and confirm when it's done.",
        },
      };
  }

  // `kind: "dismiss"` covers several intents; the id disambiguates.
  switch (action.id) {
    case "expected":
      return {
        inline: "Marked as expected",
        toast: {
          variant: "info",
          title: "Marked as expected",
          body: `Kin will treat charges like this as normal going forward.`,
        },
      };
    case "ignore":
      return {
        inline: "Not a duplicate — got it",
        toast: {
          variant: "info",
          title: "Not a duplicate — noted",
          body: "Kin won't flag this pair again.",
        },
      };
    case "keep":
      return {
        inline: "Keeping as-is",
        toast: {
          variant: "info",
          title: `Keeping ${subject}`,
          body: "Acknowledged. Kin will stop surfacing this.",
        },
      };
  }

  return {
    inline: "Done",
    toast: { variant: "info", title: action.label },
  };
}

export function ByproductCard({ card }: { card: CardDoc }) {
  const executeAction = useAction(api.agent.executeAction);
  const { push } = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const meta = META[card.type];

  const handle = async (action: CardAction) => {
    if (pendingId || receipt) return;
    const r = receiptFor(card, action);
    setPendingId(action.id);

    // Optimistic: show the inline confirmation + toast immediately so the
    // user gets feedback before the card unmounts via the reactive query.
    setReceipt(r);
    push(r.toast);

    try {
      // Hold the mutation back briefly so the inline confirmation is actually
      // visible before the card slides out of the feed.
      await new Promise((resolve) => setTimeout(resolve, 900));
      await executeAction({ cardId: card._id, actionId: action.id });
    } catch (err) {
      // Revert UI; surface the error.
      setReceipt(null);
      setPendingId(null);
      push({
        variant: "error",
        title: "Couldn't complete that",
        body: err instanceof Error ? err.message : "Try again in a moment.",
      });
    }
  };

  return (
    <div
      className={`flex items-start gap-4 px-5 py-4 ${
        receipt ? "kin-card-leaving" : ""
      }`}
    >
      {/* Glyph + colored ring */}
      <div
        className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"
        style={{
          color: meta.color,
          background: "rgba(0, 0, 0, 0.35)",
          border: `1px solid ${meta.color}33`,
          boxShadow: `0 0 24px -8px ${meta.color}55`,
        }}
        aria-hidden="true"
      >
        {meta.glyph}
      </div>

      {/* Body */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span
            className="text-[10px] uppercase tracking-[0.22em]"
            style={{ color: meta.color, fontFamily: "var(--font-mono)" }}
          >
            {meta.label}
          </span>
          <h3 className="truncate text-[15px] font-medium text-kin-bone">
            {card.title}
          </h3>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-kin-bone-mute">
          {card.body}
        </p>

        {card.actions.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {receipt ? (
              <span className="kin-action-done">
                <CheckGlyph />
                {receipt.inline}
              </span>
            ) : (
              card.actions.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => handle(a)}
                  disabled={pendingId !== null}
                  className="kin-btn-pill"
                  aria-label={a.label}
                >
                  {pendingId === a.id ? (
                    <>
                      <PillSpinner />
                      Working…
                    </>
                  ) : (
                    a.label
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CheckGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
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

function PillSpinner() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3 w-3 animate-spin"
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
