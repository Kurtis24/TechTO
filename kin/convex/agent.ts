"use node";

/**
 * The agent loop.
 *
 *   runAgent(cardId)        — observe → load memory → LLM reason →
 *                             produce guardian message + structured actions
 *                             → patch the card so the feed re-renders.
 *
 *   executeAction(cardId, actionId)
 *                           — user tapped an action. Dispatch the matching
 *                             mutation, write the decision back to Backboard
 *                             memory, and update card status.
 *
 *   placeCall(cardId)       — generate ElevenLabs TTS audio for the agent's
 *                             call line + a Dana reply. Returns base64 data
 *                             URLs the client plays. After the call, settle
 *                             the agreement (the call DID the work).
 *
 * Money is always integer cents. We pass it through to the LLM as dollars
 * (strings) for readability, but every state mutation is cents.
 */

import { action, type ActionCtx } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { BackboardClient, type ChatMessagesResponse } from "backboard-sdk";
import { executeSmsPlanStep, type Preloaded } from "./smsExecutor";
import { routeInboundSmsWithLlm } from "./smsLlmRouter";

// Phase classification for the SMS plan. Kept local to this Node-runtime
// file because Convex's bundler doesn't reliably surface `Set<string>` value
// exports across the Node ↔ isolate runtime boundary (functions cross fine).
// The executor handles the preloaded-cache cases by switching on the tool
// name directly, so it doesn't need its own copy of this set.
const PRELOADED_TOOLS = new Set<string>([
  "convex_get_accounts",
  "convex_get_agreements",
  "convex_get_cards",
  "convex_get_subscribers",
]);

const TERMINAL_TOOLS = new Set<string>([
  "convex_create_message_card",
  "convex_chat_reply",
  "convex_send_briefing",
  "convex_send_sms",
]);

const MODEL = {
  llm_provider: "openrouter",
  model_name: "moonshotai/kimi-k2.6",
};

// Backboard's sendMessage returns ChatMessagesResponse | AsyncGenerator — we
// never stream, so this cast is safe.
const asChat = (r: unknown) => r as ChatMessagesResponse;

const dollars = (cents: number | bigint) =>
  (Number(cents) / 100).toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
  });

function backboard() {
  const apiKey = process.env.BACKBOARD_API_KEY;
  if (!apiKey) {
    throw new Error(
      "BACKBOARD_API_KEY not set in Convex env (Settings → Environment Variables)."
    );
  }
  return new BackboardClient({ apiKey });
}

