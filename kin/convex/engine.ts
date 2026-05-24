/**
 * Detection engine — reads seeded data and writes `cards` to the feed.
 *
 * Pure, testable Convex mutations. One engine, multiple card types:
 * - overdraft: 7-day balance forecast detects rent shortfall
 * - duplicate: same merchant + amount in a short window
 * - creep: subscription history[] trending upward
 * - outlier: transaction far outside per-account normal distribution
 *
 * Also exposes a baseline summary (typical inflows/outflows/cadence)
 * suitable for storing in Backboard memory.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

// ─── Constants ───────────────────────────────────────────────────────────────

const DAY = 86_400_000;

// ─── Pure math helpers (exported for testing) ────────────────────────────────

/** Mean of bigint array (returns number cents). */
export function mean(values: bigint[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, BigInt(0));
  return Number(sum) / values.length;
}

/** Standard deviation of bigint array (returns number cents). */
export function stddev(values: bigint[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squareDiffs = values.map((v) => {
    const diff = Number(v) - avg;
    return diff * diff;
  });
  const avgSquareDiff =
    squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
  return Math.sqrt(avgSquareDiff);
}

/** Check if a value is an outlier (> N standard deviations from mean). */
export function isOutlier(
  value: bigint,
  values: bigint[],
  threshold = 2.5
): boolean {
  const sd = stddev(values);
  if (sd === 0) return false;
  const avg = mean(values);
  return Math.abs(Number(value) - avg) > threshold * sd;
}

// ─── Baseline computation ────────────────────────────────────────────────────

type RecurringPattern = {
  merchant: string;
  amountCents: number;
  cadence: "biweekly" | "monthly";
  typicalDay: number; // day of month
};

type BaselineSummary = {
  accountId: string;
  institution: string;
  monthlyInflowCents: number;
  monthlyOutflowCents: number;
  recurringDebits: RecurringPattern[];
  recurringCredits: RecurringPattern[];
  avgTransactionCents: number;
  stddevCents: number;
  textSummary: string;
};

/**
 * Compute baseline from transactions. Pure function — takes data, returns summary.
 */
export function computeBaseline(
  account: { _id: string; institution: string; balanceCents: bigint },
  transactions: {
    merchant: string;
    amountCents: bigint;
    date: number;
    recurring: boolean;
    category: string;
  }[]
): BaselineSummary {
  const now = Date.now();
  const threeMonthsAgo = now - 90 * DAY;

  // Filter to last 3 months, exclude opening balance
  const recent = transactions.filter(
    (t) => t.date >= threeMonthsAgo && t.merchant !== "Opening Balance"
  );

  // Separate inflows/outflows
  const inflows = recent.filter((t) => t.amountCents > BigInt(0));
  const outflows = recent.filter((t) => t.amountCents < BigInt(0));

  // Monthly totals (divide by 3 months)
  const totalIn = inflows.reduce((s, t) => s + Number(t.amountCents), 0);
  const totalOut = outflows.reduce(
    (s, t) => s + Math.abs(Number(t.amountCents)),
    0
  );
  const monthlyInflow = Math.round(totalIn / 3);
  const monthlyOutflow = Math.round(totalOut / 3);

  // Find recurring patterns
  const recurringTxns = recent.filter((t) => t.recurring);
  const merchantGroups = new Map<
    string,
    { amounts: bigint[]; dates: number[]; isInflow: boolean }
  >();

  for (const t of recurringTxns) {
    const key = t.merchant;
    if (!merchantGroups.has(key)) {
      merchantGroups.set(key, {
        amounts: [],
        dates: [],
        isInflow: t.amountCents > BigInt(0),
      });
    }
    const g = merchantGroups.get(key)!;
    g.amounts.push(t.amountCents);
    g.dates.push(t.date);
  }

  const recurringDebits: RecurringPattern[] = [];
  const recurringCredits: RecurringPattern[] = [];

  for (const [merchant, group] of merchantGroups) {
    if (group.amounts.length < 2) continue;
    const avgAmount = Math.round(mean(group.amounts));
    const days = group.dates.map((d) => new Date(d).getDate());
    const typicalDay = days[Math.floor(days.length / 2)];

    // Detect cadence: biweekly vs monthly
    const gaps = group.dates
      .sort((a, b) => a - b)
      .slice(1)
      .map((d, i) => d - group.dates[i]);
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const cadence: "biweekly" | "monthly" =
      avgGap < 20 * DAY ? "biweekly" : "monthly";

    const pattern: RecurringPattern = {
      merchant,
      amountCents: avgAmount,
      cadence,
      typicalDay,
    };

    if (group.isInflow) {
      recurringCredits.push(pattern);
    } else {
      recurringDebits.push(pattern);
    }
  }

  // Stats for outlier detection
  const allAmounts = recent
    .filter((t) => t.amountCents < BigInt(0))
    .map((t) => t.amountCents);
  const avg = mean(allAmounts);
  const sd = stddev(allAmounts);

  // Text summary for Backboard memory
  const debitList = recurringDebits
    .map(
      (r) =>
        `${r.merchant} $${(Math.abs(r.amountCents) / 100).toFixed(2)} ${r.cadence} (~day ${r.typicalDay})`
    )
    .join("; ");
  const textSummary = [
    `Account: ${account.institution} | Balance: $${(Number(account.balanceCents) / 100).toFixed(2)}`,
    `Monthly inflow: ~$${(monthlyInflow / 100).toFixed(0)} | Monthly outflow: ~$${(monthlyOutflow / 100).toFixed(0)}`,
    `Recurring debits: ${debitList || "none detected"}`,
    `Recurring credits: ${recurringCredits.map((r) => `${r.merchant} $${(r.amountCents / 100).toFixed(2)} ${r.cadence}`).join("; ") || "none"}`,
    `Typical debit: $${(Math.abs(avg) / 100).toFixed(0)} ± $${(sd / 100).toFixed(0)}`,
  ].join("\n");

  return {
    accountId: account._id,
    institution: account.institution,
    monthlyInflowCents: monthlyInflow,
    monthlyOutflowCents: monthlyOutflow,
    recurringDebits,
    recurringCredits,
    avgTransactionCents: Math.round(avg),
    stddevCents: Math.round(sd),
    textSummary,
  };
}

// ─── Overdraft forecast ──────────────────────────────────────────────────────

type OverdraftResult = {
  willOverdraft: boolean;
  projectedLowCents: number;
  shortfallCents: number;
  causeDate: number;
  causeMerchant: string;
  projections: { date: number; balanceCents: number; label: string }[];
};

/**
 * Project balance forward 7 days using known recurring debits/credits.
 * Pure function — takes current balance + baseline, returns forecast.
 */
export function forecastOverdraft(
  balanceCents: bigint,
  baseline: BaselineSummary,
  nowMs: number = Date.now()
): OverdraftResult {
  const projections: { date: number; balanceCents: number; label: string }[] =
    [];
  let runningBalance = Number(balanceCents);
  let lowestBalance = runningBalance;
  let causeMerchant = "";
  let causeDate = 0;

  projections.push({
    date: nowMs,
    balanceCents: runningBalance,
    label: "today",
  });

  // For each of the next 7 days, check if a recurring debit/credit fires
  for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
    const targetDate = new Date(nowMs + dayOffset * DAY);
    const dayOfMonth = targetDate.getDate();
    const dayOfWeek = targetDate.getDay(); // 0=Sun, 6=Sat

    // Check recurring debits
    for (const debit of baseline.recurringDebits) {
      let fires = false;

      if (debit.cadence === "monthly" && debit.typicalDay === dayOfMonth) {
        fires = true;
      }
      // Biweekly: check if this is roughly 14 days from a known payday
      if (debit.cadence === "biweekly" && dayOfWeek === 5) {
        // Fridays only for biweekly — heuristic
        fires = true;
      }

      if (fires) {
        runningBalance += debit.amountCents; // amountCents is negative for debits
        projections.push({
          date: targetDate.getTime(),
          balanceCents: runningBalance,
          label: debit.merchant,
        });

        if (runningBalance < lowestBalance) {
          lowestBalance = runningBalance;
          causeMerchant = debit.merchant;
          causeDate = targetDate.getTime();
        }
      }
    }

    // Check recurring credits
    for (const credit of baseline.recurringCredits) {
      let fires = false;
      if (credit.cadence === "monthly" && credit.typicalDay === dayOfMonth) {
        fires = true;
      }
      if (credit.cadence === "biweekly" && dayOfWeek === 5) {
        fires = true;
      }
      if (fires) {
        runningBalance += credit.amountCents;
        projections.push({
          date: targetDate.getTime(),
          balanceCents: runningBalance,
          label: credit.merchant,
        });
      }
    }
  }

  const willOverdraft = lowestBalance < 0;
  const shortfallCents = willOverdraft ? Math.abs(lowestBalance) : 0;

  return {
    willOverdraft,
    projectedLowCents: lowestBalance,
    shortfallCents,
    causeDate,
    causeMerchant,
    projections,
  };
}

