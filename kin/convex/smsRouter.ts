/**
 * Pure SMS routing — maps inbound text to a tool execution plan.
 * Shared by agent.handleInboundSms and the MCP kin_route_inbound_sms tool.
 */

export type SmsPlanStep = {
  /** MCP tool name (convex_* prefix) */
  tool: string;
  args: Record<string, unknown>;
  reason: string;
};

export type SmsRoutePlan = {
  summary: string;
  recommendedTools: SmsPlanStep[];
};

const lower = (s: string) => s.toLowerCase();

export function routeInboundSms(input: {
  from: string;
  body: string;
}): SmsRoutePlan {
  const { from, body } = input;
  const text = lower(body);
  const steps: SmsPlanStep[] = [];

  // Always gather household context (matches MCP tool catalog).
  steps.push(
    {
      tool: "convex_get_accounts",
      args: {},
      reason: "Load balances for factual SMS replies",
    },
    {
      tool: "convex_get_agreements",
      args: {},
      reason: "Open debts / e-transfer context",
    },
    {
      tool: "convex_get_cards",
      args: {},
      reason: "Active alerts the texter may ask about",
    },
    {
      tool: "convex_get_subscribers",
      args: { activeOnly: false },
      reason: "Resolve sender name from phone",
    },
  );

  if (
    /\b(balance|how much|chequing|checking|account|money left)\b/.test(text)
  ) {
    // Forecast requires accountId — chatReply already includes balances.
    steps.push({
      tool: "convex_get_accounts",
      args: {},
      reason: "User asked about balance (accounts query)",
    });
  }

  if (/\b(owe|owed|dana|transfer|e-?transfer|pay me|pay back)\b/.test(text)) {
    steps.push({
      tool: "convex_get_agreements",
      args: { status: "open" },
      reason: "User mentioned debt or Dana",
    });
  }

  if (/\b(move|savings|pull|cover)\b/.test(text)) {
    steps.push({
      tool: "convex_get_accounts",
      args: {},
      reason: "User may want an internal transfer",
    });
  }

  if (/\b(duplicate|hydro|charged twice|twice)\b/.test(text)) {
    steps.push(
      {
        tool: "convex_run_detection",
        args: {},
        reason: "User flagged a duplicate charge",
      },
      {
        tool: "convex_get_cards",
        args: { includeResolved: false },
        reason: "Surface detection cards",
      },
    );
  }

  const wantsBriefing = /\b(brief|briefing|morning|summary)\b/.test(text);

  if (/\b(overdraft|rent|saturday)\b/.test(text)) {
    steps.push({
      tool: "convex_get_cards",
      args: {},
      reason: "User asked about overdraft — surface alert cards",
    });
  }

  steps.push({
    tool: "convex_create_message_card",
    args: { from, body, receivedAt: Date.now() },
    reason: "Log inbound SMS on the feed",
  });

  if (wantsBriefing) {
    steps.push({
      tool: "convex_send_briefing",
      args: { phone: from },
      reason: "User requested a briefing (includes outbound SMS)",
    });
  } else {
    steps.push(
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

  const summary = `Inbound SMS from ${from}: "${body.slice(0, 80)}${body.length > 80 ? "…" : ""}" — ${steps.length} planned tool(s).`;

  return { summary, recommendedTools: dedupeSteps(steps) };
}

export function dedupeSteps(steps: SmsPlanStep[]): SmsPlanStep[] {
  const seen = new Set<string>();
  const out: SmsPlanStep[] = [];
  for (const s of steps) {
    const key = `${s.tool}:${JSON.stringify(s.args)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