// ─── runAgent ────────────────────────────────────────────────────────────────
export const runAgent = action({
  args: { cardId: v.id("cards") },
  handler: async (ctx, { cardId }): Promise<{ ok: boolean; message: string }> => {
    // ── 1. OBSERVE: pull household state from Convex ─────────────────────────
    const accounts = await ctx.runQuery(api.queries.getAccounts, {});
    const agreements = await ctx.runQuery(api.queries.getAgreements, {});
    const goals = await ctx.runQuery(api.queries.getGoals, {});
    const subs = await ctx.runQuery(api.queries.getSubscriptions, {});
    const recentTxns = await ctx.runQuery(api.queries.getRecentTransactions, {
      limit: 30,
    });
    const allCards = await ctx.runQuery(api.queries.getCards, {});
    const card = allCards.find((c) => c._id === cardId);
    if (!card) throw new Error("Card not found");
    if (card.type !== "overdraft") {
      // For byproduct cards we don't run the agent — they're already useful.
      return { ok: true, message: card.body };
    }

    const alexChq = accounts.find((a) => a.source === "td-alex");
    const jointSavings = accounts.find((a) => a.source === "tangerine-joint");
    const danaChq = accounts.find((a) => a.source === "rbc-dana");
    const openAg = agreements.find(
      (a) => a.status === "open" && a.toName === "Alex"
    );
    const goal = goals[0];

    // ── 2. LOAD/SEED MEMORY: Backboard ───────────────────────────────────────
    const bb = backboard();
    let state = await ctx.runMutation(api.agentState.getOrCreateAssistant, {});
    if (!state) {
      // First-ever call — bootstrap a Backboard assistant + thread.
      const boot = asChat(
        await bb.sendMessage({
          content:
            "You are Kin, a household financial guardian. Acknowledge in 3 words.",
          memory: "Auto",
          ...MODEL,
        })
      );
      if (!boot.assistantId || !boot.threadId) {
        throw new Error("Backboard did not return assistantId/threadId on bootstrap.");
      }
      await ctx.runMutation(api.agentState.setAssistant, {
        assistantId: boot.assistantId,
        threadId: boot.threadId,
      });
      state = { assistantId: boot.assistantId, threadId: boot.threadId, primed: false };
    }
    let { assistantId, threadId } = state;

    // First-time wiring: prime Backboard memory with the household context
    // so the LLM sees agreements/goal/normal/decisions through `memory: "Auto"`.
    if (!state.primed) {
      const memoryItems = [
        `Agreement: Dana owes Alex ${dollars(openAg?.amountCents ?? 80000n)} for the cottage trip deposit Alex fronted.`,
        `Goal: ${goal?.name ?? "$5k trip by December"} — currently saved ${dollars(goal?.savedCents ?? 200000n)}, target ${dollars(goal?.targetCents ?? 500000n)}.`,
        `Normal: Alex earns ~$3,200 biweekly; rent $2,100 autopays the 1st; recurring bills total ~$350/mo; groceries $400-600/mo.`,
        `Decision: Alex likes Netflix — leave it alone, do not flag.`,
        `Joint savings (${dollars(jointSavings?.balanceCents ?? 200000n)}) is earmarked for the trip goal; touch only as backup.`,
      ];
      for (const content of memoryItems) {
        await bb.addMemory(assistantId, {
          content,
          metadata: { source: "kin-seed", kind: "household-context" },
        });
      }
      await ctx.runMutation(api.agentState.markPrimed, {});
    }

    // ── 3. REASON: ask the LLM for the guardian message ──────────────────────
    const upcomingRent = 210000;
    const shortfall = upcomingRent - Number(alexChq?.balanceCents ?? 0n);

    const prompt = `
You are Kin, a calm, trustworthy household financial guardian. You see across both partners' bank accounts (which their banks can't), the inbox of agreements between them, and their shared goals.

CURRENT SITUATION (today):
- Alex's TD chequing: ${dollars(alexChq?.balanceCents ?? 0n)}
- Joint Tangerine savings: ${dollars(jointSavings?.balanceCents ?? 0n)}  (earmarked for the trip goal)
- Dana's RBC chequing: ${dollars(danaChq?.balanceCents ?? 0n)}
- Rent autopay this Saturday: ${dollars(upcomingRent)}  →  projected shortfall: ${dollars(shortfall)}
- Open agreement: ${openAg ? `Dana owes Alex ${dollars(openAg.amountCents)} (${openAg.reason})` : "none"}
- Goal: ${goal ? `${goal.name}, saved ${dollars(goal.savedCents)} of ${dollars(goal.targetCents)}` : "none"}

WRITE the guardian message to Alex, 3–5 sentences max. Address Alex by name. Mention:
  1. The exact overdraft amount + when (Saturday).
  2. The *why* — that Alex fronted the cottage trip deposit Dana still owes for.
  3. The two options you've already lined up: (a) e-transfer request to Dana for ${dollars(openAg?.amountCents ?? 80000n)}, and (b) backup pull of $500 from joint savings.
  4. End by asking which to do (request, move, both, or call Dana).

Tone: like a friend who's already done the work, not a bank app. No bullet points, no emoji. Plain prose.
Return ONLY the message text — no preamble, no quotes.
`.trim();

    let agentMessage = "";
    try {
      const reply = asChat(
        await bb.sendMessage({
          content: prompt,
          assistantId,
          threadId,
          memory: "Auto",
          ...MODEL,
        })
      );
      agentMessage = (reply.content ?? "").trim();
      // Persist the threadId Backboard may have rotated (shouldn't, but safe)
      if (reply.threadId && reply.threadId !== threadId) {
        await ctx.runMutation(api.agentState.updateThread, {
          threadId: reply.threadId,
        });
        threadId = reply.threadId;
      }
    } catch (err) {
      console.error("Backboard error, falling back:", err);
    }

    // Fallback: deterministic message so the demo never fails on a flaky LLM.
    if (!agentMessage) {
      agentMessage = `Alex — heads up, you're going to overdraft Saturday. Rent (${dollars(upcomingRent)}) autopays from your TD chequing, but you're sitting at ${dollars(alexChq?.balanceCents ?? 0n)} because you fronted the cottage trip deposit. Dana still owes you ${dollars(openAg?.amountCents ?? 80000n)} from that. I've drafted the e-transfer request to Dana, and as backup I can pull $500 from your joint savings (without dipping into the trip goal). Want me to send the request, move the money, or both?`;
    }

    // ── 4. CANONICAL ACTIONS: the four hero buttons ──────────────────────────
    const canonicalActions = [
      {
        id: "send-etransfer",
        label: `Send e-transfer request to Dana (${dollars(openAg?.amountCents ?? 80000n)})`,
        kind: "send_etransfer",
        params: {
          agreementId: openAg?._id ?? null,
          amountCents: Number(openAg?.amountCents ?? 80000n),
        },
      },
      {
        id: "move-from-savings",
        label: "Move $500 from joint savings",
        kind: "move_money",
        params: {
          fromAccountId: jointSavings?._id ?? null,
          toAccountId: alexChq?._id ?? null,
          amountCents: 50000,
          memo: "Kin: overdraft backup",
        },
      },
      {
        id: "both",
        label: "Both — request + move money",
        kind: "both",
        params: {
          agreementId: openAg?._id ?? null,
          amountCents: Number(openAg?.amountCents ?? 80000n),
          fromAccountId: jointSavings?._id ?? null,
          toAccountId: alexChq?._id ?? null,
          moveAmountCents: 50000,
        },
      },
      {
        id: "call-dana",
        label: "Just call Dana",
        kind: "call_dana",
        params: {
          agreementId: openAg?._id ?? null,
          script:
            "Hey, it's Alex's assistant — you're up for $800 from the cottage trip. Want me to send the e-transfer request now?",
        },
      },
    ];

    await ctx.runMutation(api.mutations.updateCardBody, {
      cardId,
      body: agentMessage,
      title: "Overdraft Saturday — already on it",
    });
    await ctx.runMutation(api.mutations.setCardActions, {
      cardId,
      actions: canonicalActions,
    });

    return { ok: true, message: agentMessage };
  },
});

