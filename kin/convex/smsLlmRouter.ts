"use node";

/**
 * Semantic SMS routing via Backboard LLM.
 * Falls back to keyword router in smsRouter.ts if Backboard fails or returns invalid JSON.
 */

import { BackboardClient, type ChatMessagesResponse } from "backboard-sdk";
import {
  SMS_ROUTABLE_TOOL_NAMES,
  SMS_ROUTABLE_TOOLS,
} from "./smsToolCatalog";
import {
  dedupeSteps,
  routeInboundSms,
  type SmsPlanStep,
  type SmsRoutePlan,
} from "./smsRouter";

const MODEL = {
  llm_provider: "openrouter",
  model_name: "moonshotai/kimi-k2.6",
};

const asChat = (r: unknown) => r as ChatMessagesResponse;

const TERMINAL_TOOLS = new Set([
  "convex_create_message_card",
  "convex_chat_reply",
  "convex_send_sms",
  "convex_send_briefing",
]);

export type LlmRouteResult = SmsRoutePlan & {
  routedBy: "llm" | "fallback";
};

export async function routeInboundSmsWithLlm(input: {
  from: string;
  body: string;
  accountHints?: string;
  openCardHints?: string;
}): Promise<LlmRouteResult> {
  const apiKey = process.env.BACKBOARD_API_KEY;
  if (!apiKey) {
    return { ...routeInboundSms(input), routedBy: "fallback" };
  }

  const catalog = SMS_ROUTABLE_TOOLS.map(
    (t) => `- ${t.name}: ${t.description} Args: ${t.argsHint}`,
  ).join("\n");

  const prompt = `
You are Kin's SMS routing planner. Given an inbound text message, choose which backend tools to run BEFORE the system sends a reply.

AVAILABLE TOOLS (only these names are valid):
${catalog}

RULES:
1. Return ONLY valid JSON (no markdown, no prose outside JSON).
2. Pick 0–6 tools that help answer the user's intent. Omit tools that are not needed.
3. Do NOT include: convex_create_message_card, convex_chat_reply, convex_send_sms (the system adds those automatically unless you chose convex_send_briefing).
4. Use convex_send_briefing ONLY when the user clearly wants a morning briefing / daily summary. Otherwise do not include it.
5. For convex_get_forecast include a real accountId from ACCOUNT HINTS below.
6. Never invent tool names.

ACCOUNT HINTS (Convex ids — use for forecast args):
${input.accountHints ?? "(none)"}

OPEN ALERTS:
${input.openCardHints ?? "(none)"}

SENDER PHONE: ${input.from}

INBOUND MESSAGE:
"${input.body.replace(/"/g, '\\"')}"

JSON shape:
{
  "summary": "one short line explaining the plan",
  "tools": [
    { "tool": "convex_get_accounts", "args": {}, "reason": "why this tool" }
  ]
}
`.trim();

  try {
    const bb = new BackboardClient({ apiKey });
    const r = asChat(
      await bb.sendMessage({
        content: prompt,
        memory: "Off",
        ...MODEL,
      }),
    );
    const raw = (r.content ?? "").trim();
    const parsed = parseRouterJson(raw);
    if (!parsed) {
      console.error("smsLlmRouter: invalid JSON from Backboard:", raw.slice(0, 500));
      return { ...routeInboundSms(input), routedBy: "fallback" };
    }

    const steps: SmsPlanStep[] = [];
    for (const t of parsed.tools) {
      if (!SMS_ROUTABLE_TOOL_NAMES.has(t.tool)) continue;
      if (TERMINAL_TOOLS.has(t.tool)) continue;
      const args = { ...t.args };
      if (t.tool === "convex_send_briefing") {
        args.phone = input.from;
      }
      steps.push({
        tool: t.tool,
        args,
        reason: t.reason || "Chosen by routing LLM",
      });
    }

    const finalized = finalizeSmsPlan(steps, input.from, input.body);
    return {
      summary: parsed.summary || `LLM plan for: ${input.body.slice(0, 60)}`,
      recommendedTools: finalized,
      routedBy: "llm",
    };
  } catch (err) {
    console.error("smsLlmRouter Backboard error:", err);
    return { ...routeInboundSms(input), routedBy: "fallback" };
  }
}

function parseRouterJson(
  raw: string,
): { summary?: string; tools: Array<{ tool: string; args: Record<string, unknown>; reason?: string }> } | null {
  const jsonStr = extractJsonObject(raw);
  if (!jsonStr) return null;
  try {
    const data = JSON.parse(jsonStr) as {
      summary?: string;
      tools?: Array<{ tool: string; args?: Record<string, unknown>; reason?: string }>;
    };
    if (!Array.isArray(data.tools)) return null;
    return {
      summary: data.summary,
      tools: data.tools.map((t) => ({
        tool: t.tool,
        args: t.args ?? {},
        reason: t.reason,
      })),
    };
  } catch {
    return null;
  }
}

function extractJsonObject(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return raw.slice(start, end + 1);
  return null;
}

/** Always append feed log + reply path (chat or briefing). */
export function finalizeSmsPlan(
  steps: SmsPlanStep[],
  from: string,
  body: string,
): SmsPlanStep[] {
  const core = steps.filter((s) => !TERMINAL_TOOLS.has(s.tool));
  const wantsBriefing = core.some((s) => s.tool === "convex_send_briefing");

  core.push({
    tool: "convex_create_message_card",
    args: { from, body, receivedAt: Date.now() },
    reason: "Log inbound SMS on the feed",
  });

  if (wantsBriefing) {
    for (const s of core) {
      if (s.tool === "convex_send_briefing") s.args = { ...s.args, phone: from };
    }
  } else {
    core.push(
      {
        tool: "convex_chat_reply",
        args: { phone: from, body },
        reason: "Generate guardian reply via Backboard",
      },
      {
        tool: "convex_send_sms",
        args: { to: from, body: "__REPLY__" },
        reason: "Send reply back over Twilio",
      },
    );
  }

  return dedupeSteps(core);
}
