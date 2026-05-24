"use node";

/**
 * Daily morning briefing — sent via SMS to every active subscriber.
 *
 *   morningBriefing()         — for-each subscriber → build → send.
 *   sendBriefingTo(phone)     — manual one-off, useful for the demo.
 *
 * Briefing shape (3-5 short lines, conversational, no emoji):
 *   1. Headline       — biggest thing they should know about today.
 *   2. Upcoming       — recurring debits in next 7 days, total + biggest.
 *   3. This-month     — spend month-to-date vs same-window last month.
 *   4. Open agreements / pings if any.
 *   5. Call-to-action — "Reply with a question anytime."
 *
 * We let Backboard rephrase the deterministic facts so the tone stays human,
 * but ALWAYS fall back to the deterministic version on Backboard error so
 * the cron doesn't fail silently.
 */

import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { BackboardClient, type ChatMessagesResponse } from "backboard-sdk";

const MODEL = {
  llm_provider: "openrouter",
  model_name: "moonshotai/kimi-k2.6",
};

const DAY = 86_400_000;

const dollars = (cents: number | bigint) =>
  (Number(cents) / 100).toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
  });

const dollarsShort = (cents: number | bigint) =>
  (Number(cents) / 100).toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  });

function backboard() {
  const apiKey = process.env.BACKBOARD_API_KEY;
  if (!apiKey) return null;
  return new BackboardClient({ apiKey });
}

const asChat = (r: unknown) => r as ChatMessagesResponse;

// ─── morningBriefing ─────────────────────────────────────────────────────────
// Cron entrypoint. Iterates active subscribers, sends each one their briefing.
export const morningBriefing = action({
  args: {},
  handler: async (
    ctx
  ): Promise<{ sent: number; skipped: number; errors: string[] }> => {
    const subs = await ctx.runQuery(api.queries.getSubscribers, {
      activeOnly: true,
    });
    const errors: string[] = [];
    let sent = 0;
    let skipped = 0;

    for (const s of subs) {
      try {
        const ok = await ctx.runAction(api.briefing.sendBriefingTo, {
          phone: s.phone,
        });
        if (ok.ok) sent++;
        else skipped++;
      } catch (e: unknown) {
        errors.push(`${s.phone}: ${(e as Error).message ?? String(e)}`);
      }
    }
    return { sent, skipped, errors };
  },
});

// ─── sendBriefingTo ──────────────────────────────────────────────────────────
// Build + send a briefing for one subscriber. Demo-friendly: callable manually
// from the Convex dashboard with `{ phone: "+14165551234" }`.
export const sendBriefingTo = action({
  args: { phone: v.string() },
  handler: async (
    ctx,
    { phone }
  ): Promise<{ ok: boolean; sid?: string; reason?: string; body: string }> => {
    const subs = await ctx.runQuery(api.queries.getSubscribers, {
      activeOnly: false,
    });
    const sub = subs.find((s) => s.phone === phone);
    if (!sub) return { ok: false, reason: "not subscribed", body: "" };

    // Build the deterministic facts off the demo seed.
    const facts = await gatherFacts(ctx, sub.personId ?? null, sub.name);

    // Try to phrase via Backboard; fall back if it fails.
    let body = await phraseBriefing(facts).catch(() => null);
    if (!body) body = deterministicBriefing(facts);

    // Hard-cap at 1500 chars (Twilio SMS segments).
    if (body.length > 1500) body = body.slice(0, 1497) + "…";

    const res = await ctx.runAction(api.twilioSend.sendSms, {
      to: phone,
      body,
    });
    if (!res.ok) return { ok: false, reason: res.error, body };
    return { ok: true, sid: res.sid, body };
  },
});

// ─── facts → string ──────────────────────────────────────────────────────────

type Facts = {
  name: string;
  cheq: { institution: string; balanceCents: number } | null;
  joint: { institution: string; balanceCents: number } | null;
  upcoming7d: { merchant: string; amountCents: number }[];
  upcoming7dTotalCents: number;
  monthToDateOutCents: number;
  prevMonthSameWindowOutCents: number;
  openAgreements: { fromName: string; toName: string; amountCents: number; reason: string }[];
  openCardCount: number;
  topAlertTitle: string | null;
};