// ─── Anomaly detection (pure functions) ──────────────────────────────────────

type DuplicateHit = {
  merchant: string;
  amountCents: bigint;
  dates: number[];
};

/**
 * Find duplicate charges: same merchant + same amount within `windowDays`.
 */
export function detectDuplicates(
  transactions: { merchant: string; amountCents: bigint; date: number }[],
  windowDays = 3
): DuplicateHit[] {
  const windowMs = windowDays * DAY;
  const duplicates: DuplicateHit[] = [];
  const seen = new Set<string>();

  // Sort by date
  const sorted = [...transactions].sort((a, b) => a.date - b.date);

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    const key = `${t.merchant}|${t.amountCents}`;
    if (seen.has(key)) continue;

    const matches = sorted.filter(
      (other, j) =>
        j !== i &&
        other.merchant === t.merchant &&
        other.amountCents === t.amountCents &&
        Math.abs(other.date - t.date) <= windowMs
    );

    if (matches.length > 0) {
      duplicates.push({
        merchant: t.merchant,
        amountCents: t.amountCents,
        dates: [t.date, ...matches.map((m) => m.date)].sort(),
      });
      seen.add(key);
    }
  }
  return duplicates;
}

type CreepHit = {
  merchant: string;
  startCents: bigint;
  currentCents: bigint;
  increasePct: number;
  history: { date: number; amountCents: bigint }[];
};

