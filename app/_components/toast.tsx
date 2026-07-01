"use client";

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

import { cx } from "./cx";

/**
 * On-brand toast system (design export). Presentational + a small queue,
 * mirroring the print-context.tsx provider idiom (createContext(null) + a
 * useToast() that throws outside the provider). Ships UNUSED — nothing mounts
 * <ToastProvider> yet — so it's build-not-wire (zero render diff), like Card /
 * PageHeader / ThinkingDots were. Wire it later by mounting the provider at the
 * owner root and inside the diner Storefront, then calling useToast().add(...).
 *
 * Variants map to the existing semantic tokens (success/warm/accent) with the
 * codebase's tinted-background pattern — no new colour tokens. Amber appears only
 * as a warning accent, never as a functional fill, so the --action firewall and
 * amber-for-AI-fills-only rule are untouched.
 */

export type ToastVariant = "success" | "error" | "warning" | "info";

export type ToastOptions = {
  variant?: ToastVariant;
  title?: string;
  message: ReactNode;
  /** Auto-dismiss after N ms; 0 keeps it until dismissed. Default 5000. */
  duration?: number;
};

type ToastItem = ToastOptions & { id: number; variant: ToastVariant };

type ToastContextValue = {
  add: (toast: ToastOptions) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

/** Access the toast queue. Must be used within <ToastProvider>. */
export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error("useToast must be used within <ToastProvider>.");
  }
  return value;
}

const DEFAULT_DURATION = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // Monotonic ids without Date.now()/Math.random() (SSR/replay-safe).
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const add = useCallback((toast: ToastOptions) => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts((prev) => [
      ...prev,
      { ...toast, id, variant: toast.variant ?? "info" },
    ]);
  }, []);

  const value = useMemo(() => ({ add, dismiss }), [add, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Viewport — top-right on desktop, full-width top on mobile. Above the
          sidebar (z-50) and diner chrome; never prints. */}
      <div
        role="region"
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-4 top-4 z-[100] flex flex-col items-end gap-2 print:hidden sm:inset-x-auto sm:right-4"
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} dismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const variantStyles: Record<
  ToastVariant,
  { border: string; chip: string; icon: ReactNode }
> = {
  success: {
    border: "border-l-[var(--color-success)]",
    chip: "bg-[var(--color-success)]/12 text-success-deep",
    icon: <IconCheck />,
  },
  error: {
    border: "border-l-[var(--color-warm)]",
    chip: "bg-[var(--color-warm)]/12 text-[var(--color-warm)]",
    icon: <IconAlert />,
  },
  warning: {
    border: "border-l-[var(--color-accent)]",
    chip: "bg-[var(--color-accent)]/15 text-accent-deep",
    icon: <IconAlert />,
  },
  info: {
    border: "border-l-[var(--color-forest)]",
    chip: "bg-sand text-muted",
    icon: <IconInfo />,
  },
};

function ToastCard({
  toast,
  dismiss,
}: {
  toast: ToastItem;
  dismiss: (id: number) => void;
}) {
  const onDismiss = useCallback(() => dismiss(toast.id), [dismiss, toast.id]);

  const duration = toast.duration ?? DEFAULT_DURATION;
  useEffect(() => {
    if (duration <= 0) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  const styles = variantStyles[toast.variant];

  return (
    <div
      role={toast.variant === "error" ? "alert" : "status"}
      className={cx(
        "p2e-toastin pointer-events-auto flex w-full max-w-sm items-start gap-3",
        "rounded-input border border-l-4 border-line bg-surface-elevated px-4 py-3 shadow-toast",
        styles.border,
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-pill",
          styles.chip,
        )}
      >
        {styles.icon}
      </span>
      <div className="min-w-0 flex-1">
        {toast.title ? (
          <p className="text-sm font-semibold text-ink">{toast.title}</p>
        ) : null}
        <p className={cx("text-sm text-muted", toast.title && "mt-0.5")}>
          {toast.message}
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="-mr-1 -mt-0.5 shrink-0 rounded-control p-1 text-muted transition hover:bg-sand hover:text-ink"
      >
        <IconClose />
      </button>
    </div>
  );
}

/* — inline status/dismiss icons (decorative; the toast carries role/aria) — */
function svg(children: ReactNode) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
    >
      {children}
    </svg>
  );
}
function IconCheck() {
  return svg(<path d="M20 6 9 17l-5-5" />);
}
function IconAlert() {
  return svg(
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </>,
  );
}
function IconInfo() {
  return svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </>,
  );
}
function IconClose() {
  return svg(<path d="M6 6l12 12M18 6 6 18" />);
}