async function gatherFacts(
  ctx: { runQuery: <T>(q: T, args: object) => Promise<unknown> },
  personId: Id<"people"> | null,
  name: string,
): Promise<Facts> {
  const accounts = (await ctx.runQuery(api.queries.getAccounts, {})) as {
    _id: string;
    ownerId: string;
    institution: string;
    type: string;
    balanceCents: bigint;
  }[];
  const txns = (await ctx.runQuery(api.queries.getRecentTransactions, {
    limit: 200,
  })) as {
    accountId: string;
    date: number;
    merchant: string;
    amountCents: bigint;
    recurring: boolean;
  }[];
  const ags = (await ctx.runQuery(api.queries.getAgreements, {})) as {
    fromName: string;
    toName: string;
    amountCents: bigint;
    status: string;
    reason: string;
  }[];
  const cards = (await ctx.runQuery(api.queries.getCards, {})) as {
    type: string;
    severity: string;
    title: string;
    status: string;
    createdAt: number;
  }[];

  // Pick "their" chequing — the one owned by personId, else just the first.
  const cheq =
    accounts.find(
      (a) => a.type === "chequing" && (!personId || a.ownerId === personId),
    ) ?? accounts.find((a) => a.type === "chequing") ?? null;
  const joint =
    accounts.find((a) => a.type === "joint" || a.type === "savings") ?? null;

  // Upcoming 7d — recurring debits whose typical day-of-month falls in window.
  const upcomingWindowStart = Date.now();
  const upcomingWindowEnd = upcomingWindowStart + 7 * DAY;
  const recurringDebits = txns.filter(
    (t) => t.recurring && t.amountCents < BigInt(0),
  );
  // Group by merchant, take most-recent amount as the predicted next charge.
  const byMerchant = new Map<string, { amt: bigint; lastDate: number }>();
  for (const t of recurringDebits) {
    const cur = byMerchant.get(t.merchant);
    if (!cur || t.date > cur.lastDate)
      byMerchant.set(t.merchant, { amt: t.amountCents, lastDate: t.date });
  }
  const upcoming7d: { merchant: string; amountCents: number }[] = [];
  for (const [merchant, { amt, lastDate }] of byMerchant) {
    const typicalDay = new Date(lastDate).getDate();
    for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
      const d = new Date(upcomingWindowStart + dayOffset * DAY);
      if (d.getDate() === typicalDay && d.getTime() <= upcomingWindowEnd) {
        upcoming7d.push({
          merchant,
          amountCents: Math.abs(Number(amt)),
        });
        break;
      }
    }
  }
  upcoming7d.sort((a, b) => b.amountCents - a.amountCents);
  const upcoming7dTotalCents = upcoming7d.reduce(
    (s, u) => s + u.amountCents,
    0,
  );

  // This-month vs same-window prev-month outflows.
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthDay = now.getDate();
  const prevMonthStart = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    1,
  ).getTime();
  const prevMonthSameDay = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    monthDay,
  ).getTime();

  let mtdOut = 0;
  let prevMtdOut = 0;
  for (const t of txns) {
    if (t.amountCents >= BigInt(0)) continue;
    if (t.merchant === "Opening Balance") continue;
    const amt = Math.abs(Number(t.amountCents));
    if (t.date >= monthStart && t.date <= now.getTime()) mtdOut += amt;
    else if (t.date >= prevMonthStart && t.date <= prevMonthSameDay)
      prevMtdOut += amt;
  }

  const openAgreements = ags
    .filter((a) => a.status === "open" || a.status === "requested")
    .map((a) => ({
      fromName: a.fromName,
      toName: a.toName,
      amountCents: Number(a.amountCents),
      reason: a.reason,
    }));

  const openCards = cards.filter((c) => c.status === "open");
  const sorted = [...openCards].sort((a, b) => {
    const sevRank: Record<string, number> = { critical: 0, warn: 1, info: 2 };
    return (sevRank[a.severity] ?? 3) - (sevRank[b.severity] ?? 3);
  });

  return {
    name,
    cheq: cheq
      ? { institution: cheq.institution, balanceCents: Number(cheq.balanceCents) }
      : null,
    joint: joint
      ? {
          institution: joint.institution,
          balanceCents: Number(joint.balanceCents),
        }
      : null,
    upcoming7d,
    upcoming7dTotalCents,
    monthToDateOutCents: mtdOut,
    prevMonthSameWindowOutCents: prevMtdOut,
    openAgreements,
    openCardCount: openCards.length,
    topAlertTitle: sorted[0]?.title ?? null,
  };
}