// ─── executeAction ───────────────────────────────────────────────────────────
export const executeAction = action({
  args: { cardId: v.id("cards"), actionId: v.string() },
  handler: async (
    ctx,
    { cardId, actionId }
  ): Promise<{ ok: boolean; kind: string; result: unknown }> => {
    const cards = await ctx.runQuery(api.queries.getCards, {});
    const card = cards.find((c) => c._id === cardId);
    if (!card) throw new Error("Card not found");
    const action = card.actions.find((a) => a.id === actionId);
    if (!action) throw new Error("Action not found on card");

    const p = action.params as Record<string, unknown>;
    let result: unknown = null;
    let resolveAfter = false;
    let memoryNote = "";

    switch (action.kind) {
      case "send_etransfer":
      case "send_etransfer_request": {
        if (!p.agreementId) {
          throw new Error("send_etransfer: missing agreementId on card action");
        }
        result = await ctx.runMutation(api.mutations.sendEtransferRequest, {
          agreementId: p.agreementId as Id<"agreements">,
        });
        memoryNote = `Alex approved: sent e-transfer request to Dana for ${dollars((p.amountCents as number) ?? 80000)}.`;
        resolveAfter = true;
        break;
      }
      case "move_money": {
        const move = parseMoveMoneyParams(p);
        result = await ctx.runMutation(api.mutations.moveMoney, move);
        memoryNote = `Alex approved: moved ${dollars(move.amountCents)} from joint savings to chequing as overdraft backup.`;
        resolveAfter = true;
        break;
      }
      case "both": {
        const move = parseMoveMoneyParams(p, "moveAmountCents");
        const moved = await ctx.runMutation(api.mutations.moveMoney, {
          ...move,
          memo: "Kin: overdraft backup",
        });
        if (!p.agreementId) {
          throw new Error("both: missing agreementId on card action");
        }
        const requested = await ctx.runMutation(
          api.mutations.sendEtransferRequest,
          { agreementId: p.agreementId as Id<"agreements"> },
        );
        result = { moved, requested };
        memoryNote = `Alex approved BOTH: e-transfer request sent + $500 moved from joint savings to chequing.`;
        resolveAfter = true;
        break;
      }
      case "call_dana": {
        // The call is handled by placeCall — but if for some reason the UI hits
        // this branch we still mark intent in memory.
        memoryNote = `Alex chose to call Dana directly about the $800 agreement.`;
        result = { ok: true };
        break;
      }
      case "dismiss":
      case "dispute_charge":
      case "flag_review":
      case "cancel_subscription":
      default: {
        // Byproduct cards (dup/creep/outlier) — no execution, just silence.
        await ctx.runMutation(api.engine.dismissCard, { cardId });
        memoryNote = `Alex acted on ${card.title} (${action.kind}: ${action.label}).`;
        result = { dismissed: true, kind: action.kind };
        break;
      }
    }

    if (resolveAfter) {
      await ctx.runMutation(api.mutations.resolveCard, {
        cardId,
        status: "resolved",
      });
    }

    // Write the decision back to Backboard memory (cross-session learning).
    try {
      const state = await ctx.runMutation(api.agentState.getOrCreateAssistant, {});
      if (state) {
        const bb = backboard();
        await bb.addMemory(state.assistantId, {
          content: memoryNote,
          metadata: { source: "kin-decision", cardId, actionId },
        });
      }
    } catch (err) {
      console.error("Backboard memory write failed (non-fatal):", err);
    }

    return { ok: true, kind: action.kind, result };
  },
});

