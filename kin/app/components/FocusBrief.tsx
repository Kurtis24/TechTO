"use client";

/**
 * The editorial standfirst above the feed.
 *
 * A first-time viewer landing on the page sees a wall of cards and needs to
 * know — in one breath — what Kin is paying attention to right now and what
 * the user is being asked to do. This component frames the feed so the rest
 * of the page reads as evidence rather than noise.
 */

import type { Id } from "../../convex/_generated/dataModel";

type CardDoc = {
  _id: Id<"cards">;
  type: "overdraft" | "duplicate" | "creep" | "outlier" | "info";
  severity: "info" | "warn" | "critical";
  title: string;
  body: string;
  status: "open" | "resolved" | "dismissed";
};

type Person = {
  _id: Id<"people">;
  name: string;
  displayName?: string;
};

type Tone = "urgent" | "easing" | "calm" | "quiet";

const TONE: Record<
  Tone,
  { color: string; label: string; cta: string | null }
> = {
  urgent: {
    color: "var(--kin-ember)",
    label: "Action needed",
    cta: "1 tap will land it",
  },
  easing: {
    color: "var(--kin-good)",
    label: "Just handled",
    cta: null,
  },
  calm: {
    color: "var(--kin-amber-soft)",
    label: "Worth a peek",
    cta: null,
  },
  quiet: {
    color: "var(--kin-bone-soft)",
    label: "All quiet",
    cta: null,
  },
};

function extractShortfall(body: string): string | null {
  const m = body.match(/shortfall:\s*-?(\$[\d,]+(?:\.\d{2})?)/i);
  return m ? m[1] : null;
}

function extractOwed(body: string): string | null {
  const m = body.match(/owes\s*(\$[\d,]+(?:\.\d{2})?)/i);
  return m ? m[1] : null;
}

export function FocusBrief({
  hero,
  byproductCount,
  viewer,
  partner,
}: {
  hero: CardDoc | null;
  byproductCount: number;
  viewer: Person | null;
  partner: Person | null;
}) {
  let line: string;
  let tone: Tone;
  const viewerName = viewer?.displayName?.split(" ")[0] ?? viewer?.name ?? "you";
  const partnerName =
    partner?.displayName?.split(" ")[0] ?? partner?.name ?? "your partner";

  if (hero && hero.status === "open") {
    tone = "urgent";
    const shortfall = extractShortfall(hero.body);
    const owed = extractOwed(hero.body);
    if (shortfall && owed) {
      line = `Saturday is the squeeze, ${viewerName}. Your chequing will fall ${shortfall} short of rent — but ${partnerName} owes ${owed}. Two taps below will cover it.`;
    } else if (shortfall) {
      line = `Saturday is the squeeze, ${viewerName}. Your chequing will fall ${shortfall} short of rent. The fixes are queued below.`;
    } else {
      line = `Rent autopays Saturday and your chequing won't cover it. Two fixes are queued below — pick one.`;
    }
  } else if (hero && hero.status === "resolved") {
    tone = "easing";
    line = `Handled. Rent is covered for Saturday — Kin keeps watching.`;
  } else if (byproductCount > 0) {
    tone = "calm";
    line = `${byproductCount} small thing${byproductCount === 1 ? "" : "s"} worth a peek below — nothing time-sensitive.`;
  } else {
    tone = "quiet";
    line = `All steady across your accounts, ${viewerName}. Kin will speak up if that changes.`;
  }

  const meta = TONE[tone];

  return (
    <aside
      className={`kin-rise kin-focus kin-focus-${tone}`}
      style={{ animationDelay: "150ms" }}
      aria-label="Current focus"
    >
      <span
        className="kin-focus-bar"
        style={{ background: meta.color }}
        aria-hidden="true"
      />
      <div className="kin-focus-content">
        <header className="kin-focus-header">
          <span
            className="kin-focus-pill"
            style={{
              color: meta.color,
              borderColor: `${asColor(tone)}55`,
              background: `${asColor(tone)}14`,
            }}
          >
            <span
              className="kin-focus-pill-dot"
              style={{ background: meta.color }}
              aria-hidden="true"
            />
            {meta.label}
          </span>
          {meta.cta && (
            <span className="kin-focus-cta" style={{ color: meta.color }}>
              {meta.cta}
            </span>
          )}
        </header>
        <p className="kin-focus-line">{line}</p>
      </div>
    </aside>
  );
}

/** Tone → hex-ish color for transparent background tinting. */
function asColor(tone: Tone): string {
  switch (tone) {
    case "urgent":
      return "#ff6b1f";
    case "easing":
      return "#6dd28e";
    case "calm":
      return "#ffd56a";
    case "quiet":
    default:
      return "#897e6b";
  }
}
