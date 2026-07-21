"use client";

import { useEffect, useRef, useState } from "react";

import { Spinner } from "@/app/_components/spinner";
import { useDialog } from "@/app/_components/use-dialog";

/**
 * Owner support chat (docs/ai-support-chat-plan.md §4 P2) — the Synergy-style
 * loop: department chips → streamed AI replies → escalation holding card →
 * end-of-chat feedback → "Start the chat again". Visually it clones the
 * concierge idiom (the sanctioned forest-dark AI surface, amber accents — AI
 * affordances are hardcoded amber, never `--action`).
 *
 * Transport: fetch POST → /api/support/chat, reading the SSE body via
 * ReadableStream (NOT EventSource — GET-only, no headers) and parsing the
 * AI SDK UI Message Stream v1 events the proxy pipes through. Foundry owns
 * the transcript (D2); this client keeps only a short-lived local copy +
 * the opaque conversationId so a reload within the resume window continues
 * the same conversation.
 */

type Department = "tech" | "sales" | "billing";

const DEPARTMENTS: { id: Department; label: string; icon: string }[] = [
  { id: "tech", label: "Tech Support", icon: "🖥️" },
  { id: "sales", label: "Sales Enquiry", icon: "💬" },
  { id: "billing", label: "Billing Enquiry", icon: "🧾" },
];

const BAD_REASONS = [
  "Didn't solve my problem",
  "Took too long",
  "Answer was wrong",
  "Something else",
];

type Message =
  | { kind: "user"; content: string }
  | { kind: "assistant"; content: string }
  | { kind: "escalation"; ticketId: string };

type Phase = "chat" | "feedback" | "ended";

/** Resume window for the locally-cached conversation (industry-standard ~1h). */
const RESUME_MS = 60 * 60 * 1000;

type StoredState = {
  conversationId: string | null;
  department: Department;
  messages: Message[];
  updatedAt: number;
};

function storageKey(venueId: string): string {
  return `p2e:support:${venueId}`;
}

