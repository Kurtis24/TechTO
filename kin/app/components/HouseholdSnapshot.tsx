"use client";

import { useMemo } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { formatMoney, formatMoneyShort } from "./format";

type Account = {
  _id: string;
  ownerId: Id<"people">;
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
  fromDisplayName?: string;
  toDisplayName?: string;
  fromName: string;
  toName: string;
};

type Person = {
  _id: Id<"people">;
  name: string;
  displayName?: string;
  avatarColor?: string;
};

type Props = {
  accounts: Account[];
  agreements: Agreement[];
  people: Person[];
  viewerId: Id<"people"> | null;
};

type Bucket = "yours" | "joint" | "partner";

const BUCKET_COLOR: Record<Bucket, string> = {
  yours: "#6dd28e",
  joint: "#ff8a4a",
  partner: "#7aa9ff",
};

const BUCKET_LABEL: Record<Bucket, string> = {
  yours: "Yours",
  joint: "Joint",
  partner: "Partner",
};

function bucketFor(account: Account, viewerId: Id<"people"> | null): Bucket {
  if (account.type === "joint" || account.type === "savings") return "joint";
  if (viewerId && account.ownerId === viewerId) return "yours";
  return "partner";
}

const RADIUS = 42;
const STROKE_WIDTH = 14;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
// Visual gap between adjacent slices, in path units (≈2.7° per slice gap).
const SLICE_GAP = 2;

