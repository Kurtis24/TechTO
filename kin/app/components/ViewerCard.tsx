"use client";

/**
 * Viewer card — the "who am I" anchor in the header. Click it to open the
 * household panel and switch between members. All data flows from props so
 * the component owns nothing about the household: it just renders whoever
 * Convex says is currently viewing.
 */

import { useState, useTransition } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  HouseholdPanel,
  type HouseholdPerson,
  type AccountForViewer,
} from "./HouseholdPanel";
import { useToast } from "./Toast";

type Props = {
  people: HouseholdPerson[] | undefined;
  currentViewer: HouseholdPerson | null | undefined;
  accounts: AccountForViewer[];
  onResetDemo: () => void | Promise<void>;
  resetting?: boolean;
};

function initial(name: string): string {
  return name.trim()?.[0]?.toUpperCase() ?? "?";
}

export function ViewerCard({
  people,
  currentViewer,
  accounts,
  onResetDemo,
  resetting,
}: Props) {
  const setViewer = useMutation(api.mutations.setCurrentViewer);
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<Id<"people"> | null>(null);
  const [, startTransition] = useTransition();

  const display = currentViewer?.displayName ?? currentViewer?.name ?? "—";
  const sub =
    currentViewer?.relationship ?? currentViewer?.role ?? "Household member";
  const partner = people?.find((p) => p._id !== currentViewer?._id);
  const subWithContext = partner
    ? `${sub} · with ${partner.displayName ?? partner.name}`
    : sub;

  const handleSwitch = async (personId: Id<"people">) => {
    setSwitching(personId);
    try {
      await setViewer({ personId });
      const next = people?.find((p) => p._id === personId);
      const nextDisplay = next?.displayName ?? next?.name ?? "viewer";
      startTransition(() => setOpen(false));
      push({
        variant: "info",
        title: `Now viewing as ${nextDisplay}`,
        body: "Feed, accounts and agreements update for their access scope.",
      });
    } catch (err) {
      push({
        variant: "error",
        title: "Couldn't switch viewer",
        body: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setSwitching(null);
    }
  };

  // Skeleton while Convex hydrates
  if (!currentViewer) {
    return (
      <div className="kin-viewer kin-viewer-skeleton" aria-busy="true">
        <span className="kin-viewer-avatar" aria-hidden="true" />
        <div className="kin-viewer-body">
          <span className="kin-viewer-name">&nbsp;</span>
          <span className="kin-viewer-sub">&nbsp;</span>
        </div>
      </div>
    );
  }

  return (
    <div className="kin-viewer-wrap">
      <button
        type="button"
        data-kin-viewer-trigger
        className={`kin-viewer ${open ? "kin-viewer-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Viewing as ${display}. Open household panel.`}
      >
        <span
          className="kin-viewer-avatar"
          style={{
            background:
              currentViewer.avatarColor ??
              "radial-gradient(circle at 35% 30%, #ffd56a 0%, var(--kin-ember) 55%, #6b2306 100%)",
          }}
          aria-hidden="true"
        >
          {initial(currentViewer.name)}
        </span>
        <div className="kin-viewer-body">
          <div className="kin-viewer-row">
            <span className="kin-viewer-eyebrow">Viewing as</span>
            <span className="kin-viewer-name">{display}</span>
          </div>
          <div className="kin-viewer-sub">{subWithContext}</div>
        </div>
        <span className="kin-viewer-chevron" aria-hidden="true">
          <svg viewBox="0 0 12 12" width="10" height="10">
            <path
              d="M2.5 4.5l3.5 3 3.5-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      <HouseholdPanel
        open={open}
        onClose={() => setOpen(false)}
        people={people ?? []}
        currentViewerId={currentViewer._id}
        accounts={accounts}
        onSwitchViewer={handleSwitch}
        onResetDemo={async () => {
          await onResetDemo();
          setOpen(false);
        }}
        resetting={resetting}
        switchingTo={switching}
      />
    </div>
  );
}
