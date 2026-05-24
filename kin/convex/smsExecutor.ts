/**
 * Executes MCP-named tool steps inside Convex actions (handleInboundSms).
 *
 * Performance shape:
 *   - `Preloaded` is the snapshot `handleInboundSms` fetches once at the top of
 *     the request. When `state.preloaded` is set, this executor serves the
 *     `convex_get_accounts/agreements/cards/subscribers` cases from cache
 *     instead of re-querying Convex.
 *
 * The phase-classification sets (`PRELOADED_TOOLS`, `TERMINAL_TOOLS`) live in
 * `agent.ts` (where the orchestrator uses them). They intentionally do NOT
 * cross the Node ↔ Convex-isolate bundler boundary as runtime values — only
 * the `executeSmsPlanStep` function does, which marshals cleanly.
 */

import { api } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { SourceLabel } from "./sources";
import type { SmsPlanStep } from "./smsRouter";

export type StepResult = {
  tool: string;
  ok: boolean;
  result?: unknown;
  error?: string;
};

// `Preloaded` mirrors the shape that handleInboundSms fetches at the top of
// each inbound SMS. We define it from `Doc<...>` (not `FunctionReturnType<...>`)
// to avoid the api.d.ts ↔ agent.ts type cycle that otherwise collapses these
// to `any` inside the chat-reply helper.
export type PreloadedAccount = Doc<"accounts"> & { source: SourceLabel };
export type PreloadedAgreement = Doc<"agreements"> & {
  fromName: string;
  toName: string;
  fromDisplayName: string;
  toDisplayName: string;
  source: "inbox";
};
export type PreloadedCard = Doc<"cards">;
export type PreloadedSubscriber = Doc<"subscribers">;

export type Preloaded = {
  accounts: PreloadedAccount[];
  agreements: PreloadedAgreement[];
  cards: PreloadedCard[];
  subscribers: PreloadedSubscriber[];
};

export type ExecuteState = {
  reply?: string;
  preloaded?: Preloaded;
};

export async function executeSmsPlanStep(
  ctx: ActionCtx,
  step: SmsPlanStep,
  state: ExecuteState,
): Promise<StepResult> {
  const { tool, args } = step;

  // If `handleInboundSms` already loaded this data into `state.preloaded`,
  // serve it from cache instead of re-querying Convex.
  if (state.preloaded) {
    switch (tool) {
      case "convex_get_accounts":
        return ok(tool, state.preloaded.accounts);
      case "convex_get_agreements":
        return ok(tool, state.preloaded.agreements);
      case "convex_get_cards":
        return ok(tool, state.preloaded.cards);
      case "convex_get_subscribers":
        return ok(tool, state.preloaded.subscribers);
    }
  }

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
        // NOTE: when called from `handleInboundSms`, that path short-circuits
        // this step and calls `runChatReplyWithContext` directly so we skip
        // both the action cold-start and the duplicate context fetch. This
        // branch is the fallback for external callers of the executor.
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