export function HouseholdSnapshot({ accounts, agreements, people, viewerId }: Props) {
  const { totalCents, slices, accountsCount, partnerName } = useMemo(() => {
    const sums: Record<Bucket, bigint> = {
      yours: 0n,
      joint: 0n,
      partner: 0n,
    };
    const counts: Record<Bucket, number> = { yours: 0, joint: 0, partner: 0 };
    for (const a of accounts) {
      const b = bucketFor(a, viewerId);
      sums[b] += a.balanceCents;
      counts[b] += 1;
    }
    const total = sums.yours + sums.joint + sums.partner;

    // Partner's display name (first non-viewer person) — used as a small
    // sub-label on the Partner legend row so it's not just generic.
    const partnerPerson = viewerId
      ? people.find((p) => p._id !== viewerId)
      : null;

    const order: Bucket[] = ["yours", "joint", "partner"];
    const built: Array<{
      key: Bucket;
      cents: bigint;
      count: number;
      sliceLen: number;
      accStart: number;
    }> = [];
    let accStart = 0;
    for (const key of order) {
      const cents = sums[key];
      if (cents <= 0n) continue;
      const share = total === 0n ? 0 : Number(cents) / Number(total);
      const sliceLen = share * CIRCUMFERENCE;
      built.push({ key, cents, count: counts[key], sliceLen, accStart });
      accStart += sliceLen;
    }

    return {
      totalCents: total,
      slices: built,
      accountsCount: accounts.length,
      partnerName: partnerPerson?.displayName ?? partnerPerson?.name ?? null,
    };
  }, [accounts, viewerId, people]);

  // Active agreement for the sub-stat row — prefer open/requested over settled.
  const activeAgreement = useMemo(() => {
    return (
      agreements.find((a) => a.status === "open" || a.status === "requested") ??
      agreements.find((a) => a.status === "settled") ??
      null
    );
  }, [agreements]);

  const ariaSummary = useMemo(() => {
    const parts = slices.map(
      (s) => `${BUCKET_LABEL[s.key]} ${formatMoneyShort(s.cents)}`,
    );
    return `${formatMoney(totalCents)} household total across ${accountsCount} account${accountsCount === 1 ? "" : "s"}: ${parts.join(", ")}.`;
  }, [slices, totalCents, accountsCount]);

  return (
    <section className="kin-snapshot" aria-label="Household balance snapshot">
      <header className="kin-snapshot-eyebrow">
        <span className="kin-snapshot-eyebrow-label">Household · by the numbers</span>
        <span className="kin-snapshot-eyebrow-hint">
          {accountsCount} account{accountsCount === 1 ? "" : "s"} · net liquid
        </span>
      </header>

      <div className="kin-snapshot-body">
        <div className="kin-snapshot-donut-wrap">
          <svg
            viewBox="0 0 100 100"
            className="kin-snapshot-donut"
            role="img"
            aria-label={ariaSummary}
          >
            {/* Track — full ring at low contrast */}
            <circle
              cx="50"
              cy="50"
              r={RADIUS}
              strokeWidth={STROKE_WIDTH}
              className="kin-snapshot-track"
            />
            {slices.map((s, i) => {
              // Shrink the visible stroke by SLICE_GAP so adjacent slices
              // have a small breathing gap. The next slice still starts
              // at accStart + sliceLen, so the gap shows cleanly.
              const visibleLen = Math.max(0, s.sliceLen - SLICE_GAP);
              return (
                <circle
                  key={s.key}
                  cx="50"
                  cy="50"
                  r={RADIUS}
                  strokeWidth={STROKE_WIDTH}
                  stroke={BUCKET_COLOR[s.key]}
                  strokeDasharray={`${visibleLen} ${CIRCUMFERENCE - visibleLen}`}
                  strokeDashoffset={-s.accStart}
                  className="kin-snapshot-slice"
                  style={
                    {
                      ["--kin-slice-delay"]: `${i * 130}ms`,
                      color: BUCKET_COLOR[s.key],
                    } as React.CSSProperties
                  }
                />
              );
            })}
          </svg>
          <div className="kin-snapshot-center" aria-hidden="true">
            <div className="kin-snapshot-center-inner">
              <span className="kin-snapshot-center-eyebrow">Household</span>
              <span className="kin-snapshot-center-amount">
                {formatMoneyShort(totalCents)}
              </span>
            </div>
          </div>
        </div>

        <div className="kin-snapshot-meta">
          <div className="kin-snapshot-legend" role="list">
            {slices.map((s) => {
              const share =
                totalCents === 0n
                  ? 0
                  : Math.round((Number(s.cents) / Number(totalCents)) * 100);
              const sub =
                s.key === "partner" && partnerName
                  ? partnerName
                  : `${s.count} ${s.count === 1 ? "account" : "accounts"}`;
              return (
                <div
                  key={s.key}
                  className="kin-snapshot-legend-row"
                  role="listitem"
                >
                  <span
                    className="kin-snapshot-legend-dot"
                    style={{ background: BUCKET_COLOR[s.key] }}
                    aria-hidden="true"
                  />
                  <span className="kin-snapshot-legend-label">
                    {BUCKET_LABEL[s.key]}
                    <span className="kin-snapshot-legend-label-sub">{sub}</span>
                  </span>
                  <span className="kin-snapshot-legend-amount">
                    {formatMoneyShort(s.cents)}
                    <span className="kin-snapshot-legend-share">{share}%</span>
                  </span>
                </div>
              );
            })}
          </div>

          {activeAgreement && (
            <AgreementStat agreement={activeAgreement} viewerId={viewerId} />
          )}
        </div>
      </div>

      {/* AT-only data table mirroring the donut */}
      <dl className="kin-sr-only">
        {slices.map((s) => (
          <div key={`sr-${s.key}`}>
            <dt>{BUCKET_LABEL[s.key]}</dt>
            <dd>{formatMoney(s.cents)}</dd>
          </div>
        ))}
        <div>
          <dt>Total</dt>
          <dd>{formatMoney(totalCents)}</dd>
        </div>
      </dl>
    </section>
  );
}

function AgreementStat({
  agreement,
  viewerId,
}: {
  agreement: Agreement;
  viewerId: Id<"people"> | null;
}) {
  const isSettled = agreement.status === "settled";
  const isRequested = agreement.status === "requested";
  const viewerIsCreditor = viewerId === agreement.toId;
  const viewerIsDebtor = viewerId === agreement.fromId;

  const label = isSettled
    ? "Last agreement"
    : viewerIsCreditor
      ? "Owed to you"
      : viewerIsDebtor
        ? "You owe"
        : "Open agreement";

  const tag = isSettled
    ? "Settled"
    : isRequested
      ? "Requested"
      : "Open";

  const valueClass = isSettled
    ? "kin-snapshot-substat-value-good"
    : isRequested
      ? "kin-snapshot-substat-value-warn"
      : "kin-snapshot-substat-value-ember";

  return (
    <div className="kin-snapshot-substat">
      <span className="kin-snapshot-substat-label">{label}</span>
      <span className={`kin-snapshot-substat-value ${valueClass}`}>
        {formatMoneyShort(agreement.amountCents)}
        <span className="kin-snapshot-substat-tag">{tag}</span>
      </span>
    </div>
  );
}
