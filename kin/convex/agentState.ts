/**
 * Singleton state for the Backboard assistant + thread.
 *
 * Backboard memory is keyed by assistantId, so we persist it once and reuse
 * forever — that's what lets the agent "remember" agreements/goals/decisions
 * across runAgent calls and across reloads. Creation happens action-side
 * (agent.ts) because Backboard's HTTP call doesn't run in mutations.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getState = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("agentState").first();
  },
});

export const getOrCreateAssistant = mutation({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("agentState").first();
    if (!row) return null;
    return {
      assistantId: row.assistantId,
      threadId: row.threadId,
      primed: row.primed ?? false,
    };
  },
});

export const setAssistant = mutation({
  args: { assistantId: v.string(), threadId: v.string() },
  handler: async (ctx, { assistantId, threadId }) => {
    const existing = await ctx.db.query("agentState").first();
    if (existing) {
      await ctx.db.patch(existing._id, { assistantId, threadId, primed: false });
      return existing._id;
    }
    return await ctx.db.insert("agentState", {
      assistantId,
      threadId,
      primed: false,
    });
  },
});

export const markPrimed = mutation({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("agentState").first();
    if (!row) return;
    await ctx.db.patch(row._id, { primed: true });
  },
});

export const updateThread = mutation({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    const row = await ctx.db.query("agentState").first();
    if (!row) return;
    await ctx.db.patch(row._id, { threadId });
  },
});

/** Wipe the assistant state (useful when reseeding the demo). */
export const reset = mutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("agentState").collect();
    for (const r of all) await ctx.db.delete(r._id);
  },
});