// ─── placeCall ───────────────────────────────────────────────────────────────
// Generate ElevenLabs TTS for the agent's line + a short Dana reply.
// Returns base64 data URLs the client plays in-app. After the call,
// auto-settle the agreement so the demo lands the "before Saturday, handled"
// beat with balances animating live.
export const placeCall = action({
  args: { cardId: v.id("cards") },
  handler: async (
    ctx,
    { cardId }
  ): Promise<{
    agentAudio: string;
    danaAudio: string;
    agentLine: string;
    danaLine: string;
  }> => {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ELEVENLABS_API_KEY not set in Convex env (Settings → Environment Variables)."
      );
    }

    const agreements = await ctx.runQuery(api.queries.getAgreements, {});
    const openAg = agreements.find(
      (a) => a.toName === "Alex" && (a.status === "open" || a.status === "requested")
    );
    const owedDollars = openAg ? dollars(openAg.amountCents) : "$800.00";

    const agentLine = `Hey Dana, it's Alex's assistant calling. You're up for ${owedDollars} from the cottage trip deposit — Alex's rent is autopaying Saturday and it'd really help to get that squared today. Want me to send you the e-transfer request right now?`;
    const danaLine = `Oh shoot, totally — yeah send it through, I'll accept it right away. Tell Alex sorry for the delay.`;

    // ElevenLabs voice IDs (public stock voices).
    // Rachel — calm female (the assistant)
    const ASSISTANT_VOICE = "21m00Tcm4TlvDq8ikWAM";
    // Bella — warm female (Dana)
    const DANA_VOICE = "EXAVITQu4vr4xnSDxMaL";

    async function tts(voiceId: string, text: string): Promise<string> {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: {
            "xi-api-key": apiKey!,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_turbo_v2_5",
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        }
      );
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`ElevenLabs ${res.status}: ${errText}`);
      }
      const buf = await res.arrayBuffer();
      const b64 = Buffer.from(buf).toString("base64");
      return `data:audio/mpeg;base64,${b64}`;
    }

    const [agentAudio, danaAudio] = await Promise.all([
      tts(ASSISTANT_VOICE, agentLine),
      tts(DANA_VOICE, danaLine),
    ]);

    // The call did the work — settle the agreement, write the memory.
    if (openAg) {
      await ctx.runMutation(api.mutations.settleAgreement, {
        agreementId: openAg._id as Id<"agreements">,
      });
    }
    await ctx.runMutation(api.mutations.resolveCard, {
      cardId,
      status: "resolved",
    });

    try {
      const state = await ctx.runMutation(api.agentState.getOrCreateAssistant, {});
      if (state) {
        const bb = backboard();
        await bb.addMemory(state.assistantId, {
          content: `Alex chose to have Kin call Dana directly. Dana agreed on the call; agreement settled, ${owedDollars} transferred from Dana's RBC chequing to Alex's TD chequing.`,
          metadata: { source: "kin-decision", cardId, channel: "voice" },
        });
      }
    } catch (err) {
      console.error("Backboard memory write failed (non-fatal):", err);
    }

    return { agentAudio, danaAudio, agentLine, danaLine };
  },
});