// Plain-text briefing — guaranteed-to-work fallback.
function deterministicBriefing(f: Facts): string {
  const lines: string[] = [];
  lines.push(`Good morning, ${f.name}.`);

  if (f.cheq) {
    const upcoming = f.upcoming7dTotalCents > 0
      ? ` ${dollarsShort(f.upcoming7dTotalCents)} of bills hit in the next 7 days.`
      : "";
    lines.push(
      `Chequing sits at ${dollars(f.cheq.balanceCents)}.${upcoming}`,
    );
  }

  if (f.upcoming7d.length > 0) {
    const top = f.upcoming7d[0];
    lines.push(
      `Biggest upcoming: ${top.merchant} ${dollars(top.amountCents)}.`,
    );
  }

  if (f.prevMonthSameWindowOutCents > 0) {
    const diff = f.monthToDateOutCents - f.prevMonthSameWindowOutCents;
    const pct = Math.round(
      (diff / f.prevMonthSameWindowOutCents) * 100,
    );
    const verb = diff >= 0 ? "up" : "down";
    lines.push(
      `Spending month-to-date: ${dollarsShort(f.monthToDateOutCents)} (${verb} ${Math.abs(pct)}% vs last month).`,
    );
  } else if (f.monthToDateOutCents > 0) {
    lines.push(
      `Spending month-to-date: ${dollarsShort(f.monthToDateOutCents)}.`,
    );
  }

  for (const a of f.openAgreements) {
    lines.push(
      `Heads up: ${a.fromName} owes ${a.toName} ${dollars(a.amountCents)} (${a.reason}).`,
    );
  }

  if (f.openCardCount > 0 && f.topAlertTitle) {
    lines.push(
      `${f.openCardCount} open ${f.openCardCount === 1 ? "alert" : "alerts"} — top: ${f.topAlertTitle}.`,
    );
  }

  lines.push(`Reply with a question anytime.`);
  return lines.join(" ");
}

// Use Backboard to rephrase the facts in human voice. Throws on failure so the
// caller falls back to deterministic.
async function phraseBriefing(f: Facts): Promise<string> {
  const bb = backboard();
  if (!bb) throw new Error("BACKBOARD_API_KEY not set");

  const prompt = `
You are Kin, a calm household financial guardian sending a morning SMS to ${f.name}.
Write a 3-5 sentence message, plain prose, no emoji, no bullet points, no markdown. Address ${f.name} by name. Tone: friend who already did the work, not a bank app.

Facts:
- Chequing balance: ${f.cheq ? dollars(f.cheq.balanceCents) : "—"}
${f.joint ? `- Joint savings: ${dollars(f.joint.balanceCents)}` : ""}
- Upcoming bills next 7 days: ${f.upcoming7d.length === 0 ? "none" : f.upcoming7d.map((u) => `${u.merchant} ${dollars(u.amountCents)}`).join(", ")}
- Spending month-to-date: ${dollars(f.monthToDateOutCents)} (vs ${dollars(f.prevMonthSameWindowOutCents)} same window last month)
${f.openAgreements.map((a) => `- Agreement: ${a.fromName} owes ${a.toName} ${dollars(a.amountCents)} (${a.reason})`).join("\n")}
${f.openCardCount > 0 ? `- ${f.openCardCount} open alert${f.openCardCount === 1 ? "" : "s"}; top: ${f.topAlertTitle ?? ""}` : ""}

End with: "Reply with a question anytime."
Return ONLY the message text.
  `.trim();

  const reply = asChat(
    await bb.sendMessage({
      content: prompt,
      memory: "Auto",
      ...MODEL,
    }),
  );
  const out = (reply.content ?? "").trim();
  if (!out) throw new Error("Empty Backboard reply");
  return out;
}
