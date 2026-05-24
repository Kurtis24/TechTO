/**
 * Minimal detectors that write byproduct cards (duplicate / creep / outlier).
 *
 * These are intentionally simple — the real "engine" lives in Brian's branch.
 * Here we just need cards in the feed so the Ring-camera model reads:
 * "Kin is watching everything, three things worth your attention."
 *
 * Idempotent — clears existing byproduct cards before re-inserting.
 */

import { mutation } from "./_generated/server";

export const runDetectors = mutation({
  args: {},
  handler: async (ctx) => {
    // Wipe existing byproduct cards (keep overdraft + info cards alone).
    const all = await ctx.db.query("cards").collect();
    for (const c of all) {
      if (c.type === "duplicate" || c.type === "creep" || c.type === "outlier") {
        await ctx.db.delete(c._id);
      }
    }

    const now = Date.now();
    let created = 0;

    // ── Duplicate: same merchant + amount within 7 days ──────────────────────
    const txns = await ctx.db.query("transactions").collect();
    const byKey = new Map<string, { date: number; merchant: string; amountCents: bigint }[]>();
    for (const t of txns) {
      if (t.amountCents >= BigInt(0)) continue; // only outflows
      const key = `${t.merchant}|${t.amountCents}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push({ date: t.date, merchant: t.merchant, amountCents: t.amountCents });
    }
    for (const [, list] of byKey) {
      list.sort((a, b) => a.date - b.date);
      for (let i = 1; i < list.length; i++) {
        const gap = list[i].date - list[i - 1].date;
        if (gap > 0 && gap < 7 * 86_400_000) {
          const dollars = (Number(-list[i].amountCents) / 100).toFixed(2);
          await ctx.db.insert("cards", {
            type: "duplicate",
            severity: "warn",
            title: `Possible duplicate charge: ${list[i].merchant}`,
            body: `Paid $${dollars} to ${list[i].merchant} twice within a week. Worth a check.`,
            actions: [
              { id: "dispute", label: "Mark as duplicate", kind: "dismiss", params: {} },
              { id: "ignore", label: "Not a duplicate", kind: "dismiss", params: {} },
            ],
            status: "open",
            createdAt: now,
          });
          created++;
          break; // one card per merchant+amount pair
        }
      }
    }

    // ── Creep: subscription whose history trends upward ──────────────────────
    const subs = await ctx.db.query("subscriptions").collect();
    for (const s of subs) {
      if (s.history.length < 2) continue;
      const first = s.history[0].amountCents;
      const last = s.history[s.history.length - 1].amountCents;
      if (last > first) {
        const fromD = (Number(first) / 100).toFixed(2);
        const toD = (Number(last) / 100).toFixed(2);
        const pct = Math.round((Number(last - first) / Number(first)) * 100);
        await ctx.db.insert("cards", {
          type: "creep",
          severity: "warn",
          title: `${s.merchant} crept up ${pct}%`,
          body: `${s.merchant} went from $${fromD} → $${toD} over ${s.history.length} months. Cancel or keep?`,
          actions: [
            { id: "cancel", label: "Cancel subscription", kind: "dismiss", params: {} },
            { id: "keep", label: "Keep it", kind: "dismiss", params: {} },
          ],
          status: "open",
          createdAt: now,
        });
        created++;
      }
    }

    // ── Outlier: a single txn far above the per-account mean outflow ─────────
    const byAccount = new Map<string, typeof txns>();
    for (const t of txns) {
      const k = t.accountId as string;
      if (!byAccount.has(k)) byAccount.set(k, []);
      byAccount.get(k)!.push(t);
    }
    for (const [, list] of byAccount) {
      const outflows = list
        .filter((t) => t.amountCents < BigInt(0) && t.category !== "rent" && t.category !== "transfer")
        .map((t) => ({ ...t, abs: Number(-t.amountCents) }));
      if (outflows.length < 5) continue;
      const mean = outflows.reduce((a, b) => a + b.abs, 0) / outflows.length;
      // anything 6x the mean is "unlike normal"
      const outliers = outflows.filter((t) => t.abs > mean * 6);
      for (const o of outliers) {
        const dollars = (o.abs / 100).toFixed(2);
        await ctx.db.insert("cards", {
          type: "outlier",
          severity: "warn",
          title: `Unusual: $${dollars} at ${o.merchant}`,
          body: `This is roughly ${Math.round(o.abs / mean)}× your typical spend. If it wasn't you, dispute now.`,
          actions: [
            { id: "ok", label: "That was me", kind: "dismiss", params: {} },
            { id: "dispute", label: "Dispute charge", kind: "dismiss", params: {} },
          ],
          status: "open",
          createdAt: now,
        });
        created++;
      }
    }

    return { created };
  },
});

// ─── dismiss / silence byproduct cards ───────────────────────────────────────
import { v } from "convex/values";
export const dismissCard = mutation({
  args: { cardId: v.id("cards") },
  handler: async (ctx, { cardId }) => {
    await ctx.db.patch(cardId, { status: "dismissed" });
  },
});
