/**
 * Queries the agent loop calls to inspect household financial state.
 */

import { query } from "./_generated/server";
import { v } from "convex/values";
import { sourceForAccount, type SourceLabel } from "./sources";

// ─── getAccounts ─────────────────────────────────────────────────────────────
export const getAccounts = query({
  args: {},
  handler: async (ctx) => {
    const accounts = await ctx.db.query("accounts").collect();
    return accounts.map((a) => ({
      ...a,
      source: sourceForAccount(a),
    }));
  },
});

// ─── getRecentTransactions ───────────────────────────────────────────────────
export const getRecentTransactions = query({
  args: {
    limit: v.optional(v.number()),
    accountId: v.optional(v.id("accounts")),
  },
  handler: async (ctx, { limit = 50, accountId }) => {
    // Build account→source map
    const accounts = await ctx.db.query("accounts").collect();
    const sourceMap = new Map<string, SourceLabel>();
    for (const a of accounts) {
      sourceMap.set(a._id, sourceForAccount(a));
    }

    let txns;
    if (accountId) {
      txns = await ctx.db
        .query("transactions")
        .withIndex("by_account_and_date", (q) => q.eq("accountId", accountId))
        .order("desc")
        .take(limit);
    } else {
      // All transactions, most recent first
      txns = await ctx.db
        .query("transactions")
        .order("desc")
        .take(limit);
    }

    return txns.map((t) => ({
      ...t,
      source: sourceMap.get(t.accountId) ?? ("td-alex" as SourceLabel),
    }));
  },
});

// ─── getAgreements ───────────────────────────────────────────────────────────
export const getAgreements = query({
  args: {
    status: v.optional(
      v.union(v.literal("open"), v.literal("requested"), v.literal("settled"))
    ),
  },
  handler: async (ctx, { status }) => {
    let agreements;
    if (status) {
      agreements = await ctx.db
        .query("agreements")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
    } else {
      agreements = await ctx.db.query("agreements").collect();
    }

    // Enrich with people names
    const people = await ctx.db.query("people").collect();
    const nameMap = new Map<string, string>();
    for (const p of people) {
      nameMap.set(p._id, p.name);
    }

    return agreements.map((a) => ({
      ...a,
      fromName: nameMap.get(a.fromId) ?? "Unknown",
      toName: nameMap.get(a.toId) ?? "Unknown",
      source: "inbox" as const,
    }));
  },
});

// ─── getGoals ────────────────────────────────────────────────────────────────
export const getGoals = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("goals").collect();
  },
});

// ─── getCards ────────────────────────────────────────────────────────────────
export const getCards = query({
  args: {
    includeResolved: v.optional(v.boolean()),
  },
  handler: async (ctx, { includeResolved = false }) => {
    const cards = await ctx.db.query("cards").collect();
    const filtered = includeResolved
      ? cards
      : cards.filter((c) => c.status === "open");
    // Sort: critical > warn > info, then newest first.
    const sevRank = { critical: 0, warn: 1, info: 2 } as const;
    filtered.sort((a, b) => {
      const r = sevRank[a.severity] - sevRank[b.severity];
      if (r !== 0) return r;
      return b.createdAt - a.createdAt;
    });
    return filtered;
  },
});

// ─── getSubscribers ──────────────────────────────────────────────────────────
// Daily-briefing recipients. Used by the cron + the briefing action.
export const getSubscribers = query({
  args: { activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, { activeOnly = true }) => {
    const all = await ctx.db.query("subscribers").collect();
    return activeOnly ? all.filter((s) => s.active) : all;
  },
});

// ─── getSubscriptions ────────────────────────────────────────────────────────
export const getSubscriptions = query({
  args: {
    accountId: v.optional(v.id("accounts")),
  },
  handler: async (ctx, { accountId }) => {
    let subs;
    if (accountId) {
      subs = await ctx.db
        .query("subscriptions")
        .withIndex("by_account", (q) => q.eq("accountId", accountId))
        .collect();
    } else {
      subs = await ctx.db.query("subscriptions").collect();
    }

    // Flag creeping subscriptions (price increased across history)
    return subs.map((s) => {
      const history = s.history;
      let creeping = false;
      if (history.length >= 2) {
        const first = history[0].amountCents;
        const last = history[history.length - 1].amountCents;
        creeping = last > first;
      }
      return { ...s, creeping };
    });
  },
});
