"use client";

import { useEffect, useReducer, useRef, useSyncExternalStore } from "react";

/**
 * Hero centerpiece: an auto-playing, re-runnable AI-concierge chat inside a
 * phone frame. A diner asks in plain language, the concierge streams a reply,
 * suggests dishes, one gets picked, a follow-up is answered, and a cart bar
 * slides up. Re-runs from the "Try it" chips. All motion respects
 * prefers-reduced-motion (snaps to the final state, no streaming).
 */

type Dish = { name: string; tag: string; price: string; grad: string };
type Script = {
  label: string;
  prompt: string;
  reply: string;
  dishes: Dish[];
  question: string;
  yes: string;
};

const SCRIPTS: Script[] = [
  {
    label: "Warming & veg, ~$18",
    prompt: "Something warming and vegetarian, around $18.",
    reply:
      "Three warming vegetarian picks under $18. The mushroom orzo is our most-loved right now.",
    dishes: [
      { name: "Wild Mushroom Orzo", tag: "Vegetarian", price: "$17", grad: "from-[#d8b26a] to-[#b07f2e]" },
      { name: "Pumpkin Dahl", tag: "Vegan · warming", price: "$16", grad: "from-[#e0a24a] to-[#c9772b]" },
      { name: "Roast Cauli Bowl", tag: "Veg · hearty", price: "$18", grad: "from-[#cdae74] to-[#8a6a34]" },
    ],
    question: "Want a side of miso soup with that?",
    yes: "Yes, add soup",
  },
  {
    label: "Spicy, no dairy, <$20",
    prompt: "Spicy, no dairy, under $20.",
    reply:
      "Two dairy-free dishes with real heat, both under $20. The chilli crisp eggs bring the most kick.",
    dishes: [
      { name: "Chilli Crisp Eggs", tag: "Dairy-free · hot", price: "$14", grad: "from-[#e08a3c] to-[#c14a24]" },
      { name: "Szechuan Noodles", tag: "Dairy-free · spicy", price: "$19", grad: "from-[#d97b3a] to-[#a83c22]" },
      { name: "Harissa Chicken", tag: "Dairy-free", price: "$19", grad: "from-[#dd9a4a] to-[#b45a26]" },
    ],
    question: "Turn up the heat with extra chilli?",
    yes: "Yes, extra chilli",
  },
  {
    label: "Light & high-protein",
    prompt: "Something light and high in protein.",
    reply:
      "Here are three light, protein-rich options. The seared tuna bowl is the lightest of the three.",
    dishes: [
      { name: "Seared Tuna Bowl", tag: "High protein", price: "$21", grad: "from-[#7fb0a0] to-[#3f7a63]" },
      { name: "Grilled Chicken Salad", tag: "Light · lean", price: "$18", grad: "from-[#9cbf7a] to-[#5c8a3f]" },
      { name: "Edamame & Tofu", tag: "Vegan protein", price: "$15", grad: "from-[#8bbf8a] to-[#4f8a5a]" },
    ],
    question: "Add a soft-boiled egg for extra protein?",
    yes: "Yes, add egg",
  },
];

type Phase =
  | "start"
  | "thinking"
  | "streaming"
  | "dishes"
  | "picked"
  | "question"
  | "answered"
  | "cart";

type State = {
  scriptIndex: number;
  phase: Phase;
  streamWords: number;
  runId: number;
};

type Action =
  | { type: "run"; scriptIndex: number }
  | { type: "phase"; phase: Phase }
  | { type: "stream"; words: number };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "run":
      return {
        scriptIndex: action.scriptIndex,
        phase: "thinking",
        streamWords: 0,
        runId: state.runId + 1,
      };
    case "phase":
      return { ...state, phase: action.phase };
    case "stream":
      return { ...state, phase: "streaming", streamWords: action.words };
    default:
      return state;
  }
}

const QUERY = "(prefers-reduced-motion: reduce)";
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}

