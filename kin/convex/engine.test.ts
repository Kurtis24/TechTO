/**
 * Unit tests for the detection engine.
 *
 * Tests pure functions with synthetic data matching the seed shape.
 * Run with: cd kin && bun test convex/engine.test.ts
 */

import { describe, test, expect } from "bun:test";
import {
  mean,
  stddev,
  isOutlier,
  computeBaseline,
  forecastOverdraft,
  detectDuplicates,
  detectCreep,
  detectOutliers,
} from "./engine";

const DAY = 86_400_000;

// ─── Helper: build date for a given day-of-month, N months ago ───────────────
function monthsAgo(m: number, day: number): number {
  const d = new Date();
  d.setMonth(d.getMonth() - m, day);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

// ─── Math helpers ────────────────────────────────────────────────────────────

describe("math helpers", () => {
  test("mean of empty is 0", () => {
    expect(mean([])).toBe(0);
  });

  test("mean computes correctly", () => {
    expect(mean([BigInt(100), BigInt(200), BigInt(300)])).toBe(200);
  });

  test("stddev of single value is 0", () => {
    expect(stddev([BigInt(100)])).toBe(0);
  });

  test("stddev computes correctly", () => {
    const sd = stddev([BigInt(100), BigInt(200), BigInt(300)]);
    expect(sd).toBeCloseTo(81.65, 1);
  });

  test("isOutlier flags extreme values", () => {
    // Need enough normal data so outlier doesn't skew the distribution
    const values = [
      BigInt(-5000),
      BigInt(-6000),
      BigInt(-5500),
      BigInt(-4800),
      BigInt(-5200),
      BigInt(-6100),
      BigInt(-4900),
      BigInt(-5300),
      BigInt(-5800),
      BigInt(-5100),
      BigInt(-190000), // outlier
    ];
    expect(isOutlier(BigInt(-190000), values)).toBe(true);
    expect(isOutlier(BigInt(-5000), values)).toBe(false);
  });
});

// ─── Overdraft forecast ──────────────────────────────────────────────────────

describe("forecastOverdraft", () => {
  test("detects overdraft when rent exceeds balance", () => {
    // Simulate: balance $1,650, rent $2,100 on day 1 (the 1st of next month)
    const today = new Date();
    const nextFirst = new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      1
    ).getDate();
    // Use a Saturday for rent (matching seed behavior)
    // Find next Saturday
    const nowMs = Date.now();
    const daysUntilSat = (6 - today.getDay() + 7) % 7 || 7;
    const saturday = new Date(nowMs + daysUntilSat * DAY);
    const satDay = saturday.getDate();

    const baseline = {
      accountId: "test-account",
      institution: "TD Bank",
      monthlyInflowCents: 640000, // $6,400/mo biweekly
      monthlyOutflowCents: 550000,
      recurringDebits: [
        {
          merchant: "Landlord - 55 Bloor W",
          amountCents: -210000, // -$2,100
          cadence: "monthly" as const,
          typicalDay: satDay, // hits this Saturday
        },
        {
          merchant: "Toronto Hydro",
          amountCents: -14200,
          cadence: "monthly" as const,
          typicalDay: 15,
        },
      ],
      recurringCredits: [],
      avgTransactionCents: -15000,
      stddevCents: 30000,
      textSummary: "",
    };

    const result = forecastOverdraft(BigInt(165000), baseline, nowMs);

    expect(result.willOverdraft).toBe(true);
    expect(result.shortfallCents).toBeGreaterThan(0);
    expect(result.causeMerchant).toBe("Landlord - 55 Bloor W");
  });

  test("stays silent when balance covers upcoming debits", () => {
    const nowMs = Date.now();
    const baseline = {
      accountId: "test-account",
      institution: "TD Bank",
      monthlyInflowCents: 640000,
      monthlyOutflowCents: 300000,
      recurringDebits: [
        {
          merchant: "Netflix",
          amountCents: -2299,
          cadence: "monthly" as const,
          typicalDay: 8,
        },
      ],
      recurringCredits: [],
      avgTransactionCents: -5000,
      stddevCents: 3000,
      textSummary: "",
    };

    const result = forecastOverdraft(BigInt(500000), baseline, nowMs); // $5,000

    expect(result.willOverdraft).toBe(false);
    expect(result.shortfallCents).toBe(0);
  });
});

// ─── Duplicate detection ─────────────────────────────────────────────────────

describe("detectDuplicates", () => {
  test("finds Toronto Hydro duplicate from seed shape", () => {
    const txns = [
      {
        merchant: "Toronto Hydro",
        amountCents: BigInt(-14200),
        date: monthsAgo(0, 15),
      },
      {
        merchant: "Toronto Hydro",
        amountCents: BigInt(-14200),
        date: monthsAgo(0, 16), // day after — duplicate!
      },
      {
        merchant: "Netflix",
        amountCents: BigInt(-2299),
        date: monthsAgo(0, 8),
      },
    ];

    const dups = detectDuplicates(txns);

    expect(dups.length).toBe(1);
    expect(dups[0].merchant).toBe("Toronto Hydro");
    expect(dups[0].amountCents).toBe(BigInt(-14200));
    expect(dups[0].dates.length).toBe(2);
  });

  test("does not flag normal recurring charges as duplicates", () => {
    // Same merchant, same amount, but > 3 days apart (monthly)
    const txns = [
      {
        merchant: "Netflix",
        amountCents: BigInt(-2299),
        date: monthsAgo(2, 8),
      },
      {
        merchant: "Netflix",
        amountCents: BigInt(-2299),
        date: monthsAgo(1, 8),
      },
      {
        merchant: "Netflix",
        amountCents: BigInt(-2299),
        date: monthsAgo(0, 8),
      },
    ];

    const dups = detectDuplicates(txns);
    expect(dups.length).toBe(0);
  });
});

