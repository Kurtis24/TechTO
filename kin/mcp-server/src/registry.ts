import { z } from "zod";

export type ToolKind = "query" | "mutation" | "action";

export type KinToolDef = {
  name: string;
  description: string;
  kind: ToolKind;
  /** Convex module:function for docs */
  convexRef: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  smsTriggers?: string[];
};

const empty = z.object({});

export const KIN_TOOL_REGISTRY: KinToolDef[] = [
  // ─── Queries ─────────────────────────────────────────────────────────────
  {
    name: "convex_get_accounts",
    description: "List household accounts with balances and source labels (td-alex, rbc-dana, etc.).",
    kind: "query",
    convexRef: "queries:getAccounts",
    inputSchema: empty,
    smsTriggers: ["balance", "account", "how much"],
  },
  {
    name: "convex_get_transactions",
    description: "Recent transactions, optionally filtered by account.",
    kind: "query",
    convexRef: "queries:getRecentTransactions",
    inputSchema: z.object({
      limit: z.number().optional(),
      accountId: z.string().optional(),
    }),
  },
  {
    name: "convex_get_agreements",
    description: "Money owed between household members (open/requested/settled).",
    kind: "query",
    convexRef: "queries:getAgreements",
    inputSchema: z.object({
      status: z.enum(["open", "requested", "settled"]).optional(),
    }),
    smsTriggers: ["owe", "dana", "transfer"],
  },
  {
    name: "convex_get_goals",
    description: "Household savings goals.",
    kind: "query",
    convexRef: "queries:getGoals",
    inputSchema: empty,
  },
  {
    name: "convex_get_cards",
    description: "Feed alert cards (overdraft, duplicate, creep, outlier).",
    kind: "query",
    convexRef: "queries:getCards",
    inputSchema: z.object({
      includeResolved: z.boolean().optional(),
    }),
    smsTriggers: ["alert", "overdraft", "charge"],
  },
  {
    name: "convex_get_subscribers",
    description: "SMS briefing subscribers.",
    kind: "query",
    convexRef: "queries:getSubscribers",
    inputSchema: z.object({
      activeOnly: z.boolean().optional(),
    }),
  },
  {
    name: "convex_get_subscriptions",
    description: "Recurring subscriptions with creep flags.",
    kind: "query",
    convexRef: "queries:getSubscriptions",
    inputSchema: z.object({
      accountId: z.string().optional(),
    }),
  },
  {
    name: "convex_get_sources",
    description: "Cross-silo source metadata (banks + inbox).",
    kind: "query",
    convexRef: "sources:getSources",
    inputSchema: empty,
  },
  {
    name: "convex_get_accounts_by_source",
    description: "Accounts grouped by source label.",
    kind: "query",
    convexRef: "sources:getAccountsBySource",
    inputSchema: empty,
  },
  {
    name: "convex_get_baseline",
    description: "Normal spending baseline for one account (requires accountId).",
    kind: "query",
    convexRef: "engine:getBaseline",
    inputSchema: z.object({ accountId: z.string() }),
  },
  {
    name: "convex_get_forecast",
    description: "7-day overdraft forecast for one account (requires accountId).",
    kind: "query",
    convexRef: "engine:getForecast",
    inputSchema: z.object({ accountId: z.string() }),
    smsTriggers: ["overdraft", "rent"],
  },
  {
    name: "convex_get_agent_state",
    description: "Singleton Backboard assistant/thread IDs for the feed agent.",
    kind: "query",
    convexRef: "agentState:getState",
    inputSchema: empty,
  },

  // ─── Mutations ───────────────────────────────────────────────────────────
  {
    name: "convex_seed_demo",
    description: "Reset and reseed the alex & dana demo dataset.",
    kind: "mutation",
    convexRef: "seedDemo:seedDemo",
    inputSchema: empty,
  },
  {
    name: "convex_run_detection",
    description: "Run the detection engine (overdraft, dup, creep, outlier cards).",
    kind: "mutation",
    convexRef: "engine:runDetection",
    inputSchema: z.object({ accountId: z.string().optional() }),
  },
  {
    name: "convex_dismiss_card",
    description: "Dismiss a feed card.",
    kind: "mutation",
    convexRef: "engine:dismissCard",
    inputSchema: z.object({ cardId: z.string() }),
  },
  {
    name: "convex_create_goal",
    description: "Create a new savings goal or budget (name, targetCents in cents, deadline unix ms).",
    kind: "mutation",
    convexRef: "mutations:createGoal",
    inputSchema: z.object({
      name: z.string(),
      targetCents: z.number(),
      deadline: z.number(),
      savedCents: z.number().optional(),
    }),
    smsTriggers: ["goal", "budget", "save for", "saving for"],
  },
  {
    name: "convex_update_goal",
    description: "Update an existing goal's name, target, deadline, or saved amount.",
    kind: "mutation",
    convexRef: "mutations:updateGoal",
    inputSchema: z.object({
      goalId: z.string(),
      name: z.string().optional(),
      targetCents: z.number().optional(),
      deadline: z.number().optional(),
      savedCents: z.number().optional(),
    }),
    smsTriggers: ["update goal", "change goal", "edit goal"],
  },
  {
    name: "convex_delete_goal",
    description: "Delete a savings goal by its ID.",
    kind: "mutation",
    convexRef: "mutations:deleteGoal",
    inputSchema: z.object({ goalId: z.string() }),
    smsTriggers: ["delete goal", "remove goal", "cancel goal"],
  },
  {
    name: "convex_add_savings_to_goal",
    description: "Record money saved toward a goal — increments the savedCents field.",
    kind: "mutation",
    convexRef: "mutations:addSavingsToGoal",
    inputSchema: z.object({
      goalId: z.string(),
      amountCents: z.number(),
    }),
    smsTriggers: ["saved toward", "put toward", "added to goal"],
  },
  {
    name: "convex_move_money",
    description: "Transfer between accounts (amount in cents).",
    kind: "mutation",
    convexRef: "mutations:moveMoney",
    inputSchema: z.object({
      fromAccountId: z.string(),
      toAccountId: z.string(),
      amountCents: z.number(),
      memo: z.string().optional(),
    }),
    smsTriggers: ["move", "savings", "transfer"],
  },
  {
    name: "convex_send_etransfer_request",
    description: "Mark an agreement as e-transfer requested.",
    kind: "mutation",
    convexRef: "mutations:sendEtransferRequest",
    inputSchema: z.object({ agreementId: z.string() }),
  },
  {
    name: "convex_settle_agreement",
    description: "Settle an agreement and move money between chequing accounts.",
    kind: "mutation",
    convexRef: "mutations:settleAgreement",
    inputSchema: z.object({ agreementId: z.string() }),
  },
  {
    name: "convex_update_card_body",
    description: "Update a card title/body.",
    kind: "mutation",
    convexRef: "mutations:updateCardBody",
    inputSchema: z.object({
      cardId: z.string(),
      body: z.string(),
      title: z.string().optional(),
    }),
  },
  {
    name: "convex_set_card_actions",
    description: "Replace action buttons on a card.",
    kind: "mutation",
    convexRef: "mutations:setCardActions",
    inputSchema: z.object({
      cardId: z.string(),
      actions: z.array(
        z.object({
          id: z.string(),
          label: z.string(),
          kind: z.string(),
          params: z.unknown(),
        }),
      ),
    }),
  },
  {
    name: "convex_resolve_card",
    description: "Resolve or dismiss a card by status.",
    kind: "mutation",
    convexRef: "mutations:resolveCard",
    inputSchema: z.object({
      cardId: z.string(),
      status: z.enum(["open", "resolved", "dismissed"]).optional(),
    }),
  },
  {
    name: "convex_create_message_card",
    description: "Log an inbound SMS on the feed.",
    kind: "mutation",
    convexRef: "mutations:createMessageCard",
    inputSchema: z.object({
      from: z.string(),
      body: z.string(),
      receivedAt: z.number(),
      to: z.string().optional(),
      messageSid: z.string().optional(),
    }),
  },
  {
    name: "convex_subscribe",
    description: "Subscribe a phone to morning briefings.",
    kind: "mutation",
    convexRef: "mutations:subscribe",
    inputSchema: z.object({
      phone: z.string(),
      name: z.string(),
      personId: z.string().optional(),
      briefingHourLocal: z.number().optional(),
      tz: z.string().optional(),
    }),
  },
  {
    name: "convex_unsubscribe",
    description: "Deactivate briefing subscription for a phone.",
    kind: "mutation",
    convexRef: "mutations:unsubscribe",
    inputSchema: z.object({ phone: z.string() }),
  },
  {
    name: "convex_set_person_phone",
    description: "Attach E.164 phone to a people row.",
    kind: "mutation",
    convexRef: "mutations:setPersonPhone",
    inputSchema: z.object({ personId: z.string(), phone: z.string() }),
  },
  {
    name: "convex_get_phone_assistant",
    description: "Per-phone Backboard assistant state.",
    kind: "mutation",
    convexRef: "mutations:getPhoneAssistant",
    inputSchema: z.object({ phone: z.string() }),
  },
  {
    name: "convex_set_phone_assistant",
    description: "Store per-phone Backboard assistant/thread IDs.",
    kind: "mutation",
    convexRef: "mutations:setPhoneAssistant",
    inputSchema: z.object({
      phone: z.string(),
      assistantId: z.string(),
      threadId: z.string(),
    }),
  },
  {
    name: "convex_mark_phone_assistant_primed",
    description: "Mark per-phone Backboard memory as primed.",
    kind: "mutation",
    convexRef: "mutations:markPhoneAssistantPrimed",
    inputSchema: z.object({ phone: z.string() }),
  },
  {
    name: "convex_update_phone_assistant_thread",
    description: "Update per-phone Backboard thread ID.",
    kind: "mutation",
    convexRef: "mutations:updatePhoneAssistantThread",
    inputSchema: z.object({ phone: z.string(), threadId: z.string() }),
  },
  {
    name: "convex_agent_state_get_or_create",
    description: "Get feed agent Backboard assistant row.",
    kind: "mutation",
    convexRef: "agentState:getOrCreateAssistant",
    inputSchema: empty,
  },
  {
    name: "convex_agent_state_set_assistant",
    description: "Set feed agent Backboard assistant/thread.",
    kind: "mutation",
    convexRef: "agentState:setAssistant",
    inputSchema: z.object({
      assistantId: z.string(),
      threadId: z.string(),
    }),
  },
  {
    name: "convex_agent_state_mark_primed",
    description: "Mark feed agent memory primed.",
    kind: "mutation",
    convexRef: "agentState:markPrimed",
    inputSchema: empty,
  },
  {
    name: "convex_agent_state_update_thread",
    description: "Update feed agent thread ID.",
    kind: "mutation",
    convexRef: "agentState:updateThread",
    inputSchema: z.object({ threadId: z.string() }),
  },
  {
    name: "convex_agent_state_reset",
    description: "Wipe feed agent Backboard state (demo reseed).",
    kind: "mutation",
    convexRef: "agentState:reset",
    inputSchema: empty,
  },

  // ─── Actions (agent, Twilio, briefing, Backboard) ────────────────────────
  {
    name: "convex_run_agent",
    description: "Run Backboard guardian reasoning on an overdraft card.",
    kind: "action",
    convexRef: "agent:runAgent",
    inputSchema: z.object({ cardId: z.string() }),
  },
  {
    name: "convex_execute_card_action",
    description: "Execute a one-tap action on a card (e-transfer, move money, etc.).",
    kind: "action",
    convexRef: "agent:executeAction",
    inputSchema: z.object({ cardId: z.string(), actionId: z.string() }),
  },
  {
    name: "convex_place_call",
    description: "Generate ElevenLabs TTS call audio for the hero card.",
    kind: "action",
    convexRef: "agent:placeCall",
    inputSchema: z.object({ cardId: z.string() }),
  },
  {
    name: "convex_bootstrap_demo",
    description: "Reseed, run detection, and run agent on overdraft card.",
    kind: "action",
    convexRef: "agent:bootstrapDemo",
    inputSchema: empty,
  },
  {
    name: "convex_chat_reply",
    description: "Backboard SMS reply for an inbound message (per-phone memory).",
    kind: "action",
    convexRef: "agent:chatReply",
    inputSchema: z.object({ phone: z.string(), body: z.string() }),
    smsTriggers: ["default reply"],
  },
  {
    name: "convex_plan_inbound_sms",
    description:
      "Semantic tool plan for an inbound SMS via Backboard LLM (dry run, no execution).",
    kind: "action",
    convexRef: "agent:planInboundSms",
    inputSchema: z.object({
      phone: z.string(),
      body: z.string(),
    }),
    smsTriggers: ["route", "plan"],
  },
  {
    name: "convex_handle_inbound_sms",
    description:
      "Full inbound SMS pipeline: LLM route tools, execute, reply via Twilio. Same as production webhook.",
    kind: "action",
    convexRef: "agent:handleInboundSms",
    inputSchema: z.object({
      phone: z.string(),
      body: z.string(),
      messageSid: z.string().optional(),
      to: z.string().optional(),
      execute: z.boolean().optional(),
      skipMessageCard: z.boolean().optional(),
    }),
    smsTriggers: ["inbound sms"],
  },
  {
    name: "convex_send_sms",
    description: "Send outbound SMS via Twilio (Convex action).",
    kind: "action",
    convexRef: "twilioSend:sendSms",
    inputSchema: z.object({ to: z.string(), body: z.string() }),
  },
  {
    name: "convex_morning_briefing",
    description: "Cron: send morning briefing to all active subscribers.",
    kind: "action",
    convexRef: "briefing:morningBriefing",
    inputSchema: empty,
  },
  {
    name: "convex_send_briefing",
    description: "Build and send a morning briefing to one phone.",
    kind: "action",
    convexRef: "briefing:sendBriefingTo",
    inputSchema: z.object({ phone: z.string() }),
    smsTriggers: ["brief", "briefing", "morning"],
  },
  {
    name: "convex_backboard_spike",
    description: "Backboard integration test (memory + tool roundtrip).",
    kind: "action",
    convexRef: "spike:backboardSpike",
    inputSchema: z.object({ reset: z.boolean().optional() }),
  },
  {
    name: "convex_backboard_send_message",
    description: "Send a Backboard LLM message (optional assistant/thread).",
    kind: "action",
    convexRef: "backboardActions:sendMessage",
    inputSchema: z.object({
      content: z.string(),
      assistantId: z.string().optional(),
      threadId: z.string().optional(),
      memory: z.enum(["Auto", "Off"]).optional(),
    }),
  },
  {
    name: "convex_backboard_add_memory",
    description: "Store a fact in Backboard assistant memory.",
    kind: "action",
    convexRef: "backboardActions:addMemory",
    inputSchema: z.object({
      assistantId: z.string(),
      content: z.string(),
      metadata: z.unknown().optional(),
    }),
  },
  {
    name: "convex_backboard_search_memories",
    description: "Semantic search over Backboard memories.",
    kind: "action",
    convexRef: "backboardActions:searchMemories",
    inputSchema: z.object({
      assistantId: z.string(),
      query: z.string(),
      limit: z.number().optional(),
    }),
  },
  {
    name: "convex_backboard_submit_tool_outputs",
    description: "Complete a Backboard tool-call roundtrip.",
    kind: "action",
    convexRef: "backboardActions:submitToolOutputs",
    inputSchema: z.object({
      threadId: z.string(),
      toolOutputs: z.array(
        z.object({
          tool_call_id: z.string(),
          output: z.string(),
        }),
      ),
    }),
  },
];

export const TOOL_BY_NAME = new Map(
  KIN_TOOL_REGISTRY.map((t) => [t.name, t]),
);

export function toolCatalogJson(): string {
  return JSON.stringify(
    KIN_TOOL_REGISTRY.map((t) => ({
      name: t.name,
      description: t.description,
      kind: t.kind,
      convexRef: t.convexRef,
      smsTriggers: t.smsTriggers,
    })),
    null,
    2,
  );
}
