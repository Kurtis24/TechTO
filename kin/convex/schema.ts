import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// All money is integer cents. No floats. $1,650 → 165000.
// All dates are unix ms (number).

export default defineSchema({
  people: defineTable({
    name: v.string(),
    role: v.string(), // "primary" | "partner" | etc — kept open
    phone: v.optional(v.string()), // E.164 ("+14165551234") — outbound SMS target
  }),

  // Daily-briefing opt-in. One row per phone. Phone uniqueness enforced in code,
  // not the schema, since a person can swap phones and we don't want to migrate.
  subscribers: defineTable({
    phone: v.string(), // E.164
    personId: v.optional(v.id("people")),
    name: v.string(),
    briefingHourLocal: v.number(), // 0-23, in their tz
    tz: v.string(), // IANA tz, e.g. "America/Toronto"
    active: v.boolean(),
  }).index("by_phone", ["phone"]),

  // One Backboard assistant + thread per inbound phone — gives each texter
  // their own persistent memory across SMS conversations.
  phoneAssistants: defineTable({
    phone: v.string(), // E.164
    assistantId: v.string(),
    threadId: v.string(),
    primed: v.optional(v.boolean()),
  }).index("by_phone", ["phone"]),

  accounts: defineTable({
    ownerId: v.id("people"),
    institution: v.string(),
    type: v.union(
      v.literal("chequing"),
      v.literal("savings"),
      v.literal("credit"),
      v.literal("joint"),
    ),
    balanceCents: v.int64(),
  }).index("by_owner", ["ownerId"]),

  transactions: defineTable({
    accountId: v.id("accounts"),
    date: v.number(), // unix ms
    merchant: v.string(),
    amountCents: v.int64(), // negative = outflow, positive = inflow
    category: v.string(),
    recurring: v.boolean(),
  })
    .index("by_account", ["accountId"])
    .index("by_account_and_date", ["accountId", "date"]),

  agreements: defineTable({
    fromId: v.id("people"), // who owes
    toId: v.id("people"), // who is owed
    amountCents: v.int64(),
    reason: v.string(),
    status: v.union(
      v.literal("open"),
      v.literal("requested"),
      v.literal("settled"),
    ),
  }).index("by_status", ["status"]),

  goals: defineTable({
    name: v.string(),
    targetCents: v.int64(),
    deadline: v.number(), // unix ms
    savedCents: v.int64(),
  }),

  subscriptions: defineTable({
    accountId: v.id("accounts"),
    merchant: v.string(),
    amountCents: v.int64(), // current charge
    cadence: v.string(), // "monthly" | "yearly" | ...
    history: v.array(
      v.object({
        date: v.number(),
        amountCents: v.int64(),
      }),
    ),
  }).index("by_account", ["accountId"]),

  // Singleton row holding Backboard assistant/thread IDs so memory accumulates
  // across runAgent invocations (memory keys off assistantId).
  agentState: defineTable({
    assistantId: v.string(),
    threadId: v.string(),
    primed: v.optional(v.boolean()),
  }),

  cards: defineTable({
    type: v.union(
      v.literal("overdraft"),
      v.literal("duplicate"),
      v.literal("creep"),
      v.literal("outlier"),
      v.literal("info"),
      v.literal("tax_loop"), // family tax-saving / income-splitting opportunities
    ),
    severity: v.union(
      v.literal("info"),
      v.literal("warn"),
      v.literal("critical"),
    ),
    title: v.string(),
    body: v.string(),
    actions: v.array(
      v.object({
        id: v.string(), // stable id within the card
        label: v.string(), // user-facing button text
        kind: v.string(), // "send_etransfer" | "move_money" | "call_dana" | "both" | ...
        params: v.any(), // structured args the agent fills in
      }),
    ),
    status: v.union(
      v.literal("open"),
      v.literal("resolved"),
      v.literal("dismissed"),
    ),
    createdAt: v.number(), // unix ms
  })
    .index("by_status", ["status"])
    .index("by_status_and_severity", ["status", "severity"]),
});
