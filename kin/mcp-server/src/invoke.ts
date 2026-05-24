import { api } from "../../convex/_generated/api.js";
import { getConvexClient } from "./convex-client.js";
import { TOOL_BY_NAME } from "./registry.js";

export async function invokeKinTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const def = TOOL_BY_NAME.get(name);
  if (!def) {
    throw new Error(`Unknown tool: ${name}`);
  }

  const client = getConvexClient();

  switch (name) {
    // Queries
    case "convex_get_accounts":
      return client.query(api.queries.getAccounts, {});
    case "convex_get_transactions":
      return client.query(api.queries.getRecentTransactions, {
        limit: args.limit as number | undefined,
        accountId: args.accountId as never,
      });
    case "convex_get_agreements":
      return client.query(api.queries.getAgreements, {
        status: args.status as "open" | "requested" | "settled" | undefined,
      });
    case "convex_get_goals":
      return client.query(api.queries.getGoals, {});
    case "convex_get_cards":
      return client.query(api.queries.getCards, {
        includeResolved: args.includeResolved as boolean | undefined,
      });
    case "convex_get_subscribers":
      return client.query(api.queries.getSubscribers, {
        activeOnly: args.activeOnly as boolean | undefined,
      });
    case "convex_get_subscriptions":
      return client.query(api.queries.getSubscriptions, {
        accountId: args.accountId as never,
      });
    case "convex_get_sources":
      return client.query(api.sources.getSources, {});
    case "convex_get_accounts_by_source":
      return client.query(api.sources.getAccountsBySource, {});
    case "convex_get_baseline":
      return client.query(api.engine.getBaseline, {
        accountId: args.accountId as never,
      });
    case "convex_get_forecast":
      return client.query(api.engine.getForecast, {
        accountId: args.accountId as never,
      });
    case "convex_get_agent_state":
      return client.query(api.agentState.getState, {});

    // Mutations
    case "convex_seed_demo":
      return client.mutation(api.seedDemo.seedDemo, {});
    case "convex_run_detection":
      return client.mutation(api.engine.runDetection, {
        accountId: args.accountId as never,
      });
    case "convex_dismiss_card":
      return client.mutation(api.engine.dismissCard, {
        cardId: args.cardId as never,
      });
    case "convex_move_money":
      return client.mutation(api.mutations.moveMoney, {
        fromAccountId: args.fromAccountId as never,
        toAccountId: args.toAccountId as never,
        amountCents: args.amountCents as number,
        memo: args.memo as string | undefined,
      });
    case "convex_send_etransfer_request":
      return client.mutation(api.mutations.sendEtransferRequest, {
        agreementId: args.agreementId as never,
      });
    case "convex_settle_agreement":
      return client.mutation(api.mutations.settleAgreement, {
        agreementId: args.agreementId as never,
      });
    case "convex_update_card_body":
      return client.mutation(api.mutations.updateCardBody, {
        cardId: args.cardId as never,
        body: args.body as string,
        title: args.title as string | undefined,
      });
    case "convex_set_card_actions":
      return client.mutation(api.mutations.setCardActions, {
        cardId: args.cardId as never,
        actions: args.actions as never,
      });
    case "convex_resolve_card":
      return client.mutation(api.mutations.resolveCard, {
        cardId: args.cardId as never,
        status: args.status as "open" | "resolved" | "dismissed" | undefined,
      });
    case "convex_create_message_card":
      return client.mutation(api.mutations.createMessageCard, {
        from: args.from as string,
        body: args.body as string,
        receivedAt: args.receivedAt as number,
        to: args.to as string | undefined,
        messageSid: args.messageSid as string | undefined,
      });
    case "convex_subscribe":
      return client.mutation(api.mutations.subscribe, {
        phone: args.phone as string,
        name: args.name as string,
        personId: args.personId as never,
        briefingHourLocal: args.briefingHourLocal as number | undefined,
        tz: args.tz as string | undefined,
      });
    case "convex_unsubscribe":
      return client.mutation(api.mutations.unsubscribe, {
        phone: args.phone as string,
      });
    case "convex_set_person_phone":
      return client.mutation(api.mutations.setPersonPhone, {
        personId: args.personId as never,
        phone: args.phone as string,
      });
    case "convex_get_phone_assistant":
      return client.mutation(api.mutations.getPhoneAssistant, {
        phone: args.phone as string,
      });
    case "convex_set_phone_assistant":
      return client.mutation(api.mutations.setPhoneAssistant, {
        phone: args.phone as string,
        assistantId: args.assistantId as string,
        threadId: args.threadId as string,
      });
    case "convex_mark_phone_assistant_primed":
      return client.mutation(api.mutations.markPhoneAssistantPrimed, {
        phone: args.phone as string,
      });
    case "convex_update_phone_assistant_thread":
      return client.mutation(api.mutations.updatePhoneAssistantThread, {
        phone: args.phone as string,
        threadId: args.threadId as string,
      });
    case "convex_agent_state_get_or_create":
      return client.mutation(api.agentState.getOrCreateAssistant, {});
    case "convex_agent_state_set_assistant":
      return client.mutation(api.agentState.setAssistant, {
        assistantId: args.assistantId as string,
        threadId: args.threadId as string,
      });
    case "convex_agent_state_mark_primed":
      return client.mutation(api.agentState.markPrimed, {});
    case "convex_agent_state_update_thread":
      return client.mutation(api.agentState.updateThread, {
        threadId: args.threadId as string,
      });
    case "convex_agent_state_reset":
      return client.mutation(api.agentState.reset, {});

    // Actions
    case "convex_run_agent":
      return client.action(api.agent.runAgent, { cardId: args.cardId as never });
    case "convex_execute_card_action":
      return client.action(api.agent.executeAction, {
        cardId: args.cardId as never,
        actionId: args.actionId as string,
      });
    case "convex_place_call":
      return client.action(api.agent.placeCall, { cardId: args.cardId as never });
    case "convex_bootstrap_demo":
      return client.action(api.agent.bootstrapDemo, {});
    case "convex_chat_reply":
      return client.action(api.agent.chatReply, {
        phone: args.phone as string,
        body: args.body as string,
      });
    case "convex_plan_inbound_sms":
      return client.action(api.agent.planInboundSms, {
        phone: args.phone as string,
        body: args.body as string,
      });
    case "convex_handle_inbound_sms":
      return client.action(api.agent.handleInboundSms, {
        phone: args.phone as string,
        body: args.body as string,
        messageSid: args.messageSid as string | undefined,
        to: args.to as string | undefined,
        execute: args.execute as boolean | undefined,
        skipMessageCard: args.skipMessageCard as boolean | undefined,
      });
    case "convex_send_sms":
      return client.action(api.twilioSend.sendSms, {
        to: args.to as string,
        body: args.body as string,
      });
    case "convex_morning_briefing":
      return client.action(api.briefing.morningBriefing, {});
    case "convex_send_briefing":
      return client.action(api.briefing.sendBriefingTo, {
        phone: args.phone as string,
      });
    case "convex_backboard_spike":
      return client.action(api.spike.backboardSpike, {
        reset: args.reset as boolean | undefined,
      });
    case "convex_backboard_send_message":
      return client.action(api.backboardActions.sendMessage, {
        content: args.content as string,
        assistantId: args.assistantId as string | undefined,
        threadId: args.threadId as string | undefined,
        memory: args.memory as "Auto" | "Off" | undefined,
      });
    case "convex_backboard_add_memory":
      return client.action(api.backboardActions.addMemory, {
        assistantId: args.assistantId as string,
        content: args.content as string,
        metadata: args.metadata,
      });
    case "convex_backboard_search_memories":
      return client.action(api.backboardActions.searchMemories, {
        assistantId: args.assistantId as string,
        query: args.query as string,
        limit: args.limit as number | undefined,
      });
    case "convex_backboard_submit_tool_outputs":
      return client.action(api.backboardActions.submitToolOutputs, {
        threadId: args.threadId as string,
        toolOutputs: args.toolOutputs as { tool_call_id: string; output: string }[],
      });

    default:
      throw new Error(`Tool not wired in invoke.ts: ${name}`);
  }
}

export function jsonResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, replacer, 2),
      },
    ],
  };
}

function replacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  return value;
}
