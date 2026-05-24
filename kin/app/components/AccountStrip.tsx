"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "./format";
import type { Id } from "../../convex/_generated/dataModel";

type Account = {
  _id: string;
  ownerId: Id<"people">;
  source: "td-alex" | "rbc-dana" | "tangerine-joint" | "inbox";
  institution: string;
  type: "chequing" | "savings" | "credit" | "joint" | string;
  balanceCents: bigint;
};

type Agreement = {
  _id: string;
  fromId: Id<"people">;
  toId: Id<"people">;
  status: "open" | "requested" | "settled";
  amountCents: bigint;
  fromName: string;
  toName: string;
  fromDisplayName?: string;
  toDisplayName?: string;
  reason?: string;
};

type Person = {
  _id: Id<"people">;
  name: string;
  displayName?: string;
  role?: string;
  avatarColor?: string;
};

type Props = {
  accounts: Account[];
  agreements: Agreement[];
  people: Person[];
  viewerId: Id<"people"> | null;
};

/** Highlights briefly whenever the bigint balance value changes. */
function useFlashOnChange(value: bigint): boolean {
  const prev = useRef<bigint | null>(null);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (prev.current !== null && prev.current !== value) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1200);
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value]);
  return flash;
}

/** Friendly type label. */
function typeLabel(type: string): string {
  switch (type) {
    case "chequing":
      return "Chequing";
    case "savings":
      return "Savings";
    case "joint":
      return "Joint";
    case "credit":
      return "Credit";
    default:
      return type;
  }
}

type Ownership = "yours" | "joint" | "partner" | "owed";

function ownershipFor(
  account: Account,
  viewerId: Id<"people"> | null,
): Ownership {
  if (account.type === "joint" || account.type === "savings") return "joint";
  if (viewerId && account.ownerId === viewerId) return "yours";
  return "partner";
}

const OWNERSHIP_LABEL: Record<Ownership, string> = {
  yours: "Yours",
  joint: "Shared",
  partner: "Partner",
  owed: "Owed to you",
};

function bankShortName(institution: string): string {
  // "TD Bank" → "TD", "Tangerine" stays, "RBC" stays
  const trimmed = institution.trim();
  if (/td bank/i.test(trimmed)) return "TD";
  if (/^rbc/i.test(trimmed)) return "RBC";
  if (/tangerine/i.test(trimmed)) return "Tangerine";
  return trimmed;
}

function AccountTile({
  account,
  owner,
  viewerId,
}: {
  account: Account;
  owner: Person | undefined;
  viewerId: Id<"people"> | null;
}) {
  const flash = useFlashOnChange(account.balanceCents);
  const ownership = ownershipFor(account, viewerId);
  const ownerName = owner?.displayName ?? owner?.name ?? "—";
  const isJoint = ownership === "joint";

  const dotColor =
    ownership === "yours"
      ? "#6dd28e"
      : ownership === "partner"
        ? owner?.avatarColor ?? "#7aa9ff"
        : "#ff8a4a";

  return (
    <article
      className={`kin-account-tile kin-account-${ownership} ${
        flash ? "kin-flash" : ""
      }`}
      aria-label={`${OWNERSHIP_LABEL[ownership]}: ${ownerName}'s ${typeLabel(account.type)} at ${bankShortName(account.institution)}`}
    >
      <header className="kin-account-ribbon">
        <span className="kin-account-ribbon-left">
          <span
            className="kin-account-dot"
            style={{ background: dotColor }}
            aria-hidden="true"
          />
          {OWNERSHIP_LABEL[ownership]}
        </span>
        <span className="kin-account-bank" translate="no">
          {bankShortName(account.institution)}
        </span>
      </header>

      <div
        className="kin-account-balance"
        style={{
          fontFamily: "var(--font-serif)",
          fontFeatureSettings: '"tnum"',
        }}
      >
        {formatMoney(account.balanceCents)}
      </div>

      <div className="kin-account-meta">
        <span className="kin-account-owner">
          {isJoint ? "Household" : ownerName}
        </span>
        <span aria-hidden="true" className="kin-account-meta-sep">
          ·
        </span>
        <span className="kin-account-type">
          {isJoint ? "Joint savings" : typeLabel(account.type)}
        </span>
      </div>
    </article>
  );
}

