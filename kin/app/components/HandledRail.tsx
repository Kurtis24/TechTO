"use client";

/**
 * "Handled today" rail — the receipt drawer.
 *
 * After a user acts, the card vanishes from the feed; toasts fade. Without a
 * persistent record there's no proof Kin is *doing* anything over time. This
 * rail lists what's been handled in the current session as a quiet ledger
 * below the feed.
 *
 * Each row is clickable — expands to show the original card body + timestamp.
 * Dismissed items get a "Reopen" escape hatch to send them back to the feed.
 */

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { relativeDate } from "./format";

type CardDoc = {
  _id: Id<"cards">;
  type: "overdraft" | "duplicate" | "creep" | "outlier" | "info";
  severity: "info" | "warn" | "critical";
  title: string;
  body: string;
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
  const [openId, setOpenId] = useState<Id<"cards"> | null>(null);
  const [reopening, setReopening] = useState<Id<"cards"> | null>(null);
  const resolveCard = useMutation(api.mutations.resolveCard);

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

  const handleReopen = async (card: CardDoc, e: React.MouseEvent) => {
    e.stopPropagation();
    setReopening(card._id);
    try {
      await resolveCard({ cardId: card._id, status: "open" });
      setOpenId(null);
    } finally {
      setReopening(null);
    }
  };

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
        {visible.map((card) => {
          const isOpen = openId === card._id;
          const color = TYPE_COLOR[card.type];
          return (
            <li key={card._id}>
              {/* Summary row — always visible, clickable to expand */}
              <button
                type="button"
                className={`kin-handled-item kin-handled-row ${isOpen ? "kin-handled-row-open" : ""}`}
                onClick={() => setOpenId(isOpen ? null : card._id)}
                aria-expanded={isOpen}
                aria-label={`${card.title} — ${card.status === "resolved" ? "acted on" : "dismissed"}. Click to ${isOpen ? "collapse" : "expand"} details.`}
              >
                <span
                  className="kin-handled-dot"
                  style={{ background: color }}
                  aria-hidden="true"
                />
                <span
                  className="kin-handled-kind"
                  style={{ color, fontFamily: "var(--font-mono)" }}
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
                    <><CheckGlyph /> Acted</>
                  ) : (
                    <><DismissGlyph /> Dismissed</>
                  )}
                </span>
                <span
                  className="kin-handled-chevron"
                  style={{ transform: isOpen ? "rotate(180deg)" : undefined }}
                  aria-hidden="true"
                >
                  <ChevronGlyph />
                </span>
              </button>

              {/* Expanded detail — body text, timestamp, optional reopen */}
              {isOpen && (
                <div className="kin-handled-detail">
                  <p className="kin-handled-detail-body">{card.body}</p>
                  <div className="kin-handled-detail-footer">
                    <span className="kin-handled-detail-time">
                      {relativeDate(card.createdAt)}
                    </span>
                    {card.status === "dismissed" && (
                      <button
                        type="button"
                        onClick={(e) => handleReopen(card, e)}
                        disabled={reopening !== null}
                        className="kin-handled-reopen"
                        aria-label={`Reopen ${card.title}`}
                      >
                        {reopening === card._id ? (
                          <><MiniSpinner />Reopening…</>
                        ) : (
                          <><ReopenGlyph />Reopen</>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
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

function ChevronGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
      <path
        d="M4 6l4 4 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ReopenGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
      <path
        d="M3 8a5 5 0 1 0 1.5-3.5L3 6m0-3v3h3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MiniSpinner() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3 animate-spin" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