/**
 * Detect subscriptions whose price has crept upward.
 * Requires at least 2 history entries with price increase.
 */
export function detectCreep(
  subscriptions: {
    merchant: string;
    amountCents: bigint;
    history: { date: number; amountCents: bigint }[];
  }[]
): CreepHit[] {
  const hits: CreepHit[] = [];

  for (const sub of subscriptions) {
    if (sub.history.length < 2) continue;
    const sorted = [...sub.history].sort((a, b) => a.date - b.date);
    const first = sorted[0].amountCents;
    const last = sorted[sorted.length - 1].amountCents;

    if (last > first) {
      const increasePct =
        Number(((last - first) * BigInt(10000)) / first) / 100;
      hits.push({
        merchant: sub.merchant,
        startCents: first,
        currentCents: last,
        increasePct,
        history: sorted,
      });
    }
  }
  return hits;
}

type OutlierHit = {
  merchant: string;
  amountCents: bigint;
  date: number;
  zScore: number;
};

/**
 * Find transactions that are statistical outliers (z-score > threshold).
 * Only considers outflows (negative amounts).
 */
export function detectOutliers(
  transactions: { merchant: string; amountCents: bigint; date: number }[],
  threshold = 2.5
): OutlierHit[] {
  // Only look at outflows, exclude "Opening Balance"
  const outflows = transactions.filter(
    (t) => t.amountCents < BigInt(0) && t.merchant !== "Opening Balance"
  );
  if (outflows.length < 5) return [];

  const amounts = outflows.map((t) => t.amountCents);
  const avg = mean(amounts);
  const sd = stddev(amounts);
  if (sd === 0) return [];

  const hits: OutlierHit[] = [];
  for (const t of outflows) {
    const zScore = Math.abs(Number(t.amountCents) - avg) / sd;
    if (zScore > threshold) {
      hits.push({
        merchant: t.merchant,
        amountCents: t.amountCents,
        date: t.date,
        zScore,
      });
    }
  }
  return hits;
}

// ─── Convex mutation: run full detection engine ──────────────────────────────

