"use client";

import { useEffect, useRef, useState } from "react";

export type CallState =
  | { status: "dialing" }
  | { status: "ringing" }
  | { status: "connected"; agentAudio: string; danaAudio: string; agentLine: string; danaLine: string }
  | { status: "ended" };

export function CallModal({
  state,
  onClose,
}: {
  state: CallState | null;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<
    "dialing" | "ringing" | "agent" | "dana" | "wrapup" | "done"
  >("dialing");
  const agentRef = useRef<HTMLAudioElement>(null);
  const danaRef = useRef<HTMLAudioElement>(null);

  // Drive the call animation from the action's response.
  useEffect(() => {
    if (!state) return;
    if (state.status === "dialing") setStage("dialing");
    if (state.status === "ringing") setStage("ringing");
    if (state.status === "connected") {
      // Sequenced playback: agent line → ~600ms → dana reply → ~800ms → wrapup
      setStage("agent");
      const a = agentRef.current;
      if (a) {
        a.currentTime = 0;
        a.play().catch(() => {});
      }
    }
  }, [state]);

  // When the assistant audio finishes, play Dana's reply.
  const handleAgentEnded = () => {
    setStage("dana");
    setTimeout(() => {
      danaRef.current?.play().catch(() => {});
    }, 500);
  };

  // When Dana finishes, show the wrap-up beat.
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

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm kin-fade-in">
      <div className="w-full max-w-md rounded-3xl bg-zinc-950 px-7 py-8 text-zinc-100 shadow-2xl">
        <div className="flex items-center gap-4">
          <div
            className={`grid h-14 w-14 place-items-center rounded-full bg-emerald-500/20 text-emerald-300 ${
              stage === "ringing" || stage === "dialing" ? "kin-pulse" : ""
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current">
              <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.6a1 1 0 0 1-.25 1l-2.22 2.2Z" />
            </svg>
          </div>
          <div>
            <div className="text-sm uppercase tracking-wide text-zinc-400">
              {subtitle}
            </div>
            <div className="text-lg font-semibold">Dana · RBC partner</div>
          </div>
        </div>

        <div className="mt-6 min-h-[88px] rounded-2xl bg-zinc-900 px-4 py-3 text-sm leading-relaxed text-zinc-200">
          {stage === "dialing" || stage === "ringing" ? (
            <span className="text-zinc-500">— ringing —</span>
          ) : (
            <span className="kin-fade-in inline-block">{transcript}</span>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 kin-pulse" />
            ElevenLabs · simulated
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-rose-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-rose-700"
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
