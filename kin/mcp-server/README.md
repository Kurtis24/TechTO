# Kin MCP server

stdio [Model Context Protocol](https://modelcontextprotocol.io) server for **Kin**. It exposes every public Convex function as an MCP tool so Cursor (or any MCP client) can read household data, run the agent, and process inbound SMS the same way production does.

**Secrets:** MCP only needs `CONVEX_URL`. Twilio, Backboard, and ElevenLabs keys live in the [Convex dashboard](https://dashboard.convex.dev) (Settings → Environment Variables).

---

## Quick start

### 1. Install

```bash
cd kin/mcp-server
bun install
```

### 2. Configure Convex URL

Copy your deployment URL from `kin/.env.local` (`NEXT_PUBLIC_CONVEX_URL`):

```bash
cp .env.example .env
# Set CONVEX_URL=https://YOUR-DEPLOYMENT.convex.cloud
```

Or export it when running:

```bash
export CONVEX_URL="$(grep NEXT_PUBLIC_CONVEX_URL ../.env.local | cut -d= -f2)"
```

### 3. Smoke test (recommended)

```bash
# Offline: SMS routing plan only
bun run test

# Live: query Convex + dry-run inbound SMS pipeline
bun run test:live
```

### 4. Run the MCP server

```bash
bun run start
# or from kin/:  bun run mcp
```

The process speaks MCP over **stdio** and waits for a client (Cursor) to connect.

---

## Cursor setup

1. Copy the example config:

   ```bash
   cp kin/.cursor/mcp.json.example kin/.cursor/mcp.json
   ```

2. Edit `kin/.cursor/mcp.json` and set `CONVEX_URL` to your deployment (same as `NEXT_PUBLIC_CONVEX_URL` in `.env.local`).

3. Restart Cursor (or reload MCP servers in settings).

4. In chat, you should see server **`kin`** with 40+ tools. Try:

   - *“Use kin_route_inbound_sms for: from +14165551234, body ‘how much is in chequing?’”*
   - *“Call convex_get_accounts”*
   - *“Run convex_bootstrap_demo”* (reseeds demo data)

---

## How inbound SMS works

```text
Twilio SMS  →  POST /sms/inbound (.convex.site)
                    →  agent.handleInboundSms
                         1. Backboard LLM picks tools (semantic routing)
                         2. execute plan (queries, chatReply, sendSms)
                    →  reply SMS to sender
```

If Backboard routing fails, the system falls back to keyword rules in `smsRouter.ts`.

MCP mirrors that pipeline:

| MCP tool | What it does |
|----------|----------------|
| `kin_route_inbound_sms` | **Dry run** — Backboard LLM plans tools; no writes, no SMS |
| `kin_handle_inbound_sms` | **Full run** — same as Twilio webhook (feed card, Backboard reply, Twilio send) |
| `kin_execute_tool_plan` | Run a custom list of `convex_*` tools in order |

### Example: plan only (safe)

Ask Cursor to call **`kin_route_inbound_sms`** with:

```json
{
  "from": "+14165551234",
  "body": "How much is in my chequing?"
}
```

Typical plan:

- `convex_get_accounts`, `convex_get_agreements`, `convex_get_cards`, …
- `convex_create_message_card`
- `convex_chat_reply` (Backboard)
- `convex_send_sms` (Twilio)

### Example: full pipeline (sends real SMS)

**`kin_handle_inbound_sms`** with the same `from` / `body`. Requires:

- Convex env: `BACKBOARD_API_KEY`, `TWILIO_*`
- `from` should be a subscribed/demo phone if you expect a coherent reply

Use a test phone you control.

---

## Convex tools (`convex_*`)

Each tool maps 1:1 to a Convex function. Browse the full list via MCP resource **`kin://tool-catalog`** (JSON).

### Reads (queries)

| Tool | Convex |
|------|--------|
| `convex_get_accounts` | `queries.getAccounts` |
| `convex_get_transactions` | `queries.getRecentTransactions` |
| `convex_get_agreements` | `queries.getAgreements` |
| `convex_get_cards` | `queries.getCards` |
| `convex_get_forecast` | `engine.getForecast` (needs `accountId`) |
| … | see tool catalog |

### Writes & agent (mutations / actions)

| Tool | Convex |
|------|--------|
| `convex_seed_demo` | Reseed alex & dana demo |
| `convex_run_detection` | Overdraft + anomaly cards |
| `convex_move_money` | Internal transfer (cents) |
| `convex_chat_reply` | SMS reply via Backboard |
| `convex_run_agent` | Guardian message on overdraft card |
| `convex_send_sms` | Outbound Twilio SMS |
| `convex_handle_inbound_sms` | Full inbound pipeline |
| `convex_backboard_send_message` | Raw Backboard LLM call |
| … | see tool catalog |

### Demo bootstrap

From Cursor or test script:

```text
convex_bootstrap_demo   →  seed + detection + runAgent on overdraft card
```

---

## Manual tool plan

**`kin_execute_tool_plan`** runs steps you choose:

```json
{
  "execute": true,
  "plan": [
    { "tool": "convex_get_accounts", "args": {} },
    { "tool": "convex_chat_reply", "args": { "phone": "+1...", "body": "balance?" } }
  ]
}
```

Set `"execute": false` to validate the plan without calling Convex.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `CONVEX_URL is not set` | Add to `mcp-server/.env`, Cursor `mcp.json` env, or `kin/.env.local` |
| Tool returns `Could not find function` | Run `npx convex dev` in `kin/` to deploy latest functions |
| `kin_handle_inbound_sms` fails on reply | Set `BACKBOARD_API_KEY` + `TWILIO_*` in Convex dashboard |
| MCP not listed in Cursor | Check `cwd` is `kin` and path to `mcp-server/src/index.ts` |
| Empty accounts | Run `convex_seed_demo` from dashboard or `convex_bootstrap_demo` |

---

## Project layout

```text
kin/mcp-server/
  src/
    index.ts          # stdio entry
    server.ts         # registers tools + resource
    registry.ts       # tool definitions
    invoke.ts         # ConvexHttpClient dispatch
    tools/
      convex.ts       # all convex_* tools
      sms.ts          # kin_* SMS tools
  scripts/
    test.ts           # smoke tests
```

Related Convex modules: `kin/convex/smsRouter.ts`, `kin/convex/smsExecutor.ts`, `kin/convex/agent.ts` (`handleInboundSms`), `kin/convex/http.ts` (Twilio webhook).
