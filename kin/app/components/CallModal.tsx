"use client";

import { useEffect, useRef, useState } from "react";

export type CallState =
  | { status: "dialing" }
  | { status: "ringing" }
  | {
      status: "connected";
      agentAudio: string;
      danaAudio: string;
      agentLine: string;
      danaLine: string;
    }
  | { status: "ended" };

type Stage = "dialing" | "ringing" | "agent" | "dana" | "wrapup" | "done";

export function CallModal({
  state,
  onClose,
}: {
  state: CallState | null;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<Stage>("dialing");
  const [elapsed, setElapsed] = useState(0);
  const agentRef = useRef<HTMLAudioElement>(null);
  const danaRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!state) return;
    if (state.status === "dialing") setStage("dialing");
    if (state.status === "ringing") setStage("ringing");
    if (state.status === "connected") {
      setStage("agent");
      const a = agentRef.current;
      if (a) {
        a.currentTime = 0;
        a.play().catch(() => {});
      }
    }
  }, [state]);

  // Tick a "call timer" once we're connected — small detail, big realism.
  useEffect(() => {
    if (!state) return;
    if (stage === "dialing" || stage === "ringing" || stage === "done") return;
    const start = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Date.now() - start), 1000);
    return () => clearInterval(id);
  }, [state, stage]);

  const handleAgentEnded = () => {
    setStage("dana");
    setTimeout(() => {
      danaRef.current?.play().catch(() => {});
    }, 500);
  };

  const handleDanaEnded = () => {
    setStage("wrapup");
    setTimeout(() => setStage("done"), 1500);
  };

  if (!state) return null;

  const subtitle =
    stage === "dialing"
      ? "Dialing Dana…"
      : stage === "ringing"
        ? "Ringing…"
        : stage === "agent"
          ? "Kin is speaking"
          : stage === "dana"
            ? "Dana"
            : stage === "wrapup"
              ? "Wrapping up…"
              : "Call ended";

  const transcript =
    state.status === "connected"
      ? stage === "agent"
        ? state.agentLine
        : stage === "dana"
          ? state.danaLine
          : stage === "wrapup"
            ? "Dana confirmed. Settling the agreement — funds on the way."
            : "Done."
      : "";

  const isLive = stage === "agent" || stage === "dana";
  const isWaiting = stage === "dialing" || stage === "ringing";

  const elapsedLabel = formatElapsed(elapsed);

  return (
    <div
      className="kin-fade-in fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Call with Dana"
      style={{ overscrollBehavior: "contain" }}
    >
      <div
        className="kin-card relative w-full max-w-md overflow-hidden px-7 py-8"
        style={{
          background:
            "radial-gradient(120% 80% at 100% 0%, rgba(255, 107, 31, 0.18) 0%, rgba(255, 107, 31, 0.04) 35%, rgba(255, 107, 31, 0) 65%), var(--kin-surface-2)",
          borderColor: "rgba(255, 107, 31, 0.25)",
        }}
      >
        {/* Top eyebrow */}
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-kin-bone-soft">
          <span className="inline-flex items-center gap-2">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                isWaiting ? "kin-pulse" : ""
              }`}
              style={{
                backgroundColor: isLive
                  ? "var(--kin-good)"
                  : "var(--kin-amber-soft)",
              }}
              aria-hidden="true"
            />
            {subtitle}
          </span>
          {!isWaiting && (
            <span
              className="tabular-nums text-kin-bone-mute"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {elapsedLabel}
            </span>
          )}
        </div>

        {/* Avatar + name */}
        <div className="mt-6 flex items-center gap-4">
          <div className="relative">
            <div
              className={`grid h-16 w-16 place-items-center rounded-full ${
                isWaiting ? "kin-pulse" : ""
              }`}
              style={{
                background:
                  "radial-gradient(circle at 35% 30%, #ffd56a 0%, #ff6b1f 50%, #6b2306 95%)",
                boxShadow:
                  "0 0 0 1px rgba(255, 213, 106, 0.4), 0 0 32px -4px rgba(255, 107, 31, 0.6)",
              }}
              aria-hidden="true"
            >
              <span
                className="text-[22px] text-[#1a0d05]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                D
              </span>
            </div>
            {/* Outer pulsing ring while live */}
            {isLive && (
              <span
                className="pointer-events-none absolute inset-[-6px] rounded-full"
                style={{
                  border: "1px solid rgba(255, 107, 31, 0.35)",
                  animation: "kinPulse 1.6s ease-in-out infinite",
                }}
                aria-hidden="true"
              />
            )}
          </div>
          <div>
            <div
              className="text-2xl text-kin-bone"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              <span className="italic">Dana</span>
            </div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-kin-bone-soft">
              RBC partner · cottage trip
            </div>
          </div>
        </div>

        {/* Transcript / waveform */}
        <div
          className="mt-6 min-h-[112px] rounded-2xl border border-[var(--kin-line)] bg-[rgba(0,0,0,0.4)] px-5 py-4"
          aria-live="polite"
        >
          {isWaiting ? (
            <div className="flex items-center gap-3 py-2">
              <RingingDots />
              <span className="text-sm text-kin-bone-soft">— ringing —</span>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <div className="mt-1.5 shrink-0">
                <Waveform active={isLive} stage={stage} />
              </div>
              <div>
                <div
                  className="text-[10px] uppercase tracking-[0.22em]"
                  style={{
                    color:
                      stage === "agent"
                        ? "var(--kin-ember-soft)"
                        : "var(--kin-bone-soft)",
                  }}
                >
                  {stage === "agent"
                    ? "Kin"
                    : stage === "dana"
                      ? "Dana"
                      : "Summary"}
                </div>
                <p className="kin-fade-in mt-1 text-[15px] leading-relaxed text-kin-bone">
                  {transcript}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-kin-bone-dim">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full bg-kin-amber-soft kin-pulse"
              aria-hidden="true"
            />
            <span style={{ fontFamily: "var(--font-mono)" }}>
              ElevenLabs · simulated
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="kin-btn"
            style={{
              background:
                "linear-gradient(180deg, #2a1612 0%, #1a0d0a 100%)",
              color: "#ffb094",
              border: "1px solid rgba(255, 107, 31, 0.4)",
              padding: "0.5rem 1rem",
            }}
            aria-label={stage === "done" ? "Close call" : "End call"}
          >
            {stage === "done" ? "Close" : "End call"}
          </button>
        </div>

        {state.status === "connected" && (
          <>
            <audio
              ref={agentRef}
              src={state.agentAudio}
              onEnded={handleAgentEnded}
              preload="auto"
            />
            <audio
              ref={danaRef}
              src={state.danaAudio}
              onEnded={handleDanaEnded}
              preload="auto"
            />
          </>
        )}
      </div>
    </div>
  );
}

/* ── helpers ───────────────────────────────────────────────────── */

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** A small live "waveform" — five bars that breathe while a speaker is live. */
function Waveform({ active, stage }: { active: boolean; stage: Stage }) {
  const color =
    stage === "agent" ? "var(--kin-ember)" : "var(--kin-bone-mute)";
  const heights = [10, 16, 22, 14, 8];
  return (
    <div className="flex h-6 items-center gap-[3px]">
      {heights.map((h, i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: 2,
            height: h,
            borderRadius: 1,
            backgroundColor: color,
            opacity: active ? 1 : 0.3,
            animation: active
              ? `kinBar 0.9s ease-in-out ${i * 0.08}s infinite alternate`
              : "none",
            transformOrigin: "center",
          }}
        />
      ))}
      <style jsx>{`
        @keyframes kinBar {
          from {
            transform: scaleY(0.4);
          }
          to {
            transform: scaleY(1.2);
          }
        }
      `}</style>
    </div>
  );
}

function RingingDots() {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: 999,
            backgroundColor: "var(--kin-amber-soft)",
            animation: `kinPulse 1.2s ease-in-out ${i * 0.18}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
