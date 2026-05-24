"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type CardDoc = {
  _id: Id<"cards">;
  type: "overdraft" | "duplicate" | "creep" | "outlier" | "info";
  severity: "info" | "warn" | "critical";
  title: string;
  body: string;
  status: "open" | "resolved" | "dismissed";
  actions: { id: string; label: string; kind: string; params: unknown }[];
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

export function ByproductCard({ card }: { card: CardDoc }) {
  const executeAction = useAction(api.agent.executeAction);
  const [busy, setBusy] = useState(false);
  const meta = META[card.type];

  const handle = async (actionId: string) => {
    setBusy(true);
    try {
      await executeAction({ cardId: card._id, actionId });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-start gap-4 px-5 py-4">
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
          <div className="mt-3 flex flex-wrap gap-1.5">
            {card.actions.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => handle(a.id)}
                disabled={busy}
                className="kin-btn-pill"
                aria-label={a.label}
              >
                {busy ? "Working…" : a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