function OwedTile({
  agreement,
  viewerId,
}: {
  agreement: Agreement;
  viewerId: Id<"people"> | null;
}) {
  const flash = useFlashOnChange(agreement.amountCents);
  const isSettled = agreement.status === "settled";
  const isRequested = agreement.status === "requested";

  const viewerIsCreditor = viewerId === agreement.toId;
  const viewerIsDebtor = viewerId === agreement.fromId;

  const fromDisplay = agreement.fromDisplayName ?? agreement.fromName;
  const toDisplay = agreement.toDisplayName ?? agreement.toName;

  const ribbonLabel = isSettled
    ? "Settled"
    : viewerIsCreditor
      ? "Owed to you"
      : viewerIsDebtor
        ? "You owe"
        : "Open agreement";

  const ownerLine = isSettled
    ? `${fromDisplay} paid ${toDisplay}`
    : viewerIsCreditor
      ? `From ${fromDisplay}`
      : viewerIsDebtor
        ? `To ${toDisplay}`
        : `${fromDisplay} → ${toDisplay}`;

  const statusLabel = isSettled
    ? "Settled"
    : isRequested
      ? "Request sent"
      : "Open";
  const statusColor = isSettled
    ? "var(--kin-good)"
    : isRequested
      ? "var(--kin-amber-soft)"
      : "var(--kin-ember-soft)";

  const reason = agreement.reason
    ? agreement.reason.replace(/^./, (c) => c.toUpperCase())
    : "Inbox agreement";

  return (
    <article
      className="kin-account-tile kin-account-owed"
      style={{
        borderColor: isSettled
          ? "rgba(109, 210, 142, 0.30)"
          : "rgba(255, 138, 74, 0.30)",
        background: isSettled
          ? "linear-gradient(180deg, rgba(109, 210, 142, 0.05) 0%, rgba(109, 210, 142, 0) 100%), var(--kin-surface)"
          : "linear-gradient(180deg, rgba(255, 138, 74, 0.06) 0%, rgba(255, 138, 74, 0) 100%), var(--kin-surface)",
      }}
      aria-label={`${ribbonLabel}: ${ownerLine}, ${statusLabel}`}
    >
      <header className="kin-account-ribbon">
        <span className="kin-account-ribbon-left">
          <span
            className="kin-account-dot"
            style={{ background: statusColor }}
            aria-hidden="true"
          />
          {ribbonLabel}
        </span>
        <span className="kin-account-bank" style={{ color: statusColor }}>
          {statusLabel}
        </span>
      </header>

      <div
        className={`kin-account-balance ${flash ? "kin-flash" : ""}`}
        style={{
          fontFamily: "var(--font-serif)",
          fontFeatureSettings: '"tnum"',
        }}
      >
        {formatMoney(agreement.amountCents)}
      </div>

      <div className="kin-account-meta">
        <span className="kin-account-owner">{ownerLine}</span>
        <span aria-hidden="true" className="kin-account-meta-sep">
          ·
        </span>
        <span className="kin-account-type">{reason}</span>
      </div>
    </article>
  );
}

function AgreementBar({
  agreement,
  viewerId,
}: {
  agreement: Agreement;
  viewerId: Id<"people"> | null;
}) {
  const flash = useFlashOnChange(agreement.amountCents);
  const isSettled = agreement.status === "settled";
  const isRequested = agreement.status === "requested";
  const viewerIsCreditor = viewerId === agreement.toId;
  const viewerIsDebtor = viewerId === agreement.fromId;

  const fromDisplay = agreement.fromDisplayName ?? agreement.fromName;
  const toDisplay = agreement.toDisplayName ?? agreement.toName;

  const label = isSettled
    ? "Settled"
    : viewerIsCreditor
      ? "Owed to you"
      : viewerIsDebtor
        ? "You owe"
        : "Agreement";

  const party = isSettled
    ? `${fromDisplay} → ${toDisplay}`
    : viewerIsCreditor
      ? `From ${fromDisplay}`
      : viewerIsDebtor
        ? `To ${toDisplay}`
        : `${fromDisplay} → ${toDisplay}`;

  const reason = agreement.reason
    ? agreement.reason.replace(/^./, (c) => c.toUpperCase())
    : "Household";

  const statusLabel = isSettled ? "Settled" : isRequested ? "Request sent" : "Open";

  const accentColor = isSettled
    ? "var(--kin-good)"
    : isRequested
      ? "var(--kin-amber-soft)"
      : "var(--kin-ember-soft)";

  return (
    <div
      className="kin-agreement-bar"
      aria-label={`${label}: ${party} · ${formatMoney(agreement.amountCents)} · ${statusLabel}`}
    >
      <span
        className="kin-agreement-dot"
        style={{ background: accentColor }}
        aria-hidden="true"
      />
      <span className="kin-agreement-label" style={{ color: accentColor }}>
        {label}
      </span>
      <span className="kin-agreement-sep" aria-hidden="true">·</span>
      <span className="kin-agreement-party">{party}</span>
      <span className="kin-agreement-sep" aria-hidden="true">·</span>
      <span className="kin-agreement-reason">{reason}</span>
      <span className="kin-agreement-spacer" aria-hidden="true" />
      <span
        className={`kin-agreement-amount ${flash ? "kin-flash" : ""}`}
        style={{ fontFamily: "var(--font-serif)", color: accentColor }}
      >
        {formatMoney(agreement.amountCents)}
      </span>
      <span
        className="kin-agreement-status"
        style={{ color: accentColor }}
      >
        {statusLabel}
      </span>
    </div>
  );
}

export function AccountStrip({ accounts, agreements, people, viewerId }: Props) {
  const peopleById = new Map(people.map((p) => [p._id, p]));

  // Sort accounts: viewer's own first, then joint/savings, then partner's.
  const ownership = (a: Account): number => {
    if (a.type === "joint" || a.type === "savings") return 1;
    if (viewerId && a.ownerId === viewerId) return 0;
    return 2;
  };
  const sortedAccounts = [...accounts].sort((a, b) => ownership(a) - ownership(b));

  // Active agreement for the ledger bar below the tiles.
  const activeAgreement =
    agreements.find((a) => a.status === "open" || a.status === "requested") ??
    agreements.find((a) => a.status === "settled");

  return (
    <div>
      <div className="kin-account-strip-caption">
        <span className="kin-account-strip-eyebrow">Your household</span>
        <span className="kin-account-strip-hint">
          Cross-account visibility — Kin sees what your banks can&rsquo;t
        </span>
      </div>
      <div className="kin-account-strip">
        {sortedAccounts.map((a) => (
          <AccountTile
            key={a._id}
            account={a}
            owner={peopleById.get(a.ownerId)}
            viewerId={viewerId}
          />
        ))}
      </div>
      {activeAgreement && (
        <AgreementBar agreement={activeAgreement} viewerId={viewerId} />
      )}
    </div>
  );
}
