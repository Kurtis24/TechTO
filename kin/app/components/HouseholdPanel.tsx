"use client";

/**
 * Household panel — the Wealthsimple-style popover that opens from the
 * viewer pill in the header. It's the demo's "see what Alex sees, switch
 * to Dana" moment made tangible.
 *
 * Anchored to the viewer card; closes on outside click or Esc. Lists every
 * household member, surfaces which one is currently viewing, and lets you
 * switch with a single tap. Reset Demo lives here too — keeps the header
 * uncluttered.
 */

import { useEffect, useRef } from "react";
import type { Id } from "../../convex/_generated/dataModel";

export type HouseholdPerson = {
  _id: Id<"people">;
  name: string;
  displayName?: string;
  role?: string;
  relationship?: string;
  avatarColor?: string;
};

export type AccountForViewer = {
  _id: string;
  ownerId: Id<"people">;
  institution: string;
  type: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  people: HouseholdPerson[];
  currentViewerId: Id<"people"> | null;
  accounts: AccountForViewer[];
  onSwitchViewer: (personId: Id<"people">) => void | Promise<void>;
  onResetDemo: () => void | Promise<void>;
  resetting?: boolean;
  switchingTo?: Id<"people"> | null;
};

function initial(name: string): string {
  return name.trim()?.[0]?.toUpperCase() ?? "?";
}

function accountSummary(person: HouseholdPerson, accounts: AccountForViewer[]) {
  const owned = accounts.filter((a) => a.ownerId === person._id);
  const personal = owned.filter(
    (a) => a.type === "chequing" || a.type === "credit",
  );
  const joint = owned.filter(
    (a) => a.type === "joint" || a.type === "savings",
  );
  const parts: string[] = [];
  if (personal.length)
    parts.push(`${personal.length} personal account${personal.length === 1 ? "" : "s"}`);
  if (joint.length)
    parts.push(`${joint.length} joint`);
  return parts.length ? parts.join(" · ") : "Shared visibility only";
}

export function HouseholdPanel({
  open,
  onClose,
  people,
  currentViewerId,
  accounts,
  onSwitchViewer,
  onResetDemo,
  resetting,
  switchingTo,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click — anchored relative to the parent button, so we
  // also exclude clicks on the trigger pill itself.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!panelRef.current) return;
      if (panelRef.current.contains(target)) return;
      // Trigger button is rendered as a sibling — let its own onClick toggle.
      const trigger = (target as HTMLElement).closest?.("[data-kin-viewer-trigger]");
      if (trigger) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="kin-household-panel"
      role="dialog"
      aria-modal="false"
      aria-label="Household members"
    >
      <header className="kin-household-header">
        <div>
          <div className="kin-household-eyebrow">Your household</div>
          <div className="kin-household-title">
            {people.length} member{people.length === 1 ? "" : "s"}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="kin-household-close"
          aria-label="Close household panel"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M3.5 3.5l9 9m0-9l-9 9"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      <ul className="kin-household-list" role="list">
        {people.map((p) => {
          const isCurrent = p._id === currentViewerId;
          const isSwitching = switchingTo === p._id;
          const display = p.displayName ?? p.name;
          return (
            <li key={p._id} className="kin-household-item">
              <button
                type="button"
                onClick={() => !isCurrent && onSwitchViewer(p._id)}
                disabled={isCurrent || !!switchingTo}
                className={`kin-household-row ${
                  isCurrent ? "kin-household-row-current" : ""
                }`}
                aria-pressed={isCurrent}
                aria-label={
                  isCurrent
                    ? `Currently viewing as ${display}`
                    : `Switch view to ${display}`
                }
              >
                <span
                  className="kin-household-avatar"
                  style={{
                    background:
                      p.avatarColor ??
                      "radial-gradient(circle at 35% 30%, #ffd56a 0%, var(--kin-ember) 55%, #6b2306 100%)",
                  }}
                  aria-hidden="true"
                >
                  {initial(p.name)}
                </span>
                <span className="kin-household-meta">
                  <span className="kin-household-name">
                    {display}
                    {isCurrent && (
                      <span className="kin-household-you">· You</span>
                    )}
                  </span>
                  <span className="kin-household-sub">
                    {p.relationship ?? p.role ?? "Member"} ·{" "}
                    {accountSummary(p, accounts)}
                  </span>
                </span>
                <span className="kin-household-action" aria-hidden="true">
                  {isCurrent ? (
                    <span className="kin-household-badge">Viewing</span>
                  ) : isSwitching ? (
                    <Spinner />
                  ) : (
                    <span className="kin-household-switch">Switch</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <footer className="kin-household-footer">
        <p className="kin-household-note">
          Each member sees joint accounts and any agreements they&rsquo;re part
          of. Private accounts stay private — Kin only references them when
          they&rsquo;re needed to solve a problem.
        </p>
        <div className="kin-household-footer-actions">
          <button
            type="button"
            className="kin-household-secondary"
            disabled
            aria-label="Invite household member (coming soon)"
            title="Coming soon"
          >
            <PlusGlyph /> Invite member
          </button>
          <button
            type="button"
            onClick={onResetDemo}
            disabled={resetting}
            className="kin-household-secondary"
            aria-label="Reset demo to seed data"
          >
            {resetting ? (
              <>
                <Spinner /> Resetting…
              </>
            ) : (
              <>
                <ResetGlyph /> Reset demo
              </>
            )}
          </button>
        </div>
      </footer>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      className="animate-spin"
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path
        d="M8 3v10M3 8h10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ResetGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path
        d="M3 8a5 5 0 1 0 1.5-3.5L3 6m0-3v3h3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
