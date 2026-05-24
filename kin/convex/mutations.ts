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

// ─── createMessageCard ───────────────────────────────────────────────────────
// Called by the Twilio inbound webhook (convex/http.ts). Maps the sender's
// phone to a known person if possible, then writes an `info` card to the feed.
export const createMessageCard = mutation({
  args: {
    from: v.string(),
    to: v.optional(v.string()),
    body: v.string(),
    messageSid: v.optional(v.string()),
    receivedAt: v.number(),
  },
  handler: async (ctx, { from, body, receivedAt }) => {
    const senderName = (await nameForPhoneFromDb(ctx, from)) ?? prettyPhone(from);
    const cardId = await ctx.db.insert("cards", {
      type: "info",
      severity: "info",
      title: `Message from ${senderName}`,
      body,
      actions: [
        {
          id: "dismiss",
          label: "Mark as read",
          kind: "dismiss",
          params: {},
        },
      ],
      status: "open",
      createdAt: receivedAt,
    });
    return { cardId };
  },
});

// Look up a known name for an inbound phone in this order:
// 1. people.phone match  →  person.name
// 2. subscribers.phone match  →  subscriber.name
// 3. ALEX_PHONE / DANA_PHONE env vars (legacy)
async function nameForPhoneFromDb(
  ctx: { db: { query: (t: "people" | "subscribers") => { collect: () => Promise<{ name: string; phone?: string }[]> } } },
  e164: string,
): Promise<string | null> {
  const norm = e164.trim();
  const ppl = await ctx.db.query("people").collect();
  const matchP = ppl.find((p) => p.phone === norm);
  if (matchP) return matchP.name;
  const subs = await ctx.db.query("subscribers").collect();
  const matchS = subs.find((s) => s.phone === norm);
  if (matchS) return matchS.name;
  if (norm === (process.env.ALEX_PHONE ?? "")) return "Alex";
  if (norm === (process.env.DANA_PHONE ?? "")) return "Dana";
  return null;
}

function prettyPhone(e164: string): string {
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (!m) return e164;
  return `+1 (${m[1]}) ${m[2]}-${m[3]}`;
}

// ─── subscribe ───────────────────────────────────────────────────────────────
// Idempotent on phone. Call from the Convex dashboard:
//   subscribe({ phone: "+14165551234", name: "Alex", personId: "<id>" })
export const subscribe = mutation({
  args: {
    phone: v.string(),
    name: v.string(),
    personId: v.optional(v.id("people")),
    briefingHourLocal: v.optional(v.number()),
    tz: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { phone, name, personId, briefingHourLocal, tz }
  ) => {
    const existing = await ctx.db
      .query("subscribers")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .first();
    const patch = {
      name,
      personId,
      briefingHourLocal: briefingHourLocal ?? 8,
      tz: tz ?? "America/Toronto",
      active: true,
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("subscribers", { phone, ...patch });
  },
});

export const unsubscribe = mutation({
  args: { phone: v.string() },
  handler: async (ctx, { phone }) => {
    const row = await ctx.db
      .query("subscribers")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .first();
    if (row) await ctx.db.patch(row._id, { active: false });
  },
});

// Convenience: stash a phone on a `people` row so existing demo data
// (Alex, Dana) can text in and be recognized.
export const setPersonPhone = mutation({
  args: { personId: v.id("people"), phone: v.string() },
  handler: async (ctx, { personId, phone }) => {
    await ctx.db.patch(personId, { phone });
  },
});

// ─── phoneAssistants helpers ────────────────────────────────────────────────
// Per-phone Backboard assistant + thread, so each texter has persistent memory.
export const getPhoneAssistant = mutation({
  args: { phone: v.string() },
  handler: async (ctx, { phone }) => {
    const row = await ctx.db
      .query("phoneAssistants")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .first();
    if (!row) return null;
    return {
      assistantId: row.assistantId,
      threadId: row.threadId,
      primed: row.primed ?? false,
    };
  },
});

export const setPhoneAssistant = mutation({
  args: {
    phone: v.string(),
    assistantId: v.string(),
    threadId: v.string(),
  },
  handler: async (ctx, { phone, assistantId, threadId }) => {
    const existing = await ctx.db
      .query("phoneAssistants")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        assistantId,
        threadId,
        primed: false,
      });
      return existing._id;
    }
    return await ctx.db.insert("phoneAssistants", {
      phone,
      assistantId,
      threadId,
      primed: false,
    });
  },
});

