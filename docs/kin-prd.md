# Kin — PRD + build plan (TechTO hackathon, May 24 2026)

> one source of truth. build time is **10am–4pm**, 3-min video due **5pm**. if a task doesn't make the hero moment land harder or survive Clements' Q&A, it's cut.

---

## the name

**Kin** — household / "next of kin" / "it sees across your kin's accounts." short, warm, carries the cross-silo moat in one word.

- tagline: **"the financial guardian for your household. it sees across every account, and acts before money problems happen."**
- backups if Kin doesn't land: **Otto** (auto / it *does* things — most agent-y), **Hearth** (home + safety). swap freely, it's one find-replace.

---

## the one-liner pitch (first 20 sec of the video + every Q&A answer)

> your bank only sees its own account. Kin sees the whole board — both partners' banks, the inbox, the shared goal, the agreement that dana owes you $800 — and acts on a picture no single human and no single bank can assemble. it's quiet 99% of the time, and pings only when it matters.

**why this beats "generic fintech":** a bank is *structurally blind* across silos (legally + technically). that blind spot is the entire white space. we are not doing "smarter fraud detection" (that's Clements' day job — never demo his table stakes back to him). we're doing **sight across silos → action**. that's airfairness DNA.

---

## the demo IS the product. one engine, one agent loop, many cards.

the trap we're avoiding: a "shell + 3 features" build scores zero on the rubric (no points for breadth) and dies in Q&A. instead:

- **platform = the story** (free, it's words): "a guardian that watches everything."
- **scalpel = what we actually build deep**: the overdraft→resolve vertical slice, bulletproof, end to end.
- the "watches everything" feeling comes from **byproduct cards** — same engine, near-zero extra cost:

| card in the feed | who builds | cost | what it proves to judges |
|---|---|---|---|
| 🚨 **overdraft incoming → drafts e-transfer + offers to move money + calls dana** (HERO) | Dave (loop+UI) · Brian (forecast) | most of the day | action + memory + delight — the climax |
| ⚠️ paid hydro twice ($142) | Brian (same anomaly engine) | ~free | "watches everything," daily-useful |
| 📈 a sub crept $9.99 → $19.99 over 3 mo | Brian (same engine) | ~free | memory-over-time, not one-trick |
| 🛡️ flagged a $1,900 charge unlike your normal | Brian (same engine) | ~free | breadth without building breadth |
| ✅ 1,400 normal txns, silent | the UI just *not* alerting | free | the Ring-camera trust model |

three+ card types, **one** detection engine wearing a trenchcoat. honest, because in a real product they genuinely are the same system.

> the "dynamic budget" and "scam detection" you listed = **byproduct cards + pitch words, not separate builds.** the "personal advisor" = the feed itself. do not build them as standalone surfaces.

---

## the hero moment (this is the spec — everyone builds toward exactly this)

phone buzzes thursday morning:

> **Kin:** "alex — heads up, you're going to overdraft saturday. rent ($2,100) autopays from your chequing, but you're sitting at $1,650 because you fronted the trip deposit. dana still owes you $800 from that. i've drafted the e-transfer request to dana, and as backup i can pull $500 from your joint savings. want me to send the request, move the money, or both?"

one tap → it sends the request. then the delight spike: **"want me to just call dana?"** → tap → you *hear* Kin make the call (ElevenLabs), calm and human: *"hey, it's alex's assistant — you're up for $800 from the cottage trip, want me to send you the e-transfer request now?"*

every rubric point, one beat:

| rubric (30) | how this beat hits it |
|---|---|
| real problem (10) — Clements | overdraft + household coordination is universal, daily, stressful, and it's *his blind spot* (flatters him, doesn't threaten him) |
| delight (10) | caught it *before* it happened, knew *why*, already did the work, then *made the call* |
| action + memory (10+10 of the weight) | multi-step: forecast → draft request → offer transfer → execute on one tap; remembers the agreement, the goal, the normal, prior decisions (all in Backboard) |

---

## scope: in / out (hold this line all day)

**IN (build deep):**
- cross-source ingest of seeded data (alex bank + dana bank + joint savings + "inbox" agreements)
- the engine: "normal" baseline + **overdraft forecast** + anomaly detectors (dup / creep / outlier)
- the agent loop: observe → reason → decide → propose actions → execute on approval
- Backboard memory: agreements, goal, normal-summary, decisions (cross-session)
- the feed UI (Ring-camera model: mostly empty, pings matter), one-tap approve
- **one** ElevenLabs voice call = the resolution beat
- the seed dataset ("alex & dana") — *this is the demo, day-1, everyone*

