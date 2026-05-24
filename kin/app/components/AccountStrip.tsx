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

const SOURCE_META: Record<
  Account["source"],
  { label: string; sub: string; ring: string }
> = {
  "td-alex": {
    label: "Alex · TD chequing",
    sub: "td-alex.bank",
    ring: "ring-emerald-200",
  },
  "rbc-dana": {
    label: "Dana · RBC chequing",
    sub: "rbc-dana.bank",
    ring: "ring-blue-200",
  },
  "tangerine-joint": {
    label: "Joint · Tangerine",
    sub: "tangerine-joint.savings",
    ring: "ring-orange-200",
  },
  inbox: { label: "Inbox", sub: "—", ring: "ring-zinc-200" },
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
      className={`rounded-xl border border-zinc-200 bg-white px-4 py-3 ring-1 ${meta.ring} ${
        flash ? "kin-flash" : ""
      }`}
    >
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">
        {meta.label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums kin-counter">
        {formatMoney(account.balanceCents)}
      </div>
    </div>
  );
}

function OwedPill({ agreement }: { agreement: Agreement }) {
  const flash = useFlashOnChange(agreement.amountCents);
  const isSettled = agreement.status === "settled";
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        isSettled
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-amber-200 bg-amber-50 text-amber-900"
      } ${flash ? "kin-flash" : ""}`}
    >
      <div className="text-[11px] uppercase tracking-wide opacity-75">
        Inbox · Agreement
      </div>
      <div className="mt-1 text-sm font-medium tabular-nums">
        {isSettled
          ? `Settled — Dana paid ${formatMoneyShort(agreement.amountCents)}`
          : agreement.status === "requested"
            ? `${agreement.fromName} owes ${agreement.toName} ${formatMoneyShort(agreement.amountCents)} · request sent`
            : `${agreement.fromName} owes ${agreement.toName} ${formatMoneyShort(agreement.amountCents)}`}
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
  const ag = agreements.find(
    (a) => a.toName === "Alex" && (a.status === "open" || a.status === "requested")
  ) ?? agreements.find((a) => a.toName === "Alex");

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {alex && <AccountTile account={alex} />}
      {joint && <AccountTile account={joint} />}
      {dana && <AccountTile account={dana} />}
      {ag && <OwedPill agreement={ag} />}
    </div>
  );
}
