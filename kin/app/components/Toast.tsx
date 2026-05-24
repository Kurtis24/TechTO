"use client";

/**
 * Toast system — the quiet confirmation layer.
 *
 * Cards on the feed dismiss themselves when an action completes; without a
 * persistent receipt the user is left wondering whether anything happened.
 * Toasts fill that gap: a small ember-tinted card at the bottom-right that
 * spells out what Kin just did, then fades out. Stays on-brand (no neon green,
 * no system alerts).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastVariant = "success" | "info" | "warn" | "error";

export type Toast = {
  id: string;
  variant: ToastVariant;
  title: string;
  body?: string;
  duration?: number;
};

type ToastContextValue = {
  push: (toast: Omit<Toast, "id">) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 4200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
    setToasts((cur) => cur.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback<ToastContextValue["push"]>(
    (toast) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const full: Toast = { ...toast, id };
      setToasts((cur) => [...cur, full]);
      const duration = toast.duration ?? DEFAULT_DURATION;
      if (duration > 0) {
        const handle = setTimeout(() => {
          timers.current.delete(id);
          setToasts((cur) => cur.filter((t) => t.id !== id));
        }, duration);
        timers.current.set(id, handle);
      }
      return id;
    },
    [],
  );

  useEffect(() => {
    const timersSnapshot = timers.current;
    return () => {
      for (const handle of timersSnapshot.values()) clearTimeout(handle);
      timersSnapshot.clear();
    };
  }, []);

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return ctx;
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      className="kin-toast-viewport"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const isError = toast.variant === "error";
  return (
    <div
      className={`kin-toast kin-toast-${toast.variant}`}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
    >
      <span className="kin-toast-icon" aria-hidden="true">
        <ToastIcon variant={toast.variant} />
      </span>
      <div className="kin-toast-body">
        <div className="kin-toast-title">{toast.title}</div>
        {toast.body ? <div className="kin-toast-desc">{toast.body}</div> : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="kin-toast-close"
        aria-label="Dismiss notification"
      >
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path
            d="M3.5 3.5l9 9m0-9l-9 9"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

function ToastIcon({ variant }: { variant: ToastVariant }) {
  if (variant === "success") {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14">
        <path
          d="M3 8.5l3 3 7-7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (variant === "error") {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14">
        <path d="M8 1.5L15 14H1L8 1.5z" fill="currentColor" />
        <path
          d="M8 6v3"
          stroke="#1a0d05"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="8" cy="11.5" r="0.9" fill="#1a0d05" />
      </svg>
    );
  }
  if (variant === "warn") {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14">
        <circle
          cx="8"
          cy="8"
          r="6.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M8 5v3.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="8" cy="11" r="0.8" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" width="14" height="14">
      <circle
        cx="8"
        cy="8"
        r="6.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M8 7.2v3.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="8" cy="5.1" r="0.85" fill="currentColor" />
    </svg>
  );
}
