"use node";

/**
 * Thin Backboard primitives for MCP tools — secrets stay in Convex env.
 */

import { action } from "./_generated/server";
import { v } from "convex/values";
import { BackboardClient, type ChatMessagesResponse } from "backboard-sdk";

const MODEL = {
  llm_provider: "openrouter",
  model_name: "moonshotai/kimi-k2.6",
};

const asChat = (r: unknown) => r as ChatMessagesResponse;

function client() {
  const apiKey = process.env.BACKBOARD_API_KEY;
  if (!apiKey) {
    throw new Error(
      "BACKBOARD_API_KEY not set in Convex env (Settings → Environment Variables).",
    );
  }
  return new BackboardClient({ apiKey });
}

export const sendMessage = action({
  args: {
    content: v.string(),
    assistantId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    memory: v.optional(v.union(v.literal("Auto"), v.literal("Off"))),
  },
  handler: async (_ctx, args) => {
    const bb = client();
    const r = asChat(
      await bb.sendMessage({
        content: args.content,
        assistantId: args.assistantId,
        threadId: args.threadId,
        memory: args.memory ?? "Auto",
        ...MODEL,
      }),
    );
    return {
      content: r.content,
      assistantId: r.assistantId,
      threadId: r.threadId,
      status: r.status,
    };
  },
});

export const addMemory = action({
  args: {
    assistantId: v.string(),
    content: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (_ctx, { assistantId, content, metadata }) => {
    const bb = client();
    await bb.addMemory(assistantId, { content, metadata });
    return { ok: true as const };
  },
});

export const searchMemories = action({
  args: {
    assistantId: v.string(),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (_ctx, { assistantId, query, limit }) => {
    const bb = client();
    const hits = await bb.searchMemories(assistantId, query, limit ?? 5);
    return hits.map((m: { score?: number; content: string }) => ({
      score: m.score,
      content: m.content,
    }));
  },
});

export const submitToolOutputs = action({
  args: {
    threadId: v.string(),
    toolOutputs: v.array(
      v.object({
        tool_call_id: v.string(),
        output: v.string(),
      }),
    ),
  },
  handler: async (_ctx, { threadId, toolOutputs }) => {
    const bb = client();
    const r = asChat(
      await bb.submitToolOutputsSimple({ threadId, toolOutputs }),
    );
    return {
      content: r.content,
      status: r.status,
    };
  },
});
