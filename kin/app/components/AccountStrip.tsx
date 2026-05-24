"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney, formatMoneyShort } from "./format";

type Account = {
  _id: string;
  source: "td-alex" | "rbc-dana" | "tangerine-joint" | "inbox";
  institution: string;
  type: string;
  balanceCents: bigint;
};

type Agreement = {
  _id: string;
  status: "open" | "requested" | "settled";
  amountCents: bigint;
  fromName: string;
  toName: string;
};

type SourceMeta = {
  who: string;
  bank: string;
  type: string;
  // Tailwind-safe inline color so we don't fight the JIT.
  dotColor: string;
};

const SOURCE_META: Record<Account["source"], SourceMeta> = {
  "td-alex": {
    who: "Alex",
    bank: "TD",
    type: "Chequing",
    dotColor: "#6dd28e",
  },
  "rbc-dana": {
    who: "Dana",
    bank: "RBC",
    type: "Chequing",
    dotColor: "#7aa9ff",
  },
  "tangerine-joint": {
    who: "Joint",
    bank: "Tangerine",
    type: "Savings",
    dotColor: "#ff8a4a",
  },
  inbox: { who: "Inbox", bank: "—", type: "Agreement", dotColor: "#cbbfac" },
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

function AccountTile({ account }: { account: Account }) {
  const meta = SOURCE_META[account.source];
  const flash = useFlashOnChange(account.balanceCents);

  return (
    <div
      className={`kin-card-tile relative overflow-hidden px-4 py-4 ${
        flash ? "kin-flash" : ""
      }`}
    >
      {/* Eyebrow: who + bank */}
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-kin-bone-soft">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: meta.dotColor }}
            aria-hidden="true"
          />
          {meta.who}
        </span>
        <span
          className="text-[10px] uppercase tracking-[0.18em] text-kin-bone-dim"
          translate="no"
        >
          {meta.bank}
        </span>
      </div>

      {/* The number — display serif italic. Tabular nums for alignment. */}
      <div
        className="kin-counter mt-3 text-[28px] leading-none tracking-tight text-kin-bone tabular-nums"
        style={{
          fontFamily: "var(--font-serif)",
          fontFeatureSettings: '"tnum"',
        }}
      >
        {formatMoney(account.balanceCents)}
      </div>

      {/* Type tag */}
      <div className="mt-2 text-[11px] text-kin-bone-soft">{meta.type}</div>
    </div>
  );
}

function OwedPill({ agreement }: { agreement: Agreement }) {
  const flash = useFlashOnChange(agreement.amountCents);
  const isSettled = agreement.status === "settled";
  const isRequested = agreement.status === "requested";

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

  return (
    <div
      className={`kin-card-tile relative overflow-hidden px-4 py-4 ${
        flash ? "kin-flash" : ""
      }`}
      style={{
        borderColor: isSettled
          ? "rgba(109, 210, 142, 0.25)"
          : "rgba(255, 138, 74, 0.22)",
        background: isSettled
          ? "linear-gradient(180deg, rgba(109, 210, 142, 0.06) 0%, rgba(109, 210, 142, 0) 100%), var(--kin-surface)"
          : "linear-gradient(180deg, rgba(255, 138, 74, 0.07) 0%, rgba(255, 138, 74, 0) 100%), var(--kin-surface)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-kin-bone-soft">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: statusColor }}
            aria-hidden="true"
          />
          Inbox
        </span>
        <span
          className="text-[10px] uppercase tracking-[0.18em]"
          style={{ color: statusColor }}
        >
          {statusLabel}
        </span>
      </div>

      <div
        className="mt-3 text-[28px] leading-none tracking-tight text-kin-bone tabular-nums"
        style={{
          fontFamily: "var(--font-serif)",
          fontFeatureSettings: '"tnum"',
        }}
      >
        {formatMoneyShort(agreement.amountCents)}
      </div>

      <div className="mt-2 text-[11px] text-kin-bone-soft">
        {isSettled
          ? `${agreement.fromName} paid ${agreement.toName}`
          : `${agreement.fromName} owes ${agreement.toName}`}
      </div>
    </div>
  );
}

export function AccountStrip({
  accounts,
  agreements,
}: {
  accounts: Account[];
  agreements: Agreement[];
}) {
  const alex = accounts.find((a) => a.source === "td-alex");
  const dana = accounts.find((a) => a.source === "rbc-dana");
  const joint = accounts.find((a) => a.source === "tangerine-joint");
  const ag =
    agreements.find(
      (a) =>
        a.toName === "Alex" && (a.status === "open" || a.status === "requested"),
    ) ?? agreements.find((a) => a.toName === "Alex");

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
      {alex && <AccountTile account={alex} />}
      {joint && <AccountTile account={joint} />}
      {dana && <AccountTile account={dana} />}
      {ag && <OwedPill agreement={ag} />}
    </div>
  );
}