// ─── bootstrapDemo ───────────────────────────────────────────────────────────
// One-shot for the demo: reseed the world, run the detectors, then run the
// agent on the (single) open overdraft card. Pair this with a UI button to
// recover instantly if anything drifts mid-demo.
export const bootstrapDemo = action({
  args: {},
  handler: async (
    ctx
  ): Promise<{ ok: boolean; cardId: string | null; message: string }> => {
    await ctx.runMutation(api.agentState.reset, {});
    await ctx.runMutation(api.seedDemo.seedDemo, {});
    await ctx.runMutation(api.engine.runDetection, {});
    const cards = await ctx.runQuery(api.queries.getCards, {});
    const overdraft = cards.find((c) => c.type === "overdraft");
    if (!overdraft) {
      return {
        ok: true,
        cardId: null,
        message: "Seeded. Byproduct cards visible; no overdraft surfaced.",
      };
    }
    // Backboard is non-fatal here — if it's down the engine card still renders
    // and the user can retry via "Have Kin reason about this".
    try {
      const res = await ctx.runAction(api.agent.runAgent, {
        cardId: overdraft._id,
      });
      return { ok: true, cardId: overdraft._id, message: res.message };
    } catch (err) {
      console.error("bootstrapDemo: runAgent failed (non-fatal):", err);
      return {
        ok: true,
        cardId: overdraft._id,
        message:
          "Seeded. Backboard unavailable — showing engine output. Tap 'Have Kin reason about this' to retry.",
      };
    }
  },
});