function loadStored(venueId: string): StoredState | null {
  try {
    const raw = window.localStorage.getItem(storageKey(venueId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredState;
    if (!parsed?.department || Date.now() - parsed.updatedAt > RESUME_MS) {
      window.localStorage.removeItem(storageKey(venueId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function SparkleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="h-4 w-4 shrink-0"
    >
      <path d="M11.3 3.3a.75.75 0 0 1 1.4 0l1.1 3a4 4 0 0 0 2.4 2.4l3 1.1a.75.75 0 0 1 0 1.4l-3 1.1a4 4 0 0 0-2.4 2.4l-1.1 3a.75.75 0 0 1-1.4 0l-1.1-3a4 4 0 0 0-2.4-2.4l-3-1.1a.75.75 0 0 1 0-1.4l3-1.1a4 4 0 0 0 2.4-2.4l1.1-3ZM18.5 15.5a.6.6 0 0 1 1.1 0l.5 1.3a2 2 0 0 0 1.1 1.1l1.3.5a.6.6 0 0 1 0 1.1l-1.3.5a2 2 0 0 0-1.1 1.1l-.5 1.3a.6.6 0 0 1-1.1 0l-.5-1.3a2 2 0 0 0-1.1-1.1l-1.3-.5a.6.6 0 0 1 0-1.1l1.3-.5a2 2 0 0 0 1.1-1.1l.5-1.3Z" />
    </svg>
  );
}

export function SupportWidget({ venueId }: { venueId: string }) {
  const [open, setOpen] = useState(false);
  // Focus trap + initial focus + focus restoration + Escape + scroll lock while
  // open (declares aria-modal, so it gets the modal contract).
  const panelRef = useDialog<HTMLDivElement>(() => setOpen(false), open);
  const [department, setDepartment] = useState<Department | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [phase, setPhase] = useState<Phase>("chat");
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);

  // Restore a recent conversation once, on first open (resume window ~1h).
  if (open && !restoredRef.current) {
    restoredRef.current = true;
    const stored = typeof window !== "undefined" ? loadStored(venueId) : null;
    if (stored) {
      setDepartment(stored.department);
      setConversationId(stored.conversationId);
      setMessages(stored.messages);
    }
  }

  // Persist after every change so a reload within the window resumes.
  useEffect(() => {
    if (!department) return;
    try {
      window.localStorage.setItem(
        storageKey(venueId),
        JSON.stringify({
          conversationId,
          department,
          messages,
          updatedAt: Date.now(),
        } satisfies StoredState),
      );
    } catch {
      // Storage full/blocked — resume is a convenience, never load-bearing.
    }
  }, [venueId, department, conversationId, messages]);

  // Keep the newest message in view while streaming.
  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, streaming, phase]);

  function resetChat() {
    setDepartment(null);
    setConversationId(null);
    setMessages([]);
    setPhase("chat");
    setInput("");
    setError(null);
    setOffline(false);
    try {
      window.localStorage.removeItem(storageKey(venueId));
    } catch {
      // best-effort
    }
  }

  async function send(message: string) {
    const trimmed = message.trim();
    if (!trimmed || streaming || !department) return;
    setError(null);
    setMessages((current) => [...current, { kind: "user", content: trimmed }]);
    setInput("");
    setStreaming(true);

    try {
      const response = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, department, message: trimmed }),
      });

      if (!response.ok || !response.body) {
        if (response.status === 503) setOffline(true);
        else if (response.status === 429)
          setError("You're sending messages a little fast — try again shortly.");
        else setError("Something went wrong. Please try again.");
        return;
      }

      // Parse the SSE body (AI SDK UI Message Stream v1) incrementally.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantOpen = false;

      const handlePart = (part: {
        type?: string;
        delta?: string;
        errorText?: string;
        data?: { conversationId?: string; ticketId?: string };
      }) => {
        switch (part.type) {
          case "data-meta":
            if (part.data?.conversationId)
              setConversationId(part.data.conversationId);
            break;
          case "text-start":
            assistantOpen = true;
            setMessages((current) => [
              ...current,
              { kind: "assistant", content: "" },
            ]);
            break;
          case "text-delta":
            if (assistantOpen && part.delta) {
              const delta = part.delta;
              setMessages((current) => {
                const next = [...current];
                const last = next[next.length - 1];
                if (last?.kind === "assistant") {
                  next[next.length - 1] = {
                    kind: "assistant",
                    content: last.content + delta,
                  };
                }
                return next;
              });
            }
            break;
          case "text-end":
            assistantOpen = false;
            break;
          case "data-escalation":
            setMessages((current) => [
              ...current,
              { kind: "escalation", ticketId: part.data?.ticketId ?? "" },
            ]);
            break;
          case "error":
            setError(part.errorText ?? "Something went wrong.");
            break;
          default:
            break; // start / finish / unknown parts are structural no-ops
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const rawEvent = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          for (const line of rawEvent.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              handlePart(JSON.parse(data));
            } catch {
              // Skip malformed parts; the stream carries on.
            }
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
    } catch {
      setError("Connection dropped. Please try again.");
    } finally {
      setStreaming(false);
    }
  }

  const hasChatted = messages.some((message) => message.kind === "user");
  const departmentLabel = department
    ? DEPARTMENTS.find((d) => d.id === department)?.label
    : null;

  return (
    <>
      {/* Launcher FAB — the concierge launcher idiom, owner surface. */}
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-pill py-3 pl-4 pr-5 text-sm font-semibold text-white shadow-lift print:hidden"
          style={{ background: "linear-gradient(110deg,#13301f,#1d4a35)" }}
        >
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-pill bg-accent/20 text-accent">
            <SparkleIcon />
          </span>
          Support
        </button>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center lg:items-end lg:justify-end lg:bg-black/15 lg:p-6 print:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Support"
          onClick={() => setOpen(false)}
        >
          <div
            ref={panelRef}
            className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl text-concierge-ai-text sm:rounded-2xl lg:h-[min(660px,85dvh)] lg:w-[420px] lg:shadow-2xl"
            style={{
              background:
                "radial-gradient(130% 70% at 50% 0%, var(--color-concierge-glow), var(--color-forest-deepest) 72%)",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-concierge-ai-border px-5 py-4">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-white">
                  <span
                    className="text-accent"
                    style={{
                      filter:
                        "drop-shadow(0 0 6px color-mix(in srgb, var(--color-accent) 60%, transparent))",
                    }}
                  >
                    <SparkleIcon />
                  </span>
                  Support
                  <span className="rounded-md bg-accent px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-forest">
                    AI
                  </span>
                </h2>
                <p className="mt-1 font-mono text-xs text-concierge-mint">
                  {departmentLabel ?? "How can we help?"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {hasChatted && phase === "chat" ? (
                  <button
                    type="button"
                    onClick={() => setPhase("feedback")}
                    className="rounded-full border border-concierge-pill-border bg-concierge-pill-bg px-3 py-1 text-xs font-medium text-concierge-ai-text transition hover:bg-concierge-ai-bg"
                  >
                    End chat
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="rounded-full p-1 text-concierge-sage transition hover:bg-concierge-ai-bg hover:text-white"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Body */}
            <div
              ref={scrollRef}
              className="flex-1 space-y-4 overflow-y-auto px-5 py-4"
            >
              {phase === "ended" ? (
                <div className="space-y-4 pt-8 text-center">
                  <p className="text-sm text-concierge-ai-text">
                    Thanks for chatting with us.
                  </p>
                  <button
                    type="button"
                    onClick={resetChat}
                    className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-forest transition hover:opacity-90"
                  >
                    Start the chat again
                  </button>
                </div>
              ) : !department ? (
                <div className="space-y-3">
                  <div className="flex max-w-[90%] items-start gap-2">
                    <span className="mt-1 shrink-0 text-accent">
                      <SparkleIcon />
                    </span>
                    <p className="rounded-[16px_16px_16px_5px] border border-concierge-ai-border bg-concierge-ai-bg px-3 py-2 text-sm text-concierge-ai-text">
                      Hi! Which department do you need?
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {DEPARTMENTS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setDepartment(option.id)}
                        className="flex items-center gap-2 rounded-full border border-concierge-pill-border bg-concierge-pill-bg px-4 py-2.5 text-left text-sm font-medium text-concierge-ai-text transition hover:bg-concierge-ai-bg"
                      >
                        <span aria-hidden="true">{option.icon}</span>
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {!hasChatted ? (
                    <div className="flex max-w-[90%] items-start gap-2">
                      <span className="mt-1 shrink-0 text-accent">
                        <SparkleIcon />
                      </span>
                      <p className="rounded-[16px_16px_16px_5px] border border-concierge-ai-border bg-concierge-ai-bg px-3 py-2 text-sm text-concierge-ai-text">
                        You&rsquo;re through to {departmentLabel}. What&rsquo;s
                        going on?
                      </p>
                    </div>
                  ) : null}

                  {messages.map((message, index) =>
                    message.kind === "user" ? (
                      <p
                        key={index}
                        className="ml-auto max-w-[85%] whitespace-pre-wrap break-words rounded-[16px_16px_5px_16px] px-3 py-2 text-sm font-medium text-concierge-amber-ink"
                        style={{
                          background:
                            "linear-gradient(var(--color-concierge-amber-from), var(--color-concierge-amber-to))",
                        }}
                      >
                        {message.content}
                      </p>
                    ) : message.kind === "assistant" ? (
                      <div
                        key={index}
                        className="flex max-w-[90%] items-start gap-2"
                      >
                        <span className="mt-1 shrink-0 text-accent">
                          <SparkleIcon />
                        </span>
                        <p className="whitespace-pre-wrap break-words rounded-[16px_16px_16px_5px] border border-concierge-ai-border bg-concierge-ai-bg px-3 py-2 text-sm text-concierge-ai-text">
                          {message.content}
                        </p>
                      </div>
                    ) : (
                      // Escalation holding card — the Synergy "shortly" state.
                      <div
                        key={index}
                        className="rounded-card border border-concierge-ai-border bg-concierge-ai-bg px-4 py-3"
                      >
                        <p className="font-mono text-[11px] font-bold uppercase tracking-wide text-concierge-mint">
                          ● Ticket raised
                        </p>
                        <p className="mt-1 text-sm text-concierge-ai-text">
                          One of our representatives will be with you shortly.
                          You&rsquo;ll get a reply by email — no need to keep
                          this window open.
                        </p>
                      </div>
                    ),
                  )}

                  {streaming &&
                  messages[messages.length - 1]?.kind !== "assistant" ? (
                    <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-concierge-thinking">
                      <span className="p2e-spark text-accent" aria-hidden="true">
                        ✦
                      </span>
                      Thinking…
                    </p>
                  ) : null}

                  {offline ? (
                    <p className="text-sm text-concierge-sage">
                      Support is offline right now — please try again later.
                    </p>
                  ) : null}
                  {error ? (
                    <p className="text-sm text-error" role="alert">
                      {error}
                    </p>
                  ) : null}
                </>
              )}

              {phase === "feedback" ? (
                <FeedbackStep
                  conversationId={conversationId}
                  onDone={() => setPhase("ended")}
                />
              ) : null}
            </div>

            {/* Input footer */}
            {phase === "chat" && department && !offline ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void send(input);
                }}
                className="border-t border-concierge-ai-border px-5 py-4"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    maxLength={2000}
                    placeholder="Type your message…"
                    aria-label="Message support"
                    className="min-w-0 flex-1 rounded-full border border-concierge-ai-border bg-concierge-ai-bg px-4 py-2 font-mono text-sm text-concierge-ai-text placeholder:text-concierge-input focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <button
                    type="submit"
                    disabled={streaming || input.trim().length === 0}
                    aria-label="Send"
                    className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-accent text-base font-semibold text-forest transition disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {streaming ? <Spinner size="sm" /> : "↑"}
                  </button>
                </div>
                {hasChatted ? (
                  <button
                    type="button"
                    onClick={() => void send("I'd like to talk to a human.")}
                    disabled={streaming}
                    className="mt-2 text-xs text-concierge-sage underline transition hover:text-white disabled:opacity-50"
                  >
                    Talk to a human
                  </button>
                ) : null}
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * End-of-chat CSAT (Good/Bad; a Bad rating asks why — the researched recovery
 * pattern). Best-effort POST to the feedback proxy; skipping or a send failure
 * still ends the chat cleanly.
 */
function FeedbackStep({
  conversationId,
  onDone,
}: {
  conversationId: string | null;
  onDone: () => void;
}) {
  const [rating, setRating] = useState<"good" | "bad" | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    if (!rating || sending) return;
    setSending(true);
    try {
      if (conversationId) {
        await fetch("/api/support/feedback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            conversationId,
            rating,
            reason: rating === "bad" ? (reason ?? undefined) : undefined,
            comment: comment.trim() || undefined,
          }),
        });
      }
    } catch {
      // Best-effort — feedback failure never traps the user in the panel.
    } finally {
      onDone();
    }
  }

  return (
    <div className="rounded-card border border-concierge-ai-border bg-concierge-ai-bg px-4 py-3">
      <p className="text-sm font-medium text-concierge-ai-text">
        Before you go — how did we do?
      </p>
      <div className="mt-2 flex gap-2">
        {(
          [
            { id: "good", label: "👍 Good" },
            { id: "bad", label: "👎 Bad" },
          ] as const
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setRating(option.id)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              rating === option.id
                ? "border-accent bg-accent text-forest"
                : "border-concierge-pill-border bg-concierge-pill-bg text-concierge-ai-text hover:bg-concierge-ai-bg"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {rating === "bad" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {BAD_REASONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setReason(option)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                reason === option
                  ? "border-accent text-accent"
                  : "border-concierge-pill-border bg-concierge-pill-bg text-concierge-ai-text hover:bg-concierge-ai-bg"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}

      {rating ? (
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={1000}
          rows={2}
          placeholder="Anything else? (optional)"
          className="mt-3 w-full rounded-control border border-concierge-ai-border bg-concierge-ai-bg px-3 py-2 text-sm text-concierge-ai-text placeholder:text-concierge-input focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      ) : null}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!rating || sending}
          className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-forest transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sending ? "Sending…" : "Send feedback"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-concierge-sage underline transition hover:text-white"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
