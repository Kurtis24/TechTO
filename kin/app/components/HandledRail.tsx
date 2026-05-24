"use client";

/**
 * "Handled today" rail — the receipt drawer.
 *
 * After a user acts, the card vanishes from the feed; toasts fade. Without a
 * persistent record there's no proof Kin is *doing* anything over time. This
 * rail lists what's been handled in the current session as a quiet ledger
 * below the feed.
 */

import { useMemo, useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";

type CardDoc = {
  _id: Id<"cards">;
  type: "overdraft" | "duplicate" | "creep" | "outlier" | "info";
  severity: "info" | "warn" | "critical";
  title: string;
  status: "open" | "resolved" | "dismissed";
  createdAt: number;
};

const TYPE_COLOR: Record<CardDoc["type"], string> = {
  overdraft: "var(--kin-ember)",
  duplicate: "#f9a03f",
  creep: "#ffd56a",
  outlier: "#7aa9ff",
  info: "var(--kin-bone-soft)",
};

const TYPE_LABEL: Record<CardDoc["type"], string> = {
  overdraft: "Overdraft",
  duplicate: "Duplicate",
  creep: "Creep",
  outlier: "Outlier",
  info: "Note",
};

const COLLAPSED_LIMIT = 4;

export function HandledRail({ cards }: { cards: CardDoc[] }) {
  const [expanded, setExpanded] = useState(false);

  const handled = useMemo(
    () =>
      cards
        .filter((c) => c.status === "resolved" || c.status === "dismissed")
        .sort((a, b) => b.createdAt - a.createdAt),
    [cards],
  );

  if (handled.length === 0) return null;

  const visible = expanded ? handled : handled.slice(0, COLLAPSED_LIMIT);
  const more = handled.length - COLLAPSED_LIMIT;
  const resolvedCount = handled.filter((c) => c.status === "resolved").length;
  const dismissedCount = handled.length - resolvedCount;

  return (
    <section
      className="kin-rise kin-handled"
      style={{ animationDelay: "240ms" }}
      aria-label="Handled today"
    >
      <header className="kin-handled-header">
        <h3 className="text-[11px] uppercase tracking-[0.22em] text-kin-bone-soft">
          Handled today
        </h3>
        <span className="text-[11px] uppercase tracking-[0.18em] text-kin-bone-dim">
          {resolvedCount > 0 && (
            <>
              <span className="text-kin-good">{resolvedCount}</span> acted
            </>
          )}
          {resolvedCount > 0 && dismissedCount > 0 && (
            <span className="mx-1.5 text-kin-bone-dim">·</span>
          )}
          {dismissedCount > 0 && (
            <>
              <span className="text-kin-bone-mute">{dismissedCount}</span>{" "}
              dismissed
            </>
          )}
        </span>
      </header>

      <ul className="kin-handled-list" role="list">
        {visible.map((card) => (
          <li key={card._id} className="kin-handled-item">
            <span
              className="kin-handled-dot"
              style={{ background: TYPE_COLOR[card.type] }}
              aria-hidden="true"
            />
            <span
              className="kin-handled-kind"
              style={{
                color: TYPE_COLOR[card.type],
                fontFamily: "var(--font-mono)",
              }}
            >
              {TYPE_LABEL[card.type]}
            </span>
            <span className="kin-handled-title">{card.title}</span>
            <span
              className={`kin-handled-status ${
                card.status === "resolved"
                  ? "kin-handled-status-resolved"
                  : "kin-handled-status-dismissed"
              }`}
            >
              {card.status === "resolved" ? (
                <>
                  <CheckGlyph /> Acted
                </>
              ) : (
                <>
                  <DismissGlyph /> Dismissed
                </>
              )}
            </span>
          </li>
        ))}
      </ul>

      {more > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="kin-handled-toggle"
          aria-expanded={expanded}
        >
          {expanded ? "Show less" : `Show ${more} more`}
        </button>
      )}
    </section>
  );
}

function CheckGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
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

function DismissGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
      <path
        d="M3.5 3.5l9 9m0-9l-9 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
