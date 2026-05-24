"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type CardDoc = {
  _id: Id<"cards">;
  type: "overdraft" | "duplicate" | "creep" | "outlier" | "info";
  severity: "info" | "warn" | "critical";
  title: string;
  body: string;
  status: "open" | "resolved" | "dismissed";
  actions: { id: string; label: string; kind: string; params: unknown }[];
};

const ICONS: Record<CardDoc["type"], { glyph: string; tint: string }> = {
  duplicate: { glyph: "⚠", tint: "text-amber-700 bg-amber-50 border-amber-200" },
  creep: { glyph: "↗", tint: "text-violet-700 bg-violet-50 border-violet-200" },
  outlier: { glyph: "🛡", tint: "text-sky-700 bg-sky-50 border-sky-200" },
  info: { glyph: "•", tint: "text-zinc-600 bg-zinc-50 border-zinc-200" },
  overdraft: { glyph: "!", tint: "text-rose-700 bg-rose-50 border-rose-200" },
};

export function ByproductCard({ card }: { card: CardDoc }) {
  const executeAction = useAction(api.agent.executeAction);
  const [busy, setBusy] = useState(false);
  const meta = ICONS[card.type];

  const handle = async (actionId: string) => {
    setBusy(true);
    try {
      await executeAction({ cardId: card._id, actionId });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
      <div className="flex items-start gap-3">
        <div
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-sm ${meta.tint}`}
        >
          {meta.glyph}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-zinc-900 truncate">
              {card.title}
            </h3>
            <span className="text-[10px] uppercase tracking-wider text-zinc-400">
              {card.type}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-zinc-600">{card.body}</p>
          {card.actions.length > 0 && (
            <div className="mt-2 flex gap-2">
              {card.actions.map((a) => (
                <button
                  key={a.id}
                  onClick={() => handle(a.id)}
                  disabled={busy}
                  className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
