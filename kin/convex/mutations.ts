/**
 * State-change mutations the agent loop executes on user approval.
 *
 * These are intentionally tiny + atomic so the agent's "DOING something on
 * one tap" lands as a single visible state transition the feed reacts to.
 */

import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

// ─── moveMoney ───────────────────────────────────────────────────────────────
// Decrement `from`, increment `to`, write a matching pair of transactions so
// the history reflects reality. Returns the new balances for both accounts.
export const moveMoney = mutation({
  args: {
    fromAccountId: v.id("accounts"),
    toAccountId: v.id("accounts"),
    amountCents: v.number(),
    memo: v.optional(v.string()),
  },
  handler: async (ctx, { fromAccountId, toAccountId, amountCents, memo }) => {
    const from = await ctx.db.get(fromAccountId);
    const to = await ctx.db.get(toAccountId);
    if (!from || !to) throw new Error("Account not found");

    const amt = BigInt(amountCents);
    await ctx.db.patch(fromAccountId, { balanceCents: from.balanceCents - amt });
    await ctx.db.patch(toAccountId, { balanceCents: to.balanceCents + amt });

    const now = Date.now();
    const note = memo ?? "Kin: internal transfer";
    await ctx.db.insert("transactions", {
      accountId: fromAccountId,
      date: now,
      merchant: note,
      amountCents: -amt,
      category: "transfer",
      recurring: false,
    });
    await ctx.db.insert("transactions", {
      accountId: toAccountId,
      date: now,
      merchant: note,
      amountCents: amt,
      category: "transfer",
      recurring: false,
    });

    return {
      fromBalanceCents: Number(from.balanceCents - amt),
      toBalanceCents: Number(to.balanceCents + amt),
    };
  },
});

// ─── sendEtransferRequest ────────────────────────────────────────────────────
// Marks the agreement "requested" — the e-transfer "ask" went out to Dana.
// (We don't move money here; settlement happens when Dana pays — see settleAgreement.)
export const sendEtransferRequest = mutation({
  args: { agreementId: v.id("agreements") },
  handler: async (ctx, { agreementId }) => {
    const ag = await ctx.db.get(agreementId);
    if (!ag) throw new Error("Agreement not found");
    if (ag.status === "open") {
      await ctx.db.patch(agreementId, { status: "requested" });
    }
    return { status: "requested" as const, amountCents: Number(ag.amountCents) };
  },
});

// ─── settleAgreement ─────────────────────────────────────────────────────────
// Dana paid: settle the agreement, move the owed amount from her chequing
// into Alex's chequing, write the transactions both sides.
export const settleAgreement = mutation({
  args: { agreementId: v.id("agreements") },
  handler: async (ctx, { agreementId }) => {
    const ag = await ctx.db.get(agreementId);
    if (!ag) throw new Error("Agreement not found");
    if (ag.status === "settled") {
      return { status: "settled" as const, alreadySettled: true };
    }

    // From = the person who owes (fromId). To = the person owed (toId).
    const fromAccount = await ctx.db
      .query("accounts")
      .withIndex("by_owner", (q) => q.eq("ownerId", ag.fromId))
      .filter((q) => q.eq(q.field("type"), "chequing"))
      .first();
    const toAccount = await ctx.db
      .query("accounts")
      .withIndex("by_owner", (q) => q.eq("ownerId", ag.toId))
      .filter((q) => q.eq(q.field("type"), "chequing"))
      .first();

    if (!fromAccount || !toAccount) {
      throw new Error("Couldn't find chequing accounts for both parties");
    }

    const amt = ag.amountCents;
    await ctx.db.patch(fromAccount._id, {
      balanceCents: fromAccount.balanceCents - amt,
    });
    await ctx.db.patch(toAccount._id, {
      balanceCents: toAccount.balanceCents + amt,
    });

    const now = Date.now();
    await ctx.db.insert("transactions", {
      accountId: fromAccount._id,
      date: now,
      merchant: `E-transfer to Alex — ${ag.reason}`,
      amountCents: -amt,
      category: "transfer",
      recurring: false,
    });
    await ctx.db.insert("transactions", {
      accountId: toAccount._id,
      date: now,
      merchant: `E-transfer from Dana — ${ag.reason}`,
      amountCents: amt,
      category: "transfer",
      recurring: false,
    });

    await ctx.db.patch(agreementId, { status: "settled" });

    return {
      status: "settled" as const,
      amountCents: Number(amt),
      alreadySettled: false,
    };
  },
});

// ─── updateCard ──────────────────────────────────────────────────────────────
export const updateCardBody = mutation({
  args: {
    cardId: v.id("cards"),
    body: v.string(),
    title: v.optional(v.string()),
  },
  handler: async (ctx, { cardId, body, title }) => {
    const patch: { body: string; title?: string } = { body };
    if (title) patch.title = title;
    await ctx.db.patch(cardId, patch);
  },
});

export const setCardActions = mutation({
  args: {
    cardId: v.id("cards"),
    actions: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        kind: v.string(),
        params: v.any(),
      })
    ),
  },
  handler: async (ctx, { cardId, actions }) => {
    await ctx.db.patch(cardId, { actions });
  },
});

export const resolveCard = mutation({
  args: {
    cardId: v.id("cards"),
    status: v.optional(
      v.union(
        v.literal("open"),
        v.literal("resolved"),
        v.literal("dismissed")
      )
    ),
  },
  handler: async (ctx, { cardId, status }) => {
    await ctx.db.patch(cardId, { status: status ?? "resolved" });
  },
});

export type { Id };
