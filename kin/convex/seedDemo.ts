import { mutation } from "./_generated/server";

// ─── Time helpers ────────────────────────────────────────────────────────────
const DAY = 86_400_000;
const now = () => Date.now();

/** Next Saturday from "now." Rent autopay hits here → overdraft. */
function comingSaturday(): number {
  const d = new Date(now());
  const daysUntilSat = (6 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntilSat);
  d.setHours(3, 0, 0, 0); // early morning autopay
  return d.getTime();
}

/** Returns a date N months ago, on the given day-of-month, at ~noon. */
function monthsAgo(m: number, day: number): number {
  const d = new Date(now());
  d.setMonth(d.getMonth() - m, day);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

/** Biweekly Fridays for the past 3 months (6 paydays). */
function biweeklyPaydays(): number[] {
  const dates: number[] = [];
  const d = new Date(now());
  // Find last Friday
  d.setDate(d.getDate() - ((d.getDay() + 2) % 7));
  d.setHours(6, 0, 0, 0);
  // Walk back 12 weeks (6 biweekly pays)
  for (let i = 0; i < 6; i++) {
    dates.unshift(d.getTime());
    d.setDate(d.getDate() - 14);
  }
  return dates;
}

/** Spread grocery/transit/coffee across the 3 months with some jitter. */
function scatteredDates(count: number, startMs: number, endMs: number): number[] {
  const span = endMs - startMs;
  const step = span / (count + 1);
  return Array.from({ length: count }, (_, i) => {
    const jitter = (Math.sin(i * 7.3) * 0.3 + 0.5) * step * 0.4;
    return Math.round(startMs + step * (i + 1) + jitter);
  });
}

// ─── Seed data definition ────────────────────────────────────────────────────

type TxnSeed = {
  merchant: string;
  amountCents: bigint;
  category: string;
  recurring: boolean;
  date: number;
};

export const seedDemo = mutation({
  args: {},
  handler: async (ctx) => {
    // ── Idempotent: wipe everything ──────────────────────────────────────────
    const tables = [
      "people",
      "accounts",
      "transactions",
      "agreements",
      "goals",
      "subscriptions",
      "cards",
    ] as const;
    for (const table of tables) {
      const docs = await ctx.db.query(table).collect();
      for (const doc of docs) {
        await ctx.db.delete(doc._id);
      }
    }

    // ── People ───────────────────────────────────────────────────────────────
    const alexId = await ctx.db.insert("people", {
      name: "Alex",
      role: "primary",
    });
    const danaId = await ctx.db.insert("people", {
      name: "Dana",
      role: "partner",
    });

    // ── Accounts ─────────────────────────────────────────────────────────────
    const alexChequingId = await ctx.db.insert("accounts", {
      ownerId: alexId,
      institution: "TD Bank",
      type: "chequing",
      balanceCents: BigInt(165000), // $1,650.00
    });

    const danaChequingId = await ctx.db.insert("accounts", {
      ownerId: danaId,
      institution: "RBC",
      type: "chequing",
      balanceCents: BigInt(310000), // $3,100.00
    });

    const jointSavingsId = await ctx.db.insert("accounts", {
      ownerId: alexId, // alex is primary holder
      institution: "Tangerine",
      type: "joint",
      balanceCents: BigInt(200000), // $2,000.00
    });

    // ── Transactions: Alex's chequing ────────────────────────────────────────
    const threeMonthsAgo = monthsAgo(3, 1);
    const today = now();
    const alexTxns: TxnSeed[] = [];

    // Biweekly paycheques ($3,200 net)
    for (const date of biweeklyPaydays()) {
      alexTxns.push({
        merchant: "ACME Corp - Payroll",
        amountCents: BigInt(320000),
        category: "income",
        recurring: true,
        date,
      });
    }

    // Rent — 1st of each month
    for (let m = 2; m >= 0; m--) {
      alexTxns.push({
        merchant: "Landlord - 55 Bloor W",
        amountCents: BigInt(-210000),
        category: "rent",
        recurring: true,
        date: monthsAgo(m, 1),
      });
    }

    // Toronto Hydro — 15th of each month + DUPLICATE in most recent month
    for (let m = 2; m >= 0; m--) {
      alexTxns.push({
        merchant: "Toronto Hydro",
        amountCents: BigInt(-14200),
        category: "utilities",
        recurring: true,
        date: monthsAgo(m, 15),
      });
    }
    // ⚡ LANDMINE: duplicate charge — same merchant, same amount, day after
    alexTxns.push({
      merchant: "Toronto Hydro",
      amountCents: BigInt(-14200),
      category: "utilities",
      recurring: true,
      date: monthsAgo(0, 16),
    });

    // Netflix — 8th of each month
    for (let m = 2; m >= 0; m--) {
      alexTxns.push({
        merchant: "Netflix",
        amountCents: BigInt(-2299),
        category: "entertainment",
        recurring: true,
        date: monthsAgo(m, 8),
      });
    }

    // Phone bill — 20th of each month
    for (let m = 2; m >= 0; m--) {
      alexTxns.push({
        merchant: "Koodo Mobile",
        amountCents: BigInt(-8500),
        category: "phone",
        recurring: true,
        date: monthsAgo(m, 20),
      });
    }

    // Internet — 22nd
    for (let m = 2; m >= 0; m--) {
      alexTxns.push({
        merchant: "Bell Internet",
        amountCents: BigInt(-7500),
        category: "internet",
        recurring: true,
        date: monthsAgo(m, 22),
      });
    }

    // Groceries — Loblaws, Metro, No Frills (scattered)
    const groceryMerchants = ["Loblaws", "Metro", "No Frills"];
    const groceryDates = scatteredDates(18, threeMonthsAgo, today);
    for (let i = 0; i < groceryDates.length; i++) {
      // Vary amounts: $45–$165
      const base = 4500 + ((i * 1337) % 12000);
      alexTxns.push({
        merchant: groceryMerchants[i % 3],
        amountCents: BigInt(-base),
        category: "groceries",
        recurring: false,
        date: groceryDates[i],
      });
    }

    // Presto transit — ~12 taps over 3 months
    const prestoDates = scatteredDates(12, threeMonthsAgo, today);
    for (const date of prestoDates) {
      alexTxns.push({
        merchant: "Presto",
        amountCents: BigInt(-350),
        category: "transit",
        recurring: false,
        date,
      });
    }

    // Coffee — Blue Door, Sam James, Tim Hortons
    const coffeeMerchants = [
      "Blue Door Coffee",
      "Sam James Coffee Bar",
      "Tim Hortons",
    ];
    const coffeeDates = scatteredDates(24, threeMonthsAgo, today);
    for (let i = 0; i < coffeeDates.length; i++) {
      const amt = 450 + ((i * 311) % 350); // $4.50–$8.00
      alexTxns.push({
        merchant: coffeeMerchants[i % 3],
        amountCents: BigInt(-amt),
        category: "coffee",
        recurring: false,
        date: coffeeDates[i],
      });
    }

    // Shoppers Drug Mart — 4 visits
    const shoppersDates = scatteredDates(4, threeMonthsAgo, today);
    for (let i = 0; i < shoppersDates.length; i++) {
      const amt = 1800 + ((i * 997) % 4200); // $18–$60
      alexTxns.push({
        merchant: "Shoppers Drug Mart",
        amountCents: BigInt(-amt),
        category: "personal",
        recurring: false,
        date: shoppersDates[i],
      });
    }

    // Amazon — 3 orders
    const amazonDates = scatteredDates(3, threeMonthsAgo, today);
    const amazonAmounts = [4999, 8997, 3499]; // various
    for (let i = 0; i < amazonDates.length; i++) {
      alexTxns.push({
        merchant: "Amazon.ca",
        amountCents: BigInt(-amazonAmounts[i]),
        category: "shopping",
        recurring: false,
        date: amazonDates[i],
      });
    }

    // Eating out — a few times
    const eatingDates = scatteredDates(6, threeMonthsAgo, today);
    const restaurants = [
      "Pai Northern Thai",
      "Ramen Isshin",
      "Burger's Priest",
      "Banh Mi Boys",
      "Seven Lives Tacos",
      "Pizzeria Libretto",
    ];
    for (let i = 0; i < eatingDates.length; i++) {
      const amt = 2200 + ((i * 773) % 3800);
      alexTxns.push({
        merchant: restaurants[i],
        amountCents: BigInt(-amt),
        category: "dining",
        recurring: false,
        date: eatingDates[i],
      });
    }

    // ⚡ LANDMINE: outlier — $1,900 charge (Canada Goose, unlike anything else)
    alexTxns.push({
      merchant: "Canada Goose - Yorkdale",
      amountCents: BigInt(-190000),
      category: "shopping",
      recurring: false,
      date: monthsAgo(1, 11),
    });

    // ⚡ LANDMINE: Creeping subscription (Canva) — paid on 5th of each month
    const creepAmounts = [BigInt(-999), BigInt(-1499), BigInt(-1999)];
    for (let m = 2; m >= 0; m--) {
      alexTxns.push({
        merchant: "Canva Pro",
        amountCents: creepAmounts[2 - m],
        category: "subscription",
        recurring: true,
        date: monthsAgo(m, 5),
      });
    }

    // Gym — 12th of each month
    for (let m = 2; m >= 0; m--) {
      alexTxns.push({
        merchant: "GoodLife Fitness",
        amountCents: BigInt(-5999),
        category: "fitness",
        recurring: true,
        date: monthsAgo(m, 12),
      });
    }

    // ── Now reconcile: adjust starting balance so we land at $1,650 ──────────
    // We do this by adding a "opening balance" synthetic inflow at the start.
    // net = sum of all txns. balance = openingBalance + net => opening = 165000 - net
    let net = BigInt(0);
    for (const t of alexTxns) {
      net += t.amountCents;
    }
    const openingBalanceCents = BigInt(165000) - net;

    // Insert opening balance as first transaction
    await ctx.db.insert("transactions", {
      accountId: alexChequingId,
      date: threeMonthsAgo - DAY,
      merchant: "Opening Balance",
      amountCents: openingBalanceCents,
      category: "transfer",
      recurring: false,
    });

    // Insert all Alex's transactions
    for (const t of alexTxns) {
      await ctx.db.insert("transactions", {
        accountId: alexChequingId,
        date: t.date,
        merchant: t.merchant,
        amountCents: t.amountCents,
        category: t.category,
        recurring: t.recurring,
      });
    }

    // ── Transactions: Dana's chequing (lighter — just enough for realism) ────
    const danaTxns: TxnSeed[] = [];

    // Biweekly pay — $2,900 net
    for (const date of biweeklyPaydays()) {
      danaTxns.push({
        merchant: "City of Toronto - Payroll",
        amountCents: BigInt(290000),
        category: "income",
        recurring: true,
        date,
      });
    }

    // Some recurring expenses
    for (let m = 2; m >= 0; m--) {
      danaTxns.push({
        merchant: "Rogers Mobile",
        amountCents: BigInt(-9500),
        category: "phone",
        recurring: true,
        date: monthsAgo(m, 18),
      });
      danaTxns.push({
        merchant: "Spotify Premium",
        amountCents: BigInt(-1199),
        category: "entertainment",
        recurring: true,
        date: monthsAgo(m, 10),
      });
    }

    // Groceries
    const danaGroceryDates = scatteredDates(10, threeMonthsAgo, today);
    for (let i = 0; i < danaGroceryDates.length; i++) {
      const amt = 3500 + ((i * 1117) % 9500);
      danaTxns.push({
        merchant: groceryMerchants[(i + 1) % 3],
        amountCents: BigInt(-amt),
        category: "groceries",
        recurring: false,
        date: danaGroceryDates[i],
      });
    }

    // Reconcile Dana
    let danaNet = BigInt(0);
    for (const t of danaTxns) {
      danaNet += t.amountCents;
    }
    const danaOpening = BigInt(310000) - danaNet;
    await ctx.db.insert("transactions", {
      accountId: danaChequingId,
      date: threeMonthsAgo - DAY,
      merchant: "Opening Balance",
      amountCents: danaOpening,
      category: "transfer",
      recurring: false,
    });
    for (const t of danaTxns) {
      await ctx.db.insert("transactions", {
        accountId: danaChequingId,
        date: t.date,
        merchant: t.merchant,
        amountCents: t.amountCents,
        category: t.category,
        recurring: t.recurring,
      });
    }

    // ── Transactions: Joint savings (minimal — just contributions) ───────────
    const jointTxns: TxnSeed[] = [];
    // Monthly contributions from each
    for (let m = 2; m >= 0; m--) {
      jointTxns.push({
        merchant: "Transfer from Alex - TD",
        amountCents: BigInt(25000),
        category: "transfer",
        recurring: true,
        date: monthsAgo(m, 3),
      });
      jointTxns.push({
        merchant: "Transfer from Dana - RBC",
        amountCents: BigInt(25000),
        category: "transfer",
        recurring: true,
        date: monthsAgo(m, 3),
      });
    }
    let jointNet = BigInt(0);
    for (const t of jointTxns) {
      jointNet += t.amountCents;
    }
    const jointOpening = BigInt(200000) - jointNet;
    await ctx.db.insert("transactions", {
      accountId: jointSavingsId,
      date: threeMonthsAgo - DAY,
      merchant: "Opening Balance",
      amountCents: jointOpening,
      category: "transfer",
      recurring: false,
    });
    for (const t of jointTxns) {
      await ctx.db.insert("transactions", {
        accountId: jointSavingsId,
        date: t.date,
        merchant: t.merchant,
        amountCents: t.amountCents,
        category: t.category,
        recurring: t.recurring,
      });
    }

    // ── Agreement ────────────────────────────────────────────────────────────
    await ctx.db.insert("agreements", {
      fromId: danaId,
      toId: alexId,
      amountCents: BigInt(80000), // $800
      reason: "cottage trip deposit alex fronted",
      status: "open",
    });

    // ── Goal ─────────────────────────────────────────────────────────────────
    // "$5k trip by December" — December 1 2026
    const dec2026 = new Date(2026, 11, 1).getTime();
    await ctx.db.insert("goals", {
      name: "$5k trip by December",
      targetCents: BigInt(500000),
      deadline: dec2026,
      savedCents: BigInt(200000), // joint savings counts toward it
    });

    // ── Subscriptions ────────────────────────────────────────────────────────
    // Netflix (alex's decision: keep it)
    await ctx.db.insert("subscriptions", {
      accountId: alexChequingId,
      merchant: "Netflix",
      amountCents: BigInt(2299),
      cadence: "monthly",
      history: [
        { date: monthsAgo(2, 8), amountCents: BigInt(2299) },
        { date: monthsAgo(1, 8), amountCents: BigInt(2299) },
        { date: monthsAgo(0, 8), amountCents: BigInt(2299) },
      ],
    });

    // Canva Pro — CREEPING 🚨
    await ctx.db.insert("subscriptions", {
      accountId: alexChequingId,
      merchant: "Canva Pro",
      amountCents: BigInt(1999), // current
      cadence: "monthly",
      history: [
        { date: monthsAgo(2, 5), amountCents: BigInt(999) },
        { date: monthsAgo(1, 5), amountCents: BigInt(1499) },
        { date: monthsAgo(0, 5), amountCents: BigInt(1999) },
      ],
    });

    // Spotify (Dana's)
    await ctx.db.insert("subscriptions", {
      accountId: danaChequingId,
      merchant: "Spotify Premium",
      amountCents: BigInt(1199),
      cadence: "monthly",
      history: [
        { date: monthsAgo(2, 10), amountCents: BigInt(1199) },
        { date: monthsAgo(1, 10), amountCents: BigInt(1199) },
        { date: monthsAgo(0, 10), amountCents: BigInt(1199) },
      ],
    });

    // GoodLife Fitness
    await ctx.db.insert("subscriptions", {
      accountId: alexChequingId,
      merchant: "GoodLife Fitness",
      amountCents: BigInt(5999),
      cadence: "monthly",
      history: [
        { date: monthsAgo(2, 12), amountCents: BigInt(5999) },
        { date: monthsAgo(1, 12), amountCents: BigInt(5999) },
        { date: monthsAgo(0, 12), amountCents: BigInt(5999) },
      ],
    });

    // ── Cards (stored decisions & existing insights) ─────────────────────────
    // Stored decision: "alex likes netflix, leave it"
    await ctx.db.insert("cards", {
      type: "info",
      severity: "info",
      title: "Netflix subscription",
      body: "Alex confirmed: keep Netflix ($22.99/mo). No action needed.",
      actions: [],
      status: "dismissed",
      createdAt: monthsAgo(1, 20),
    });

    // ── Upcoming: rent autopay (not yet executed — it's in the future) ───────
    // We store it as a scheduled transaction note in a card so the agent
    // can detect the impending overdraft
    await ctx.db.insert("cards", {
      type: "overdraft",
      severity: "critical",
      title: "Overdraft risk: rent autopay Saturday",
      body: `Alex's chequing has $1,650. Rent of $2,100 autopays Saturday ${new Date(comingSaturday()).toLocaleDateString("en-CA")} — shortfall of ~$450.`,
      actions: [
        {
          id: "move-from-savings",
          label: "Move $500 from joint savings",
          kind: "move_money",
          params: {
            fromAccountId: jointSavingsId,
            toAccountId: alexChequingId,
            amountCents: 50000,
          },
        },
        {
          id: "ask-dana",
          label: "Ask Dana to cover",
          kind: "call_dana",
          params: { message: "Rent shortfall — can you transfer $450?" },
        },
        {
          id: "both",
          label: "Split: savings + Dana",
          kind: "both",
          params: {},
        },
      ],
      status: "open",
      createdAt: now(),
    });

    return {
      ok: true,
      people: { alexId, danaId },
      accounts: {
        alexChequing: alexChequingId,
        danaChequing: danaChequingId,
        jointSavings: jointSavingsId,
      },
      transactionCount:
        alexTxns.length + danaTxns.length + jointTxns.length + 3, // +3 opening balances
    };
  },
});