**OUT (cut on sight):** auth/login, onboarding, settings, nav between features, real bank linking (Plaid etc.), real telephony/PSTN, a second real feature, mobile, dark mode polish, anything multi-tenant. live data is banned — **we demo on the seed only.**

---

## architecture (keep it boring)

```
Next.js + Tailwind (UI: the feed)
        │  (Convex reactive queries — feed updates live)
        ▼
Convex  ── DB (people, accounts, txns, agreements, goals, subs, cards)
        └─ actions = where the agent loop runs
              │
              ├─ Backboard  → memory (agreements/goal/normal/decisions) + LLM reasoning
              └─ ElevenLabs → TTS for the one call (audio played in-app)
```

**decisions:**
- **Convex** = db + reactive sync (feed auto-updates = cheap delight) + actions host the agent loop.
- **Backboard = the spine.** memory criterion (10 pts) *is* backboard, and it wins Murray's vote. it's the LLM gateway too (17k models, one API). everything stateful lives there — that's also *mechanically* what makes "sight across silos / shared household state" true, not bolted on.
- **Vercel AI SDK = NOT yet.** only the fallback if backboard's tool-calling is awkward for the action loop. **de-risk in hour 1** (see prompt 0) — spike a backboard memory write/read + one LLM tool-call before committing. if clean → backboard does the whole loop. if not → Anthropic API / Vercel SDK runs the tool loop, memory still in backboard.
- **ElevenLabs = TTS playback, NOT real phone calls.** for a 3-min *video* the call only needs to look + sound like a call: "calling dana…" UI + generated audio clip(s). real PSTN is a trap. (conversational agents API = stretch only if everything else is done, which it won't be.)
- **Codalio** = optional shortcut for the feed UI if Dave's underwater; Ehsan's a judge so it's free favor. don't make it the story.

---

## data model (Convex tables)

```ts
people        { _id, name, role }                       // alex, dana
accounts      { _id, ownerId, institution, type, balanceCents }  // type: chequing|savings|credit|joint
transactions  { _id, accountId, date, merchant, amountCents, category, recurring }
agreements    { _id, fromId, toId, amountCents, reason, status }  // dana owes alex 800 (trip)
goals         { _id, name, targetCents, deadline, savedCents }    // 5k trip by dec
subscriptions { _id, accountId, merchant, amountCents, cadence, history[] } // history → creep detection
cards         { _id, type, severity, title, body, actions[], status } // the feed; type: overdraft|duplicate|creep|outlier|info
```

memory mirrored to Backboard: the agreements, the goal, a short "normal" summary, and any decision the user makes ("leave netflix"). the demo proves memory by the agent *referencing* these unprompted.

---

## the seed: "alex & dana, late-20s, Toronto" (day-1, everyone's job)

generate programmatically so **balances actually reconcile** and merchants are real canadian businesses. ~3 months history so the engine has *memory of normal*.

establish-normal (the boring 1,400 txns): paycheques (biweekly), rent autopay, hydro (Toronto Hydro), groceries (Loblaws/Metro/No Frills), transit (Presto), coffee, Shoppers, the odd Amazon.

then plant the landmines:

| landmine | fires |
|---|---|
| alex chequing → **$1,650**, rent **$2,100** autopays **saturday** | the overdraft (hero) |
| agreement: **dana owes alex $800** (trip deposit alex fronted) | the cause + the cross-silo moat |
| joint savings holds **~$2,000** | the "move $500 as backup" option |
| goal: **$5k trip by dec** | memory-over-time, why the savings is protected |
| **duplicate hydro charge ($142)** | byproduct: dup card |
| a sub creeping **$9.99 → $14.99 → $19.99** over 3 mo | byproduct: creep card (memory) |
| a **$1,900** charge unlike normal | byproduct: outlier/scam card |
| prior decision: **"alex likes netflix, leave it"** | proves cross-session memory in the demo |

**never demo on live/random data — this seed is the demo. it must fire the hero reliably, every run.**

---

## work split (per team.md)

- **Dave** — architecture, Convex scaffold, the **agent loop**, the **feed UI + magic moment + voice playback**, the **video**. owns the surface judges see.
- **Kurtis** — data model + the **seed generator** (balance-consistent, both accounts + inbox/agreements) + the "sources" ingest abstraction (the cross-silo sight) + Convex queries that feed the agent.
- **Brian** — the **engine**: "normal" baseline + **overdraft forecast** + anomaly detectors (dup / creep / outlier scoring). the math. pairs with Kurtis on the pipeline.
- **everyone, hour 1** — agree the seed shape so Brian's engine and Dave's loop build against the same data while Kurtis fleshes it out.

---

## the 3-min video (the gate — script it, film 3:30–5:00)

> first slide = all 4 names + emails. title format: `Team # - Kin - Track 2 - Kin - your household's financial guardian`.

| time | on screen | vo / beat |
|---|---|---|
| 0:00–0:20 | the feed, mostly empty, "all good" | the pitch one-liner. "your bank sees one account. Kin sees the whole board." |
| 0:20–0:40 | scroll the quiet byproduct cards (dup, creep) | "it watches everything, quietly. 1,400 transactions, three things worth your attention." — establishes platform feel + memory |
| 0:40–1:40 | **the overdraft card animates in** → the agent's full reasoning (forecast + *why* + the dana agreement) → action buttons | the hero. let it breathe. the climax is the agent **proposing multi-step action on real-looking data**, not answering a prompt |
| 1:40–2:20 | tap "send request" → it sends → tap **"call dana"** → "calling…" UI → **ElevenLabs voice plays** | delight spike. the only voice in the whole demo. |
| 2:20–2:45 | balance/owed counter resolves; card → ✅ | "before saturday, handled." |
| 2:45–3:00 | one line on memory: "next month, Kin already knows the deal." Backboard call-out | nail the context criterion + Murray |

---

# Claude Code prompts

> drop a `CLAUDE.md` in the repo first (prompt 0 generates it). conventional commits, lowercase, clean primitives, agent-friendly code — Dave's house style. each person runs their prompt in their own worktree/branch.

---

## prompt 0 — scaffold + de-risk backboard (Dave, hour 1, run FIRST)

```
we're building "Kin" at a 12-hour hackathon — a household financial guardian agent. stack: next.js (app router) + tailwind + convex (backend + agent loop in actions) + backboard.io (memory + LLM) + elevenlabs (one TTS call). 6 hours of real build time. bias to a working happy-path demo over completeness.

do these in order:

1. scaffold a next.js + tailwind + convex app. minimal. no auth, no routing beyond one page.
2. create CLAUDE.md documenting: the product one-liner, the stack, the rule "we demo on seed data only, never live," conventional commits, and the scope-cut list (no auth/onboarding/settings/real-bank-linking/telephony).
3. DE-RISK BACKBOARD NOW — this gates an architecture decision. read https://docs.backboard.io/sdk/quickstart , then in a convex action write a tiny spike that (a) stores a memory item, (b) retrieves it, (c) makes one LLM call, and ideally (d) does a single tool/function call. report back: does backboard cleanly support a tool-use loop? if yes, we run the whole agent loop on backboard. if no, we'll run the tool loop on the anthropic api / vercel ai sdk and keep memory in backboard. DO NOT build the full loop yet — just prove the shape.
4. define the convex schema for: people, accounts, transactions, agreements, goals, subscriptions, cards (feed items with type/severity/title/body/actions/status). use cents (ints) for money.

stop after the spike + schema and summarize what you learned about backboard so we can lock the loop design.
```

---

## prompt 1 — seed generator + ingest (Kurtis)

```
context: "Kin", household financial guardian for a couple "alex & dana" in Toronto. convex backend, schema already defined (people, accounts, transactions, agreements, goals, subscriptions, cards). money in cents.

build a seeded dataset generator (a convex mutation `seedDemo`) that creates a BELIEVABLE, BALANCE-CONSISTENT 3-month history. this seed IS our demo — it must reliably set up these exact landmines every run:

- alex chequing lands at ~$1,650; rent $2,100 autopays this coming SATURDAY → engineered overdraft
- joint savings ~$2,000
- agreement: dana owes alex $800 (reason: "cottage trip deposit alex fronted")
- goal: "$5k trip by december"
- a DUPLICATE charge: Toronto Hydro $142 paid twice
- a CREEPING subscription: same merchant $9.99 → $14.99 → $19.99 across the 3 months (keep full history[])
- one OUTLIER: a $1,900 charge unlike anything in normal history
- a stored decision: "alex likes netflix, leave it"

fill the rest with ~realistic normal txns so there's a clear baseline: biweekly paycheques, rent, Toronto Hydro, groceries (Loblaws/Metro/No Frills), Presto transit, coffee, Shoppers, occasional Amazon. real canadian merchants. balances must reconcile to the stated end balances.

also build a "sources" abstraction so it reads like the data comes from multiple silos: alex's bank, dana's bank, the joint account, and an "inbox" source for the agreement. expose convex queries the agent loop will call: getAccounts, getRecentTransactions, getAgreements, getGoal, getSubscriptions.

make seedDemo idempotent (clears + reseeds). this must fire the hero reliably. commit with conventional commits.
```

---

## prompt 2 — the engine (Brian)

```
context: "Kin", household financial guardian. convex backend. seed data exists for "alex & dana" (3 months, both accounts + joint savings + agreements + subscriptions). money in cents.

build the detection engine as pure, testable convex functions that read the seed and WRITE `cards` to the feed. one engine, multiple card types:

1. NORMAL BASELINE — compute a per-account summary of "normal" from history (typical inflows/outflows, recurring set, rough day-of-month cadence). keep it simple but real enough that outliers pop. expose a short text summary we can store in backboard memory.

2. OVERDRAFT FORECAST (the hero) — project alex's chequing balance forward over the next 7 days using known recurring debits (esp. rent $2,100 saturday) and expected inflows. detect that the saturday autopay drops balance below 0. output the projected shortfall, the cause, and surface the relevant agreement (dana owes $800) and the joint-savings backup as candidate remedies. write an `overdraft` card with severity + a structured `actions` list: [send_etransfer_request_to_dana, move_500_from_savings, both].

3. ANOMALY DETECTORS (byproducts, same engine):
   - duplicate: same merchant + amount within a short window → `duplicate` card ($142 hydro)
   - creep: a subscription whose history[] trends upward → `creep` card (9.99→19.99)
   - outlier: a txn far outside normal distribution → `outlier` card ($1,900)

keep the math honest and explainable — Clements will ask "how do you know." write a couple of unit-style tests proving the forecast fires on the seed and stays silent on normal data. conventional commits. pair with Kurtis on the data shape.
```

---

## prompt 3 — agent loop + feed UI + voice (Dave)

```
context: "Kin", household financial guardian. next.js + tailwind + convex + backboard (memory + LLM, loop design decided by the hour-1 spike) + elevenlabs (TTS). seed + engine + cards exist.

build three things:

1. AGENT LOOP (convex action `runAgent`): observe (read accounts/txns/agreements/goal + the engine's cards) → load memory from backboard (agreements, goal, normal summary, prior decisions) → reason (LLM) → for the overdraft card, produce the natural-language guardian message AND a structured set of proposed actions. on user approval of an action, EXECUTE it (mutate state: mark e-transfer request sent, move $500 between accounts, update the agreement/balance, flip the card to resolved) and write the decision back to backboard. the climax is the agent DOING, on one tap.

2. FEED UI (one page, Ring-camera model): mostly-calm feed, byproduct cards (dup/creep/outlier) shown quietly, the overdraft hero card expands to show the agent's reasoning + action buttons (send request / move money / both / call dana). use convex reactive queries so the feed updates live when actions execute (balance + owed counters animate). clean, trustworthy, not busy. (if time-crunched, vibe the layout in Codalio and wire convex in.)

3. THE ONE VOICE BEAT: a "call dana" action → "calling dana…" UI → play ElevenLabs TTS of the agent's line ("hey, it's alex's assistant — you're up for $800 from the cottage trip, want me to send the e-transfer request now?"). optionally a short generated "dana" reply for drama. it only needs to look + sound like a call for the video — NO real telephony.

priorities if time runs out: hero card + one-tap execute + reactive counter > voice > byproduct card polish. conventional commits.
```

---

## the rule, one more time

> 20 of 30 points reward **action + memory**. the demo climax must be the agent **DOING something** on believable seeded data — the overdraft forecast → drafted request → one-tap execute → the call. everything else is a byproduct card or a sentence in the pitch. if it doesn't make that land harder or survive Q&A, cut it.