export const runDetection = mutation({
  args: {
    accountId: v.optional(v.id("accounts")),
  },
  handler: async (ctx, { accountId }) => {
    const now = Date.now();
    const results = {
      baselines: [] as BaselineSummary[],
      overdrafts: 0,
      duplicates: 0,
      creeps: 0,
      outliers: 0,
      cardsWritten: 0,
    };

    // Idempotent: wipe existing engine-written cards so re-running the
    // detector doesn't pile up duplicates. Leaves `info` cards (stored
    // decisions) alone.
    const existing = await ctx.db.query("cards").collect();
    for (const c of existing) {
      if (
        c.type === "overdraft" ||
        c.type === "duplicate" ||
        c.type === "creep" ||
        c.type === "outlier"
      ) {
        await ctx.db.delete(c._id);
      }
    }

    // Get target accounts
    let accounts: Doc<"accounts">[];
    if (accountId) {
      const acct = await ctx.db.get(accountId);
      accounts = acct ? [acct] : [];
    } else {
      accounts = await ctx.db.query("accounts").collect();
    }

    for (const account of accounts) {
      // Fetch all transactions for this account
      const transactions = await ctx.db
        .query("transactions")
        .withIndex("by_account", (q) => q.eq("accountId", account._id))
        .collect();

      // ── 1. Compute baseline ──────────────────────────────────────────
      const baseline = computeBaseline(account, transactions);
      results.baselines.push(baseline);

      // ── 2. Overdraft forecast ────────────────────────────────────────
      const forecast = forecastOverdraft(account.balanceCents, baseline, now);

      if (forecast.willOverdraft) {
        results.overdrafts++;

        // Find relevant remedies
        const agreements = await ctx.db
          .query("agreements")
          .withIndex("by_status", (q) => q.eq("status", "open"))
          .collect();

        const jointAccounts = await ctx.db
          .query("accounts")
          .collect()
          .then((all) =>
            all.filter(
              (a) =>
                (a.type === "joint" || a.type === "savings") &&
                a._id !== account._id
            )
          );

        // Build actions
        const actions: {
          id: string;
          label: string;
          kind: string;
          params: Record<string, unknown>;
        }[] = [];

        // Can we cover from savings?
        const savingsOption = jointAccounts.find(
          (a) => Number(a.balanceCents) >= forecast.shortfallCents
        );
        if (savingsOption) {
          const moveAmount = Math.min(
            Math.ceil(forecast.shortfallCents / 10000) * 10000, // round up to nearest $100
            Number(savingsOption.balanceCents)
          );
          actions.push({
            id: "move-from-savings",
            label: `Move $${(moveAmount / 100).toFixed(0)} from savings`,
            kind: "move_money",
            params: {
              fromAccountId: savingsOption._id,
              toAccountId: account._id,
              amountCents: moveAmount,
            },
          });
        }

        // Is there an open agreement that could help?
        if (agreements.length > 0) {
          const relevantAgreement = agreements[0]; // take the first open one
          actions.push({
            id: "request-owed-funds",
            label: `Send e-Transfer request ($${(Number(relevantAgreement.amountCents) / 100).toFixed(0)} owed)`,
            kind: "send_etransfer_request",
            params: {
              agreementId: relevantAgreement._id,
              fromId: relevantAgreement.fromId,
              amountCents: Number(relevantAgreement.amountCents),
              reason: relevantAgreement.reason,
            },
          });
        }

        // Both option
        if (actions.length === 2) {
          actions.push({
            id: "both",
            label: "Do both: savings + request",
            kind: "both",
            params: {
              moveAction: actions[0].params,
              requestAction: actions[1].params,
            },
          });
        }

        // Write the card
        await ctx.db.insert("cards", {
          type: "overdraft",
          severity: "critical",
          title: `Overdraft risk: ${forecast.causeMerchant} in ${Math.ceil((forecast.causeDate - now) / DAY)} days`,
          body: [
            `Balance: $${(Number(account.balanceCents) / 100).toFixed(2)}`,
            `${forecast.causeMerchant} ($${(Math.abs(forecast.projections.find((p) => p.label === forecast.causeMerchant)?.balanceCents ?? 0) / 100).toFixed(2)} debit) hits ${new Date(forecast.causeDate).toLocaleDateString("en-CA")}.`,
            `Projected shortfall: -$${(forecast.shortfallCents / 100).toFixed(2)}`,
            agreements.length > 0
              ? `\nNote: Dana owes $${(Number(agreements[0].amountCents) / 100).toFixed(0)} (${agreements[0].reason}).`
              : "",
            savingsOption
              ? `Joint savings has $${(Number(savingsOption.balanceCents) / 100).toFixed(2)} available.`
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
          actions,
          status: "open",
          createdAt: now,
        });
        results.cardsWritten++;
      }

      // ── 3. Duplicate detection ───────────────────────────────────────
      const duplicates = detectDuplicates(transactions);
      for (const dup of duplicates) {
        results.duplicates++;
        const dates = dup.dates.map((d) =>
          new Date(d).toLocaleDateString("en-CA")
        );
        await ctx.db.insert("cards", {
          type: "duplicate",
          severity: "warn",
          title: `Possible duplicate: ${dup.merchant}`,
          body: `${dup.merchant} charged $${(Math.abs(Number(dup.amountCents)) / 100).toFixed(2)} on ${dates.join(" and ")}. Same amount, ${dup.dates.length} times in ${Math.ceil((dup.dates[dup.dates.length - 1] - dup.dates[0]) / DAY)} day(s).`,
          actions: [
            {
              id: "dispute",
              label: "Flag as duplicate & dispute",
              kind: "dispute_charge",
              params: {
                merchant: dup.merchant,
                amountCents: Number(dup.amountCents),
                dates: dup.dates,
              },
            },
            {
              id: "ignore",
              label: "Not a duplicate — ignore",
              kind: "dismiss",
              params: {},
            },
          ],
          status: "open",
          createdAt: now,
        });
        results.cardsWritten++;
      }

      // ── 4. Outlier detection ─────────────────────────────────────────
      const outliers = detectOutliers(transactions);
      for (const hit of outliers) {
        results.outliers++;
        await ctx.db.insert("cards", {
          type: "outlier",
          severity: "warn",
          title: `Unusual charge: ${hit.merchant}`,
          body: `$${(Math.abs(Number(hit.amountCents)) / 100).toFixed(2)} at ${hit.merchant} on ${new Date(hit.date).toLocaleDateString("en-CA")}. This is ${hit.zScore.toFixed(1)}σ above your typical spending.`,
          actions: [
            {
              id: "investigate",
              label: "Flag for review",
              kind: "flag_review",
              params: {
                merchant: hit.merchant,
                amountCents: Number(hit.amountCents),
                date: hit.date,
              },
            },
            {
              id: "expected",
              label: "Expected — dismiss",
              kind: "dismiss",
              params: {},
            },
          ],
          status: "open",
          createdAt: now,
        });
        results.cardsWritten++;
      }
    }

    // ── 5. Subscription creep (across all subscriptions) ───────────────
    const subscriptions = await ctx.db.query("subscriptions").collect();
    const creepHits = detectCreep(subscriptions);
    for (const hit of creepHits) {
      results.creeps++;
      await ctx.db.insert("cards", {
        type: "creep",
        severity: "warn",
        title: `Price creep: ${hit.merchant}`,
        body: `${hit.merchant} went from $${(Number(hit.startCents) / 100).toFixed(2)} → $${(Number(hit.currentCents) / 100).toFixed(2)} (+${hit.increasePct.toFixed(0)}%) over ${hit.history.length} billing cycles.`,
        actions: [
          {
            id: "cancel",
            label: `Cancel ${hit.merchant}`,
            kind: "cancel_subscription",
            params: { merchant: hit.merchant },
          },
          {
            id: "keep",
            label: "Acknowledge — keep it",
            kind: "dismiss",
            params: {},
          },
        ],
        status: "open",
        createdAt: now,
      });
      results.cardsWritten++;
    }

    // ── 6. Family tax-strategy opportunities ───────────────────────────
    // Cross-source signal: only Kin can see both partners' incomes + the joint
    // savings, so only Kin can spot income-split opportunities the banks miss.
    // We surface ONE card with a structured list of strategies. Educational —
    // not advice. The card itself includes a "talk to an accountant" reminder.
    if (!accountId) {
      try {
        const taxOpp = await detectTaxOpportunities(ctx);
        if (taxOpp && taxOpp.strategies.length > 0) {
          await ctx.db.insert("cards", {
            type: "tax_loop",
            severity: "info",
            title: `Family tax strategies — ~${dollarsRound(taxOpp.estAnnualSavingsCents)}/yr opportunity`,
            body: taxOpp.summary,
            actions: [
              ...taxOpp.strategies.map((s) => ({
                id: s.id,
                label: s.title,
                kind: "tax_strategy",
                params: {
                  blurb: s.blurb,
                  estSavingsCents: s.estSavingsCents,
                  craRef: s.craRef,
                  applies: s.applies,
                },
              })),
              {
                id: "explored",
                label: "Mark as explored",
                kind: "dismiss",
                params: {},
              },
            ],
            status: "open",
            createdAt: now,
          });
          results.cardsWritten++;
        }
      } catch (e) {
        console.error("tax opportunity detector failed (non-fatal):", e);
      }
    }

    return results;
  },
});

// ─── Tax-opportunity detection (pure-ish; reads db) ──────────────────────────
// Identifies legitimate Canadian household tax-saving strategies based on the
// couple's income gap, joint-savings shape, and demographics.
// NOT TAX ADVICE — explanatory content only. Real moves should be vetted by
// an accountant; CRA attribution rules + lifetime contribution rooms apply.

function dollarsRound(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-CA")}`;
}

type TaxStrategy = {
  id: string;
  title: string;
  blurb: string;
  estSavingsCents: number;
  craRef: string;
  applies: string; // why it applies to this household
};

type TaxOpportunity = {
  summary: string;
  estAnnualSavingsCents: number;
  strategies: TaxStrategy[];
};

async function detectTaxOpportunities(ctx: {
  db: {
    query: (t: "people" | "accounts" | "transactions") => {
      collect: () => Promise<unknown[]>;
    };
  };
}): Promise<TaxOpportunity | null> {
  const people = (await ctx.db.query("people").collect()) as {
    _id: string;
    name: string;
    role: string;
  }[];
  const accounts = (await ctx.db.query("accounts").collect()) as {
    _id: string;
    ownerId: string;
    type: string;
    balanceCents: bigint;
  }[];
  const txns = (await ctx.db.query("transactions").collect()) as {
    accountId: string;
    amountCents: bigint;
    category: string;
    date: number;
  }[];

  if (people.length < 2) return null;

  // Estimate annualized income per person from inflow txns over the last 90d.
  const ninetyDaysAgo = Date.now() - 90 * DAY;
  const acctOwner = new Map(accounts.map((a) => [a._id, a.ownerId]));
  const incomeByPerson = new Map<string, number>();
  for (const t of txns) {
    if (t.amountCents <= BigInt(0)) continue;
    if (t.date < ninetyDaysAgo) continue;
    if (t.category !== "income") continue;
    const ownerId = acctOwner.get(t.accountId);
    if (!ownerId) continue;
    incomeByPerson.set(
      ownerId,
      (incomeByPerson.get(ownerId) ?? 0) + Number(t.amountCents),
    );
  }
  // 90d → annual
  for (const [k, v] of incomeByPerson) {
    incomeByPerson.set(k, Math.round(v * (365 / 90)));
  }

  // Pick the highest + lowest earner
  const ranked = [...people]
    .map((p) => ({
      ...p,
      annualIncomeCents: incomeByPerson.get(p._id) ?? 0,
    }))
    .sort((a, b) => b.annualIncomeCents - a.annualIncomeCents);
  const high = ranked[0];
  const low = ranked[ranked.length - 1];
  if (high.annualIncomeCents === 0 || low.annualIncomeCents === 0) return null;
  const gapCents = high.annualIncomeCents - low.annualIncomeCents;
  // Skip if both earn the same.
  if (gapCents <= 0) return null;

  // Marginal-rate spread (Ontario, demo-grade approximation):
  //   $80k–95k → ~30%, $50k–75k → ~29.65%, ~25% in retirement.
  // Spread = ~5 cents on the dollar of shifted income on average.
  const marginalSpread = 0.05;

  const jointSavings = accounts.find(
    (a) => a.type === "joint" || a.type === "savings",
  );
  const jointBalanceCents = jointSavings ? Number(jointSavings.balanceCents) : 0;

  const strategies: TaxStrategy[] = [];

  // 1. Spousal RRSP — always relevant when there's a gap.
  const rrspContribSuggestion = Math.min(500000, Math.round(high.annualIncomeCents * 0.06));
  const rrspSavings = Math.round(rrspContribSuggestion * marginalSpread);
  strategies.push({
    id: "spousal-rrsp",
    title: "Spousal RRSP",
    blurb: `${high.name} contributes to ${low.name}'s RRSP. ${high.name} gets the deduction at their higher rate now; ${low.name} withdraws at a lower rate later. The contribution still uses ${high.name}'s contribution room.`,
    estSavingsCents: rrspSavings,
    craRef: "Spousal RRSPs (CRA T4040)",
    applies: `Income gap of ${dollarsRound(gapCents)}/yr between ${high.name} and ${low.name}.`,
  });

  // 2. TFSA contribution gift — tax-free growth, no attribution back.
  // Assume gifting $7K annually to fill low's TFSA room.
  // Estimate ~5% return, growth tax-free; counterfactual is high earner
  // investing same money in non-registered → ~50% of return taxed at high rate.
  // Demo savings: 5% × 7k × 30% × 0.5 ≈ $52/yr (small, so we mention long horizon).
  const tfsaSavings = Math.round(700000 * 0.05 * 0.30 * 0.5);
  strategies.push({
    id: "tfsa-gift",
    title: "TFSA contribution gift",
    blurb: `${high.name} gifts up to ${dollarsRound(700000)}/yr to ${low.name} to fill ${low.name}'s TFSA. CRA's attribution rules don't follow income earned inside a TFSA — every dollar of growth is ${low.name}'s, tax-free.`,
    estSavingsCents: tfsaSavings,
    craRef: "TFSA attribution exception (ITA 74.5(12))",
    applies: `Both partners have separate TFSA contribution rooms (~${dollarsRound(700000)}/yr each).`,
  });

  // 3. Joint-savings titling
  if (jointBalanceCents > 100000) {
    // 4% interest, tax shifted from high (30%) to low (25%) = ~5% savings
    const interestCents = Math.round(jointBalanceCents * 0.04);
    const titlingSavings = Math.round(interestCents * marginalSpread);
    strategies.push({
      id: "joint-titling",
      title: "Joint savings titling",
      blurb: `Interest on a joint account is taxed in proportion to who funded it. If ${low.name} contributed most of the joint savings, ensure ${low.name}'s name is the primary holder — interest gets taxed at the lower marginal rate.`,
      estSavingsCents: titlingSavings,
      craRef: "Attribution rules — beneficial ownership (CRA Folio S1-F5-C1)",
      applies: `Joint savings balance: ${dollarsRound(jointBalanceCents)}.`,
    });
  }

  // 4. Prescribed-rate loan — gets nuanced; mention only when joint $ is meaningful.
  if (jointBalanceCents >= 1000000) {
    strategies.push({
      id: "prescribed-loan",
      title: "Prescribed-rate spousal loan",
      blurb: `${high.name} formally loans investing capital to ${low.name} at CRA's prescribed rate (currently ~5%). Investment returns above the rate are ${low.name}'s — taxed at their lower rate. Requires a written promissory note + interest paid yearly by Jan 30.`,
      estSavingsCents: Math.round(jointBalanceCents * 0.03 * marginalSpread),
      craRef: "Prescribed rate loans (ITA 74.5(2))",
      applies: `Worth considering once joint savings is ≥${dollarsRound(1000000)}.`,
    });
  }

  const total = strategies.reduce((s, x) => s + x.estSavingsCents, 0);

  return {
    summary: `Kin sees both incomes (${high.name} ~${dollarsRound(high.annualIncomeCents)}/yr, ${low.name} ~${dollarsRound(low.annualIncomeCents)}/yr) and your joint savings — a ${dollarsRound(gapCents)}/yr gap opens a few legitimate income-splitting moves your bank can't spot. ${strategies.length} strategies below. Educational only — confirm with an accountant before acting; CRA attribution rules + contribution rooms apply.`,
    estAnnualSavingsCents: total,
    strategies,
  };
}

// ─── Query: get computed baseline for an account ─────────────────────────────

export const getBaseline = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, { accountId }) => {
    const account = await ctx.db.get(accountId);
    if (!account) return null;

    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .collect();

    return computeBaseline(account, transactions);
  },
});

// ─── Query: forecast only (no card writes) ───────────────────────────────────

export const getForecast = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, { accountId }) => {
    const account = await ctx.db.get(accountId);
    if (!account) return null;

    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .collect();

    const baseline = computeBaseline(account, transactions);
    return forecastOverdraft(account.balanceCents, baseline);
  },
});

// ─── dismissCard ─────────────────────────────────────────────────────────────
// Used by the agent's executeAction to silence byproduct cards (dup/creep/outlier).
export const dismissCard = mutation({
  args: { cardId: v.id("cards") },
  handler: async (ctx, { cardId }) => {
    await ctx.db.patch(cardId, { status: "dismissed" });
  },
});