// ─── handleInboundSms ────────────────────────────────────────────────────────
// Twilio webhook + MCP kin_handle_inbound_sms share this pipeline:
// route → execute plan → optional Twilio reply.
//
// Performance shape (see docs/sms-perf-handoff.md):
//   1. Preload accounts/agreements/cards/subscribers in parallel ONCE — the
//      router uses these as hints AND chatReply uses them to build the prompt,
//      so we used to query them ~3× per inbound text.
//   2. Drop any redundant `convex_get_*` steps the router/LLM picks for data
//      we already have.
//   3. Run remaining context steps in parallel; run terminal steps sequentially.
//   4. Inline chatReply (no `ctx.runAction` boot) by passing preloaded context
//      through ExecuteState.
export const handleInboundSms = action({
  args: {
    phone: v.string(),
    body: v.string(),
    messageSid: v.optional(v.string()),
    to: v.optional(v.string()),
    execute: v.optional(v.boolean()),
    skipMessageCard: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const execute = args.execute ?? true;

    // ── 1. Preload everything chatReply + the router need, in parallel ─────
    const [accountsRaw, agreementsRaw, cardsRaw, subscribersRaw] =
      await Promise.all([
        ctx.runQuery(api.queries.getAccounts, {}),
        ctx.runQuery(api.queries.getAgreements, {}),
        ctx.runQuery(api.queries.getCards, {}),
        ctx.runQuery(api.queries.getSubscribers, { activeOnly: false }),
      ]);
    const preloaded: Preloaded = {
      accounts: accountsRaw as Preloaded["accounts"],
      agreements: agreementsRaw as Preloaded["agreements"],
      cards: cardsRaw as Preloaded["cards"],
      subscribers: subscribersRaw as Preloaded["subscribers"],
    };

    const accountHints = preloaded.accounts
      .map(
        (a) =>
          `${a._id} | ${a.institution} ${a.type} | ${dollars(a.balanceCents)}`,
      )
      .join("\n");
    const openCardHints =
      preloaded.cards
        .slice(0, 8)
        .map((c) => `- [${c.severity}] ${c.type}: ${c.title}`)
        .join("\n") || "(none)";

    const plan = await routeInboundSmsWithLlm({
      from: args.phone,
      body: args.body,
      accountHints,
      openCardHints,
    });

    // ── 2. Drop redundant context steps + enrich terminal step args ────────
    plan.recommendedTools = plan.recommendedTools.filter(
      (s) => !PRELOADED_TOOLS.has(s.tool),
    );
    for (const step of plan.recommendedTools) {
      if (step.tool === "convex_create_message_card") {
        step.args = {
          ...step.args,
          from: args.phone,
          body: args.body,
          to: args.to,
          messageSid: args.messageSid,
          receivedAt: Date.now(),
        };
      }
      if (step.tool === "convex_send_sms") {
        step.args = { ...step.args, to: args.phone };
      }
    }

    if (args.skipMessageCard) {
      plan.recommendedTools = plan.recommendedTools.filter(
        (s) => s.tool !== "convex_create_message_card",
      );
    }

    if (!execute) {
      return {
        summary: plan.summary,
        plan: plan.recommendedTools,
        routedBy: plan.routedBy,
        results: [] as Array<{
          tool: string;
          ok: boolean;
          result?: unknown;
          error?: string;
        }>,
        reply: undefined as string | undefined,
      };
    }

    // ── 3. Split into context (parallel) vs terminals (sequential) ──────────
    // The terminal phase is ordered: create_message_card → chat_reply (or
    // briefing) → send_sms. Anything else is a safe-to-parallelize side query
    // (forecast, transactions, run_detection, etc.).
    const state: { reply?: string; preloaded: Preloaded } = { preloaded };
    const contextSteps = plan.recommendedTools.filter(
      (s) => !TERMINAL_TOOLS.has(s.tool),
    );
    const terminalSteps = plan.recommendedTools.filter((s) =>
      TERMINAL_TOOLS.has(s.tool),
    );

    const contextResults = await Promise.all(
      contextSteps.map((s) => executeSmsPlanStep(ctx, s, state)),
    );

    const terminalResults = [];
    for (const step of terminalSteps) {
      if (step.tool === "convex_chat_reply") {
        // Inline the reply: skip the action cold-start AND let chatReply use
        // the context we already preloaded above (~500ms saved).
        try {
          const r = await runChatReplyWithContext(
            ctx,
            step.args.phone as string,
            step.args.body as string,
            preloaded,
          );
          state.reply = r.reply;
          terminalResults.push({ tool: step.tool, ok: true, result: r });
        } catch (e: unknown) {
          terminalResults.push({
            tool: step.tool,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
        continue;
      }
      terminalResults.push(await executeSmsPlanStep(ctx, step, state));
    }

    return {
      summary: plan.summary,
      plan: plan.recommendedTools,
      routedBy: plan.routedBy,
      results: [...contextResults, ...terminalResults],
      reply: state.reply,
    };
  },
});

// ─── planInboundSms ──────────────────────────────────────────────────────────
// Dry-run semantic routing only (Backboard LLM + fallback). For MCP / debugging.
export const planInboundSms = action({
  args: { phone: v.string(), body: v.string() },
  handler: async (ctx, { phone, body }) => {
    const accounts = await ctx.runQuery(api.queries.getAccounts, {});
    const cards = await ctx.runQuery(api.queries.getCards, {});
    const accountHints = accounts
      .map(
        (a) =>
          `${a._id} | ${a.institution} ${a.type} | ${dollars(a.balanceCents)}`,
      )
      .join("\n");
    const openCardHints =
      cards
        .slice(0, 8)
        .map((c) => `- [${c.severity}] ${c.type}: ${c.title}`)
        .join("\n") || "(none)";

    return await routeInboundSmsWithLlm({
      from: phone,
      body,
      accountHints,
      openCardHints,
    });
  },
});

// ─── chatReply ───────────────────────────────────────────────────────────────
// Inbound SMS → agent reply. One Backboard assistant per phone, so
// conversation memory accumulates per person across messages.
// Returns the reply string (the http webhook handles sending it via Twilio).
//
// The action is a thin wrapper around `runChatReplyWithContext` so callers
// from outside the SMS pipeline (MCP tools, dashboard) still work, while the
// SMS pipeline can call the helper directly and skip both the action cold-
// start AND the duplicate context queries.
export const chatReply = action({
  args: { phone: v.string(), body: v.string() },
  handler: async (ctx, { phone, body }): Promise<{ reply: string }> => {
    const [accountsRaw, agreementsRaw, cardsRaw, subscribersRaw] =
      await Promise.all([
        ctx.runQuery(api.queries.getAccounts, {}),
        ctx.runQuery(api.queries.getAgreements, {}),
        ctx.runQuery(api.queries.getCards, {}),
        ctx.runQuery(api.queries.getSubscribers, { activeOnly: false }),
      ]);
    return runChatReplyWithContext(ctx, phone, body, {
      accounts: accountsRaw as Preloaded["accounts"],
      agreements: agreementsRaw as Preloaded["agreements"],
      cards: cardsRaw as Preloaded["cards"],
      subscribers: subscribersRaw as Preloaded["subscribers"],
    });
  },
});

/**
 * Same as the `chatReply` action body but takes pre-loaded context. Called
 * directly from `handleInboundSms` (and from the executor) so the SMS path
 * doesn't pay the cost of a second action cold-start or a re-fetch of data
 * we already have in scope.
 */
export async function runChatReplyWithContext(
  ctx: ActionCtx,
  phone: string,
  body: string,
  preloaded: Preloaded,
): Promise<{ reply: string }> {
  const { accounts, agreements, cards, subscribers } = preloaded;
  const sub = subscribers.find((s) => s.phone === phone);
  const senderName = sub?.name ?? "there";

  const balanceLines = accounts
    .map((a) => `- ${a.institution} ${a.type}: ${dollars(a.balanceCents)}`)
    .join("\n");
  const agreementLines = agreements
    .filter((a) => a.status !== "settled")
    .map(
      (a) =>
        `- ${a.fromName} owes ${a.toName} ${dollars(a.amountCents)} (${a.reason}, ${a.status})`,
    )
    .join("\n");
  const alertLines = cards
    .slice(0, 5)
    .map((c) => `- [${c.severity}] ${c.title}`)
    .join("\n");

  // ── Per-phone assistant: get or create ────────────────────────────────────
  const bb = backboard();
  let pa = await ctx.runMutation(api.mutations.getPhoneAssistant, { phone });

  if (!pa) {
    const boot = asChat(
      await bb.sendMessage({
        content: `You are Kin, a calm household financial guardian texting with ${senderName}. Acknowledge in 5 words.`,
        memory: "Auto",
        ...MODEL,
      }),
    );
    if (!boot.assistantId || !boot.threadId) {
      return {
        reply:
          "Hi — Kin here. I'm having trouble waking up right now, try again in a minute.",
      };
    }
    await ctx.runMutation(api.mutations.setPhoneAssistant, {
      phone,
      assistantId: boot.assistantId,
      threadId: boot.threadId,
    });
    pa = {
      assistantId: boot.assistantId,
      threadId: boot.threadId,
      primed: false,
    };
  }

  // ── Prime memory once with the household context (per phone) ──────────────
  // Fire-and-forget via the scheduler so the FIRST reply doesn't wait on three
  // sequential Backboard addMemory writes (~800-1500ms). The reply itself
  // already includes the same context inline in the prompt — priming only
  // matters for the NEXT reply.
  if (!pa.primed) {
    const items = [
      `Texter: ${senderName} (phone ${phone}).`,
      `Accounts:\n${balanceLines || "(none)"}`,
      `Open agreements:\n${agreementLines || "(none)"}`,
    ];
    await ctx.scheduler.runAfter(0, api.agent.primePhoneAssistantMemory, {
      phone,
      assistantId: pa.assistantId,
      items,
    });
  }

  // ── Ask the LLM ───────────────────────────────────────────────────────────
  const systemContext = `
LIVE CONTEXT (use only what's relevant; do NOT dump it all):
Accounts:
${balanceLines || "(none)"}

Open / requested agreements:
${agreementLines || "(none)"}

Recent alerts:
${alertLines || "(none)"}
`.trim();

  const prompt = `
You are Kin, a calm household financial guardian replying to a text message from ${senderName}.

${systemContext}

${senderName}'s message:
"${body}"

Reply rules:
- 1-3 sentences, max ~320 characters (one SMS segment when possible).
- Plain prose. No emoji, no markdown, no bullet lists.
- If the user asks a factual question, answer using the LIVE CONTEXT above. Use exact dollar amounts from it.
- If the user asks Kin to do something concrete (move money, send e-transfer, call), say "I can do that — open the app to confirm with one tap" rather than promising.
- If you don't know, say so briefly.
Return ONLY the reply text.
  `.trim();

  let reply = "";
  try {
    const r = asChat(
      await bb.sendMessage({
        content: prompt,
        assistantId: pa.assistantId,
        threadId: pa.threadId,
        memory: "Auto",
        ...MODEL,
      }),
    );
    reply = (r.content ?? "").trim();
    if (r.threadId && r.threadId !== pa.threadId) {
      await ctx.runMutation(api.mutations.updatePhoneAssistantThread, {
        phone,
        threadId: r.threadId,
      });
    }
  } catch (err) {
    console.error("chatReply Backboard error:", err);
  }

  if (!reply) {
    reply = `Got your message, ${senderName}. Kin's brain is offline for a sec — try again or open the app to see your accounts.`;
  }
  if (reply.length > 1500) reply = reply.slice(0, 1497) + "…";

  return { reply };
}

// ─── primePhoneAssistantMemory ───────────────────────────────────────────────
// Scheduled fire-and-forget priming. The first inbound SMS per phone schedules
// this to write the household context into the assistant's Backboard memory so
// subsequent replies can use the memory channel instead of repeating context
// in every prompt. We do NOT block the user's first reply on this.
export const primePhoneAssistantMemory = action({
  args: {
    phone: v.string(),
    assistantId: v.string(),
    items: v.array(v.string()),
  },
  handler: async (ctx, { phone, assistantId, items }) => {
    const bb = backboard();
    for (const content of items) {
      try {
        await bb.addMemory(assistantId, {
          content,
          metadata: { source: "kin-sms", kind: "sms-context", phone },
        });
      } catch (e) {
        console.error("primePhoneAssistantMemory addMemory failed:", e);
      }
    }
    try {
      await ctx.runMutation(api.mutations.markPhoneAssistantPrimed, { phone });
    } catch (e) {
      console.error("primePhoneAssistantMemory markPrimed failed:", e);
    }
    return { ok: true };
  },
});

function parseMoveMoneyParams(
  p: Record<string, unknown>,
  amountKey: "amountCents" | "moveAmountCents" = "amountCents",
): {
  fromAccountId: Id<"accounts">;
  toAccountId: Id<"accounts">;
  amountCents: number;
  memo?: string;
} {
  const fromAccountId = p.fromAccountId as Id<"accounts"> | null | undefined;
  const toAccountId = p.toAccountId as Id<"accounts"> | null | undefined;
  const raw = p[amountKey] ?? p.amountCents ?? p.moveAmountCents;
  if (!fromAccountId || !toAccountId || raw == null) {
    throw new Error(
      `move_money: card action params incomplete (need fromAccountId, toAccountId, ${amountKey}). Re-run seedDemo or runAgent on the overdraft card.`,
    );
  }
  return {
    fromAccountId,
    toAccountId,
    amountCents: Number(raw),
    memo: (p.memo as string | undefined) ?? "Kin: transfer",
  };
}

export type { Id };