export const markPhoneAssistantPrimed = mutation({
  args: { phone: v.string() },
  handler: async (ctx, { phone }) => {
    const row = await ctx.db
      .query("phoneAssistants")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .first();
    if (row) await ctx.db.patch(row._id, { primed: true });
  },
});

export const updatePhoneAssistantThread = mutation({
  args: { phone: v.string(), threadId: v.string() },
  handler: async (ctx, { phone, threadId }) => {
    const row = await ctx.db
      .query("phoneAssistants")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .first();
    if (row) await ctx.db.patch(row._id, { threadId });
  },
});

// ─── setCurrentViewer ────────────────────────────────────────────────────────
// Switch the active household member. Powers the demo's "see what Alex sees,
// switch to Dana" beat. If no householdState row exists yet, create one.
export const setCurrentViewer = mutation({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    const existing = await ctx.db.query("householdState").first();
    if (existing) {
      await ctx.db.patch(existing._id, { currentViewerId: personId });
    } else {
      await ctx.db.insert("householdState", { currentViewerId: personId });
    }
    return { currentViewerId: personId };
  },
});

// ─── Goal / Budget CRUD ──────────────────────────────────────────────────────

export const createGoal = mutation({
  args: {
    name: v.string(),
    targetCents: v.int64(),
    deadline: v.number(), // unix ms
    savedCents: v.optional(v.int64()),
  },
  handler: async (ctx, { name, targetCents, deadline, savedCents }) => {
    return await ctx.db.insert("goals", {
      name,
      targetCents,
      deadline,
      savedCents: savedCents ?? BigInt(0),
    });
  },
});

export const updateGoal = mutation({
  args: {
    goalId: v.id("goals"),
    name: v.optional(v.string()),
    targetCents: v.optional(v.int64()),
    deadline: v.optional(v.number()),
    savedCents: v.optional(v.int64()),
  },
  handler: async (ctx, { goalId, name, targetCents, deadline, savedCents }) => {
    const goal = await ctx.db.get(goalId);
    if (!goal) throw new Error("Goal not found");
    const patch: Partial<{ name: string; targetCents: bigint; deadline: number; savedCents: bigint }> = {};
    if (name !== undefined) patch.name = name;
    if (targetCents !== undefined) patch.targetCents = targetCents;
    if (deadline !== undefined) patch.deadline = deadline;
    if (savedCents !== undefined) patch.savedCents = savedCents;
    await ctx.db.patch(goalId, patch);
    return { updated: true };
  },
});

export const deleteGoal = mutation({
  args: { goalId: v.id("goals") },
  handler: async (ctx, { goalId }) => {
    const goal = await ctx.db.get(goalId);
    if (!goal) throw new Error("Goal not found");
    await ctx.db.delete(goalId);
    return { deleted: true };
  },
});

// Add an amount to savedCents (e.g., "I put $200 toward vacation")
export const addSavingsToGoal = mutation({
  args: {
    goalId: v.id("goals"),
    amountCents: v.int64(),
  },
  handler: async (ctx, { goalId, amountCents }) => {
    const goal = await ctx.db.get(goalId);
    if (!goal) throw new Error("Goal not found");
    const newSaved = goal.savedCents + amountCents;
    await ctx.db.patch(goalId, { savedCents: newSaved });
    return { savedCents: Number(newSaved), targetCents: Number(goal.targetCents) };
  },
});

export type { Id };
