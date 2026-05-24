# SMS pipeline performance — handoff

> Goal: cut inbound-SMS round-trip latency from ~6–12s to under 3s.

## Today's flow (slow path)

```text
Twilio webhook  →  http.ts  →  agent.handleInboundSms
    ├── getAccounts                 (Convex query)
    ├── getCards                    (Convex query)
    ├── routeInboundSmsWithLlm      (Backboard LLM #1 — picks tools)
    ├── execute plan steps          (4–7 sequential Convex calls)
    │     └── convex_chat_reply     (Convex action)
    │           ├── getAccounts                ← duplicate
    │           ├── getAgreements              ← duplicate
    │           ├── getCards                   ← duplicate
    │           ├── getSubscribers
    │           ├── getPhoneAssistant
    │           ├── (first text only) Backboard sendMessage bootstrap
    │           ├── (first text only) Backboard addMemory ×3 priming
    │           └── Backboard sendMessage      (LLM #2 — writes reply)
    └── convex_send_sms             (Twilio REST send)
```

Files: [`kin/convex/http.ts`](../kin/convex/http.ts), [`kin/convex/agent.ts`](../kin/convex/agent.ts) (`handleInboundSms`, `chatReply`), [`kin/convex/smsLlmRouter.ts`](../kin/convex/smsLlmRouter.ts), [`kin/convex/smsExecutor.ts`](../kin/convex/smsExecutor.ts), [`kin/convex/smsRouter.ts`](../kin/convex/smsRouter.ts).

## Where the time goes

| Stage | Approx | Notes |
|------|--------|-------|
| Twilio → Convex | 100–300 ms | Network |
| Router pre-fetch (2 sequential queries) | 100–300 ms | Could be parallel; could also pass into chatReply |
| **Backboard router LLM** | **2–5 s** | Full LLM call just to pick tool names |
| Plan execution (5–7 sequential steps) | 500–1500 ms | Most are `ctx.runQuery` round trips |
| `chatReply` re-fetches same data | 200–400 ms | Duplicate of router pre-fetch |
| First-text-only priming (3 addMemory) | 500–1500 ms | Sequential Backboard writes |
| **Backboard reply LLM** | **2–5 s** | Second LLM call |
| Twilio sendSms REST | 300–800 ms | Outbound API |

## Inefficiencies (ranked by impact)

### 1. Two LLM round trips per text — biggest win

Router LLM (pick tools) and reply LLM (write text) are independent Backboard calls. Each ~2–5s.

**Fix:** Single Backboard call with **tool definitions** (Backboard supports `tools` + `submitToolOutputsSimple`, see [`kin/convex/spike.ts`](../kin/convex/spike.ts)). The model picks tools, we run them, return outputs, model finishes the reply — one logical conversation, one model wake-up.

Estimated savings: **2–4 seconds per text**, plus better tool selection because the model has the user's question in its full context, not just keywords.

### 2. Same data queried 3 times

`handleInboundSms` pre-fetches accounts/cards for hints, the plan re-fetches them via `convex_get_accounts` / `convex_get_cards`, then `chatReply` re-fetches them again to build its prompt.

**Fix:** Single context object built once at the top of `handleInboundSms`, passed forward to both router and `chatReply`. Add a new `chatReply` arg `preloaded?: { accounts, agreements, cards, subscribers }`.

Estimated savings: **300–800 ms** + 4–6 fewer Convex calls.

### 3. Sequential plan execution

[`smsExecutor.ts`](../kin/convex/smsExecutor.ts) runs steps in a `for` loop. Read-only context tools (`get_accounts`, `get_agreements`, `get_cards`, `get_subscribers`, etc.) have no dependencies and could run in parallel.

**Fix:** Split steps into "context (parallel)" and "terminal (sequential)" phases. `Promise.all` the context phase. Terminal: `chatReply` then `sendSms`.

Estimated savings: **300–600 ms** when ≥3 context tools are in the plan.

### 4. Priming spam on first text

Per phone, the first text fires `bb.sendMessage` bootstrap + 3 separate `bb.addMemory` calls. Sequential, all in chatReply, blocking the user reply.

**Fix:** Either (a) make priming **fire-and-forget** with `ctx.scheduler.runAfter(0, ...)` so the first reply doesn't wait on it, or (b) collapse the 3 memory items into one composite memory string. (a) hides the cost entirely; (b) cuts ~2/3 of the priming time.

Estimated savings: **800–1500 ms** on first-ever text per phone.

### 5. Router model choice

`moonshotai/kimi-k2.6` is good for the reply but heavy for picking from a known catalog of ~10 tool names. A faster/smaller model (Claude Haiku, GPT-4o-mini, etc.) on the router-only path would cut its latency significantly.

**Fix:** If we keep two LLM calls, use a fast model in [`kin/convex/smsLlmRouter.ts`](../kin/convex/smsLlmRouter.ts) (`MODEL` constant). If we collapse to one call (fix #1), this becomes moot.

Estimated savings: **1–2 s** if we keep the router as a separate call.

### 6. Action-to-action `ctx.runAction` overhead

Each `ctx.runAction(api.agent.chatReply, …)` and `ctx.runAction(api.twilioSend.sendSms, …)` boots a fresh Node action. Inside `handleInboundSms`, the chatReply + sendSms steps each pay full cold-start.

**Fix:** Inline `chatReply`'s body into `handleInboundSms` (or vice versa) for the SMS path. Keep `chatReply` as a public action only for backwards compat.

Estimated savings: **200–500 ms**.

### 7. Twilio `sendSms` is sequential after reply

Already at the end of the chain — minor, but could fire-and-forget the send + return TwiML reply directly so Twilio sees an immediate `<Response>` ack while the SMS goes out via REST.

Already partially done (`http.ts` returns empty TwiML before awaiting completion via try/catch — but it actually does `await ctx.runAction` inside try so it still blocks the HTTP response).

**Fix:** `ctx.scheduler.runAfter(0, api.agent.handleInboundSms, …)` and immediately return TwiML. Twilio doesn't care what TwiML we send (we send empty anyway). All processing becomes async — webhook returns in <100ms.

Estimated savings: **doesn't reduce reply time** but removes the timeout risk and any duplicate webhook retries.

## Suggested order of work

1. **Schedule the work and ack Twilio immediately** (fix #7 — simplest, no behavior change).
2. **Pre-load context once, plumb through** (fix #2 — straightforward refactor).
3. **Parallelize context queries** (fix #3 — small change).
4. **Move priming to scheduler** (fix #4 — tiny but visible on first text).
5. **Collapse to one Backboard tool-calling round trip** (fix #1 — the biggest win, biggest design change). Reuse the spike pattern from [`kin/convex/spike.ts`](../kin/convex/spike.ts).
6. (Optional) **Inline `chatReply`** if profiling still shows action-boot overhead (fix #6).

## Test path

- Smoke: `cd kin/mcp-server && bun run test:live` (covers dry-run pipeline).
- Live: text `+17627583624`, time first-token-to-reply.
- Convex dashboard → Logs → filter `handleInboundSms` for per-step timings.
- Watch for regressions on first-text-per-phone (priming) vs subsequent texts (no priming).

## Scope guardrails

- Keep the **MCP tool registry** ([`kin/mcp-server/src/registry.ts`](../kin/mcp-server/src/registry.ts)) and the public Convex API stable. Performance work is internal to `handleInboundSms` / `chatReply` / the router.
- Don't break the **fallback** to keyword routing — Backboard outage shouldn't stop SMS replies.
- Money is still cents; `convex_send_sms` body must remain a string.
