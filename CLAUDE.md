# Kin

> **The financial guardian for your household.** It sees across every account, and acts before money problems happen.

A 12-hour hackathon build (TechTO, 2026-05-24). The product is one agent loop, one feed, many cards — a "Ring-camera for your money": mostly quiet, pings only when it matters. The hero demo is an overdraft forecast that drafts an e-transfer to a friend who owes you money, offers to move funds from savings, and (one-tap) places a TTS "call" to the friend.

Full spec: [docs/kin-prd.md](docs/kin-prd.md). Read it before changing scope.

## Stack

- **Next.js** (App Router) + **Tailwind** — single-page feed UI, no routing beyond `/`.
- **Convex** — DB + reactive queries (the feed auto-updates) + actions (where the agent loop runs).
- **Backboard.io** — LLM gateway (one API, many models) + assistant-scoped memory (agreements, goal, "normal" summary, prior decisions). Memory is the differentiator — `memory: 'Auto'` auto-injects on every call.
- **ElevenLabs** — one TTS call, played in-app. **Not** real telephony.

Architecture sketch:

```
Next.js (feed)  ──reactive queries──▶  Convex
                                         ├── tables: people, accounts, transactions, agreements, goals, subscriptions, cards
                                         └── actions: the agent loop
                                              ├── Backboard  (LLM + memory)
                                              └── ElevenLabs (TTS, one beat)
```

## House rules

**1. Demo on seed data only. Never live.** The `alex & dana` seed IS the demo. It must fire the hero reliably, every run. Live bank data, real Plaid, real PSTN are all banned — they're traps for a 6-hour build.

**2. Money is cents (integers).** No floats, ever. `amountCents: 142000` not `amount: 1420.00`.

**3. Conventional commits.** `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`. Lowercase, imperative. Example: `feat(agent): wire overdraft card to runAgent action`.

**4. One engine, one loop, many cards.** Don't build separate features for duplicate / creep / outlier — they're byproduct cards from the same detection engine. The overdraft card is the deep one.

**5. If it doesn't make the hero land harder or survive Q&A — cut it.** 20 of 30 rubric points are action + memory. Everything else is a sentence in the pitch.

## Scope — cut on sight

- ❌ auth / login / signup
- ❌ onboarding flow
- ❌ settings page
- ❌ multi-page routing (one page, one feed)
- ❌ real bank linking (Plaid, etc.)
- ❌ real telephony / PSTN — ElevenLabs plays in-app only
- ❌ mobile / responsive polish beyond "doesn't look broken"
- ❌ dark mode
- ❌ a second real vertical — byproduct cards only
- ❌ multi-tenant anything

## Project layout

```
/                       # repo root
├── CLAUDE.md           # this file
├── docs/kin-prd.md     # the PRD — single source of truth for scope
└── kin/                # the Next.js app
    ├── app/            # one page: app/page.tsx (the feed)
    ├── convex/         # schema, queries, mutations, actions (agent loop)
    └── ...
```

All app work happens inside `kin/`. Convex functions live in `kin/convex/`.

## Env vars

Set these in `kin/.env.local`:

```
BACKBOARD_API_KEY=...
ELEVENLABS_API_KEY=...
NEXT_PUBLIC_CONVEX_URL=...        # from `npx convex dev`
CONVEX_DEPLOYMENT=...             # from `npx convex dev`
```

## Run

```bash
cd kin
npx convex dev          # one terminal
npm run dev             # another terminal
```

Then seed: call the `seedDemo` mutation from the Convex dashboard (idempotent — clears + reseeds).

## Work split

- **Dave** — agent loop, feed UI, hero moment, voice playback, video.
- **Kurtis** — seed generator, sources abstraction, queries the agent reads.
- **Brian** — the engine (overdraft forecast + dup / creep / outlier detectors).

Each person works in their own branch / worktree. Rebase off `main` often.