// ─── Creep detection ─────────────────────────────────────────────────────────

describe("detectCreep", () => {
  test("detects Canva Pro price creep from seed shape", () => {
    const subs = [
      {
        merchant: "Canva Pro",
        amountCents: BigInt(1999),
        history: [
          { date: monthsAgo(2, 5), amountCents: BigInt(999) },
          { date: monthsAgo(1, 5), amountCents: BigInt(1499) },
          { date: monthsAgo(0, 5), amountCents: BigInt(1999) },
        ],
      },
    ];

    const hits = detectCreep(subs);

    expect(hits.length).toBe(1);
    expect(hits[0].merchant).toBe("Canva Pro");
    expect(hits[0].startCents).toBe(BigInt(999));
    expect(hits[0].currentCents).toBe(BigInt(1999));
    expect(hits[0].increasePct).toBeGreaterThan(90); // ~100% increase
  });

  test("does not flag stable subscriptions", () => {
    const subs = [
      {
        merchant: "Netflix",
        amountCents: BigInt(2299),
        history: [
          { date: monthsAgo(2, 8), amountCents: BigInt(2299) },
          { date: monthsAgo(1, 8), amountCents: BigInt(2299) },
          { date: monthsAgo(0, 8), amountCents: BigInt(2299) },
        ],
      },
    ];

    const hits = detectCreep(subs);
    expect(hits.length).toBe(0);
  });
});

// ─── Outlier detection ───────────────────────────────────────────────────────

describe("detectOutliers", () => {
  test("flags $1,900 Canada Goose against normal spending", () => {
    // Normal: ~$50-$200 debits + one $1,900 outlier
    const txns = [
      { merchant: "Loblaws", amountCents: BigInt(-8500), date: monthsAgo(2, 10) },
      { merchant: "Metro", amountCents: BigInt(-6200), date: monthsAgo(2, 17) },
      { merchant: "Presto", amountCents: BigInt(-15600), date: monthsAgo(2, 5) },
      { merchant: "Shoppers", amountCents: BigInt(-4500), date: monthsAgo(1, 8) },
      { merchant: "Loblaws", amountCents: BigInt(-9200), date: monthsAgo(1, 12) },
      { merchant: "Tim Hortons", amountCents: BigInt(-650), date: monthsAgo(1, 3) },
      { merchant: "Metro", amountCents: BigInt(-7100), date: monthsAgo(0, 6) },
      { merchant: "Presto", amountCents: BigInt(-15600), date: monthsAgo(0, 14) },
      { merchant: "Canada Goose - Yorkdale", amountCents: BigInt(-190000), date: monthsAgo(1, 11) },
    ];

    const hits = detectOutliers(txns);

    expect(hits.length).toBe(1);
    expect(hits[0].merchant).toBe("Canada Goose - Yorkdale");
    expect(hits[0].zScore).toBeGreaterThan(2.5);
  });

  test("does not flag within-normal transactions", () => {
    const txns = [
      { merchant: "Loblaws", amountCents: BigInt(-8500), date: monthsAgo(2, 10) },
      { merchant: "Metro", amountCents: BigInt(-6200), date: monthsAgo(2, 17) },
      { merchant: "Loblaws", amountCents: BigInt(-9200), date: monthsAgo(1, 12) },
      { merchant: "Metro", amountCents: BigInt(-7100), date: monthsAgo(0, 6) },
      { merchant: "Shoppers", amountCents: BigInt(-4500), date: monthsAgo(0, 14) },
      { merchant: "Loblaws", amountCents: BigInt(-7800), date: monthsAgo(0, 20) },
    ];

    const hits = detectOutliers(txns);
    expect(hits.length).toBe(0);
  });
});

// ─── Baseline computation ────────────────────────────────────────────────────

describe("computeBaseline", () => {
  test("computes monthly inflow/outflow and identifies recurring patterns", () => {
    const account = {
      _id: "acct-1",
      institution: "TD Bank",
      balanceCents: BigInt(165000),
    };

    const txns = [
      // 6 biweekly paycheques
      ...Array.from({ length: 6 }, (_, i) => ({
        merchant: "ACME Corp - Payroll",
        amountCents: BigInt(320000),
        date: Date.now() - (84 - i * 14) * DAY,
        recurring: true,
        category: "income",
      })),
      // 3 months rent
      { merchant: "Landlord - 55 Bloor W", amountCents: BigInt(-210000), date: monthsAgo(2, 1), recurring: true, category: "rent" },
      { merchant: "Landlord - 55 Bloor W", amountCents: BigInt(-210000), date: monthsAgo(1, 1), recurring: true, category: "rent" },
      { merchant: "Landlord - 55 Bloor W", amountCents: BigInt(-210000), date: monthsAgo(0, 1), recurring: true, category: "rent" },
      // Some groceries (non-recurring)
      { merchant: "Loblaws", amountCents: BigInt(-8500), date: monthsAgo(1, 10), recurring: false, category: "groceries" },
      { merchant: "Metro", amountCents: BigInt(-6200), date: monthsAgo(0, 15), recurring: false, category: "groceries" },
    ];

    const baseline = computeBaseline(account, txns);

    expect(baseline.monthlyInflowCents).toBeGreaterThan(0);
    expect(baseline.monthlyOutflowCents).toBeGreaterThan(0);
    expect(baseline.recurringDebits.length).toBeGreaterThanOrEqual(1);
    expect(
      baseline.recurringDebits.find((d) => d.merchant === "Landlord - 55 Bloor W")
    ).toBeDefined();
    expect(baseline.textSummary).toContain("TD Bank");
    expect(baseline.textSummary.length).toBeGreaterThan(50);
  });
});
