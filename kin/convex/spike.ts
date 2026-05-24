"use node";

// Backboard de-risk spike. Run from the Convex dashboard:
//   actions → spike:backboardSpike → Run
// Requires BACKBOARD_API_KEY set in Convex env (Settings → Environment Variables).
//
// Proves four things in one call:
//   (a) sendMessage works (LLM gateway) and returns an assistantId/threadId we can reuse
//   (b) addMemory stores a fact scoped to the assistant
//   (c) searchMemories pulls it back semantically
//   (d) tool-call roundtrip: define tool → REQUIRES_ACTION → submitToolOutputsSimple → COMPLETED
//
// The shape of (d) is the load-bearing question — Backboard has no auto-loop,
// the dev writes a while(status === "REQUIRES_ACTION") loop.

import { action } from "./_generated/server";
import { v } from "convex/values";
// @ts-expect-error — backboard-sdk has no published types as of writing
import { BackboardClient } from "backboard-sdk";

const MODEL = {
  llm_provider: "openrouter",
  model_name: "moonshotai/kimi-k2.6",
};

export const backboardSpike = action({
  args: { reset: v.optional(v.boolean()) },
  handler: async () => {
    const apiKey = process.env.BACKBOARD_API_KEY;
    if (!apiKey) {
      throw new Error(
        "BACKBOARD_API_KEY not set. Add it in the Convex dashboard → Settings → Environment Variables.",
      );
    }
    const client = new BackboardClient({ apiKey });

    // (a) First message — creates an assistant + thread server-side.
    const hello = await client.sendMessage({
      content: "Say hi in 5 words.",
      memory: "Auto",
      ...MODEL,
    });
    const assistantId: string = hello.assistantId;
    const threadId: string = hello.threadId;

    // (b) Store a memory item scoped to this assistant.
    await client.addMemory(assistantId, {
      content:
        "Dana owes Alex $800 for the cottage trip deposit Alex fronted in March.",
      metadata: { source: "spike", kind: "agreement" },
    });

    // (c) Semantic retrieval.
    const memoryHits = await client.searchMemories(
      assistantId,
      "who owes whom money",
      5,
    );

    // (d) Tool-call roundtrip.
    const moveMoneyTool = {
      type: "function" as const,
      function: {
        name: "move_money",
        description: "Move money between two accounts. Amount is in cents.",
        parameters: {
          type: "object",
          properties: {
            from_account: { type: "string", description: "Source account id" },
            to_account: { type: "string", description: "Destination account id" },
            amount_cents: { type: "integer", description: "Amount in cents" },
          },
          required: ["from_account", "to_account", "amount_cents"],
        },
      },
    };

    const toolPrompt = await client.sendMessage({
      content:
        "Alex has $1,650 in chequing (acct:alex_chq) and rent autopays $2,100 Saturday. " +
        "Use the move_money tool to pull $500 from joint_savings to alex_chq as backup.",
      assistantId,
      threadId,
      tools: [moveMoneyTool],
      ...MODEL,
    });

    let toolRoundtrip:
      | { invoked: false; status: string; reply: string }
      | {
          invoked: true;
          toolName: string;
          args: unknown;
          finalStatus: string;
          finalReply: string;
        };

    if (
      toolPrompt.status === "REQUIRES_ACTION" &&
      Array.isArray(toolPrompt.toolCalls) &&
      toolPrompt.toolCalls.length > 0
    ) {
      const tc = toolPrompt.toolCalls[0];
      const args = tc.function.parsedArguments;
      const finished = await client.submitToolOutputsSimple({
        threadId: toolPrompt.threadId,
        toolOutputs: [
          {
            tool_call_id: tc.id,
            output: JSON.stringify({ ok: true, moved_cents: args.amount_cents }),
          },
        ],
      });
      toolRoundtrip = {
        invoked: true,
        toolName: tc.function.name,
        args,
        finalStatus: finished.status,
        finalReply: finished.content,
      };
    } else {
      toolRoundtrip = {
        invoked: false,
        status: toolPrompt.status,
        reply: toolPrompt.content,
      };
    }

    return {
      assistantId,
      threadId,
      helloReply: hello.content,
      memoryHits: memoryHits.map((m: { score: number; content: string }) => ({
        score: m.score,
        content: m.content,
      })),
      toolRoundtrip,
    };
  },
});
