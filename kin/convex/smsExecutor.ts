/**
 * Executes MCP-named tool steps inside Convex actions (handleInboundSms).
 */

import { api } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { SmsPlanStep } from "./smsRouter";

export type StepResult = {
  tool: string;
  ok: boolean;
  result?: unknown;
  error?: string;
};

export type ExecuteState = {
  reply?: string;
};

export async function executeSmsPlanStep(
  ctx: ActionCtx,
  step: SmsPlanStep,
  state: ExecuteState,
): Promise<StepResult> {
  const { tool, args } = step;
  try {
    switch (tool) {
      case "convex_get_accounts":
        return ok(tool, await ctx.runQuery(api.queries.getAccounts, {}));

      case "convex_get_transactions":
        return ok(
          tool,
          await ctx.runQuery(api.queries.getRecentTransactions, {
            limit: args.limit as number | undefined,
            accountId: args.accountId as Id<"accounts"> | undefined,
          }),
        );

      case "convex_get_agreements":
        return ok(
          tool,
          await ctx.runQuery(api.queries.getAgreements, {
            status: args.status as
              | "open"
              | "requested"
              | "settled"
              | undefined,
          }),
        );

      case "convex_get_goals":
        return ok(tool, await ctx.runQuery(api.queries.getGoals, {}));

      case "convex_get_cards":
        return ok(
          tool,
          await ctx.runQuery(api.queries.getCards, {
            includeResolved: args.includeResolved as boolean | undefined,
          }),
        );

      case "convex_get_subscribers":
        return ok(
          tool,
          await ctx.runQuery(api.queries.getSubscribers, {
            activeOnly: args.activeOnly as boolean | undefined,
          }),
        );

      case "convex_get_subscriptions":
        return ok(
          tool,
          await ctx.runQuery(api.queries.getSubscriptions, {
            accountId: args.accountId as Id<"accounts"> | undefined,
          }),
        );

      case "convex_get_sources":
        return ok(tool, await ctx.runQuery(api.sources.getSources, {}));

      case "convex_get_forecast":
        return ok(
          tool,
          await ctx.runQuery(api.engine.getForecast, {
            accountId: args.accountId as Id<"accounts">,
          }),
        );

      case "convex_get_baseline":
        return ok(
          tool,
          await ctx.runQuery(api.engine.getBaseline, {
            accountId: args.accountId as Id<"accounts">,
          }),
        );

      case "convex_run_detection":
        return ok(tool, await ctx.runMutation(api.engine.runDetection, {}));

      case "convex_create_message_card":
        return ok(
          tool,
          await ctx.runMutation(api.mutations.createMessageCard, {
            from: args.from as string,
            to: args.to as string | undefined,
            body: args.body as string,
            messageSid: args.messageSid as string | undefined,
            receivedAt: args.receivedAt as number,
          }),
        );

      case "convex_chat_reply": {
        const r = await ctx.runAction(api.agent.chatReply, {
          phone: args.phone as string,
          body: args.body as string,
        });
        state.reply = r.reply;
        return ok(tool, r);
      }

      case "convex_send_sms": {
        const body =
          args.body === "__REPLY__"
            ? (state.reply ?? "")
            : (args.body as string);
        if (!body) {
          return { tool, ok: false, error: "No reply text to send" };
        }
        const r = await ctx.runAction(api.twilioSend.sendSms, {
          to: args.to as string,
          body,
        });
        return {
          tool,
          ok: r.ok,
          result: r,
          error: r.ok ? undefined : r.error,
        };
      }

      case "convex_send_briefing": {
        const r = await ctx.runAction(api.briefing.sendBriefingTo, {
          phone: args.phone as string,
        });
        if (r.ok && r.body) state.reply = r.body;
        return {
          tool,
          ok: r.ok,
          result: r,
          error: r.ok ? undefined : r.reason,
        };
      }

      default:
        return {
          tool,
          ok: false,
          error: `Unknown or unsupported SMS plan tool: ${tool}`,
        };
    }
  } catch (e: unknown) {
    return {
      tool,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function ok(tool: string, result: unknown): StepResult {
  return { tool, ok: true, result };
}