export function ConciergeDemo() {
  const reduced = usePrefersReducedMotion();
  const [state, dispatch] = useReducer(reducer, {
    scriptIndex: 0,
    phase: "start",
    streamWords: 0,
    runId: 0,
  });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const script = SCRIPTS[state.scriptIndex];
  const replyWordCount = script.reply.split(" ").length;

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }
  function after(ms: number, fn: () => void) {
    timers.current.push(setTimeout(fn, ms));
  }

  // Drive the scripted timeline whenever a run starts.
  useEffect(() => {
    if (state.phase === "start") return;
    clearTimers();

    if (reduced) {
      // Snap straight to the finished state, no streaming.
      dispatch({ type: "stream", words: replyWordCount });
      dispatch({ type: "phase", phase: "cart" });
      return;
    }

    after(900, () => {
      // Stream the reply word by word.
      let w = 0;
      const step = () => {
        w += 1;
        dispatch({ type: "stream", words: w });
        if (w < replyWordCount) after(55, step);
        else {
          after(250, () => dispatch({ type: "phase", phase: "dishes" }));
          after(1100, () => dispatch({ type: "phase", phase: "picked" }));
          after(1700, () => dispatch({ type: "phase", phase: "question" }));
          after(3200, () => dispatch({ type: "phase", phase: "answered" }));
          after(3800, () => dispatch({ type: "phase", phase: "cart" }));
        }
      };
      step();
    });

    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.runId]);

  // Auto-play on first mount.
  useEffect(() => {
    const t = setTimeout(() => dispatch({ type: "run", scriptIndex: 0 }), 600);
    return () => clearTimeout(t);
  }, []);

  // Keep the transcript scrolled to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: reduced ? "auto" : "smooth",
    });
  }, [state.phase, state.streamWords, reduced]);

  const p = state.phase;
  const started = p !== "start";
  const streamedReply = script.reply
    .split(" ")
    .slice(0, state.streamWords)
    .join(" ");
  const showDishes = ["dishes", "picked", "question", "answered", "cart"].includes(p);
  const picked = ["picked", "question", "answered", "cart"].includes(p);
  const showQuestion = ["question", "answered", "cart"].includes(p);
  const answered = ["answered", "cart"].includes(p);
  const showCart = p === "cart";

  return (
    <div className="mx-auto w-full max-w-[388px]">
      {/* Phone */}
      <div className="rounded-[44px] bg-[#0C1C15] p-2.5 shadow-[0_40px_80px_-34px_rgba(13,29,22,0.75),0_0_0_1px_rgba(244,180,60,0.08)]">
        <div className="relative flex aspect-[9/18.6] flex-col overflow-hidden rounded-[35px] bg-gradient-to-b from-[#0f281e] to-[#0c1c15]">
          {/* Header */}
          <div className="relative shrink-0 bg-gradient-to-b from-[#143228] to-[#0f281e] px-4 pb-3 pt-3">
            <div className="mb-2 flex justify-between font-mono text-[10px] text-[#9fb0a2]">
              <span>9:41</span>
              <span>▚▚ 5G</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Mark />
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-extrabold text-[#f7f3ea]">
                  Maple &amp; Thyme
                </p>
                <p className="flex items-center gap-1.5 text-[11px] text-[#9fb0a2]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#3fa66a] [animation:p2e-pulse_2s_ease-in-out_infinite]" />
                  AI Concierge · online
                </p>
              </div>
              <span className="ml-auto rounded-full bg-[var(--color-accent)]/90 px-2 py-0.5 font-mono text-[9px] font-bold text-[#0c1c15]">
                TABLE 12
              </span>
            </div>
          </div>

          {/* Transcript */}
          <div
            ref={scrollRef}
            className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-3.5 py-4"
          >
            {started ? (
              <Bubble side="right">{script.prompt}</Bubble>
            ) : (
              <p className="m-auto text-center text-xs text-[#9fb0a2]">
                Starting a conversation…
              </p>
            )}

            {p === "thinking" ? <TypingDots /> : null}

            {(p === "streaming" ||
              showDishes ||
              showQuestion ||
              showCart) && state.streamWords > 0 ? (
              <Bubble side="left">
                {streamedReply}
                {p === "streaming" ? (
                  <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 bg-[var(--color-accent)] [animation:p2e-blink_1s_steps(2)_infinite]" />
                ) : null}
              </Bubble>
            ) : null}

            {showDishes ? (
              <div className="flex flex-col gap-2">
                {script.dishes.map((dish, i) => {
                  const isPicked = picked && i === 0;
                  return (
                    <div
                      key={dish.name}
                      className={`flex items-center gap-2.5 rounded-xl border p-2 transition [animation:p2e-msg-in_.34s_ease-out_both] ${
                        isPicked
                          ? "border-[#3fa66a] bg-[#3fa66a]/12"
                          : "border-white/10 bg-white/5"
                      }`}
                      style={{ animationDelay: `${i * 0.3}s` }}
                    >
                      <span
                        className={`h-12 w-12 shrink-0 rounded-lg bg-gradient-to-br ${dish.grad}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-[13px] font-extrabold text-[#f7f3ea]">
                          {dish.name}
                        </span>
                        <span className="block truncate text-[11px] text-[#9fb0a2]">
                          {dish.tag}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        {isPicked ? (
                          <span className="mb-0.5 block font-mono text-[8px] font-bold text-[#3fa66a]">
                            ✓ PICKED
                          </span>
                        ) : null}
                        <span className="font-display text-sm font-extrabold text-[#f7f3ea]">
                          {dish.price}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {showQuestion ? (
              <>
                <Bubble side="left">{script.question}</Bubble>
                <div className="flex flex-wrap gap-1.5">
                  <span
                    className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                      answered
                        ? "bg-[#3fa66a]/20 text-[#8fe0ac]"
                        : "bg-[var(--color-accent)] text-[#0c1c15]"
                    }`}
                  >
                    {answered ? "✓ " : ""}
                    {script.yes}
                  </span>
                  {!answered ? (
                    <span className="rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-semibold text-[#c9d4cb]">
                      No thanks
                    </span>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>

          {/* Cart bar */}
          <div
            className={`shrink-0 transition-all duration-300 ${
              showCart ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
            }`}
          >
            <div className="m-2.5 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#143228] to-[#0f281e] p-2.5 shadow-lg">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-accent)] font-display text-sm font-extrabold text-[#0c1c15] [animation:p2e-pop_.4s_ease-out]">
                {showCart ? "2" : "1"}
              </span>
              <span className="flex-1 text-sm font-semibold text-[#f7f3ea]">
                View order
              </span>
              <span className="font-display text-base font-extrabold text-[var(--color-accent)]">
                {showCart ? "$21" : "$17"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Try-it chips */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#9fb0a2]">
          Try it
        </span>
        {SCRIPTS.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => dispatch({ type: "run", scriptIndex: i })}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
              state.scriptIndex === i && started
                ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[#0c1c15]"
                : "border-white/15 text-[#c9d4cb] hover:bg-white/5"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Bubble({
  side,
  children,
}: {
  side: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <div className={`flex ${side === "right" ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] px-3 py-2 text-[13px] leading-snug [animation:p2e-msg-in_.34s_ease-out_both] ${
          side === "right"
            ? "rounded-[16px_16px_5px_16px] bg-gradient-to-br from-[#f4b43c] to-[#e79a24] font-medium text-[#16241c]"
            : "rounded-[16px_16px_16px_5px] bg-white/95 text-[#16241c]"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex justify-start">
      <div className="flex gap-1 rounded-[16px_16px_16px_5px] bg-white/95 px-3 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-[#8a9384] [animation:p2e-think_1s_ease-in-out_infinite]"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

function Mark() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-accent)]/15 [animation:p2e-float_5s_ease-in-out_infinite]">
      <span className="font-display text-sm font-extrabold text-[var(--color-accent)]">
        P
      </span>
    </span>
  );
}
