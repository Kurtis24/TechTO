/**
 * Sources abstraction — makes data appear as if fetched from multiple silos:
 *   • "td-alex"          → Alex's chequing at TD Bank
 *   • "rbc-dana"         → Dana's chequing at RBC
 *   • "tangerine-joint"  → Joint savings at Tangerine
 *   • "inbox"            → Agreements / manually entered items
 *
 * Each query in queries.ts tags its results with a `source` label so the
 * agent loop knows where data originated and can route actions accordingly.
 */

import { query } from "./_generated/server";

// ─── Source labels ───────────────────────────────────────────────────────────

export type SourceLabel =
  | "td-alex"
  | "rbc-dana"
  | "tangerine-joint"
  | "inbox";

/**
 * Derives the source label for an account based on institution.
 * The seed uses predictable institutions, so this mapping is stable.
 */
export function sourceForAccount(account: { institution: string }): SourceLabel {
  const inst = account.institution.toLowerCase();
  if (inst.includes("td")) return "td-alex";
  if (inst.includes("rbc")) return "rbc-dana";
  if (inst.includes("tangerine")) return "tangerine-joint";
  // fallback — shouldn't happen with seeded data
  return "td-alex";
}

// ─── Source metadata query ───────────────────────────────────────────────────

export const getSources = query({
  args: {},
  handler: async (ctx) => {
    const accounts = await ctx.db.query("accounts").collect();
    const people = await ctx.db.query("people").collect();

    const nameMap = new Map<string, string>();
    for (const p of people) {
      nameMap.set(p._id, p.name);
    }

    const accountSources = accounts.map((a) => ({
      source: sourceForAccount(a),
      accountId: a._id as string,
      institution: a.institution,
      type: a.type,
      owner: nameMap.get(a.ownerId) ?? "Unknown",
      balanceCents: a.balanceCents,
    }));

    // Add the inbox virtual source (agreements, manual entries)
    return [
      ...accountSources,
      {
        source: "inbox" as SourceLabel,
        accountId: null as string | null,
        institution: "Manual",
        type: "inbox" as const,
        owner: "Household",
        balanceCents: BigInt(0),
      },
    ];
  },
});

// ─── Helper: get all accounts grouped by source ──────────────────────────────

export const getAccountsBySource = query({
  args: {},
  handler: async (ctx) => {
    const accounts = await ctx.db.query("accounts").collect();
    const grouped: Record<SourceLabel, typeof accounts> = {
      "td-alex": [],
      "rbc-dana": [],
      "tangerine-joint": [],
      inbox: [],
    };
    for (const a of accounts) {
      const src = sourceForAccount(a);
      grouped[src].push(a);
    }
    return grouped;
  },
});
