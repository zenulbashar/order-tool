"use client";

import { useState, useTransition } from "react";

import { Button } from "@/app/_components/button";
import { cardStyles } from "@/app/_components/card";
import { cx } from "@/app/_components/cx";
import {
  CHANNEL_LABEL,
  GOAL_LABEL,
  MARKETING_CHANNELS,
  MARKETING_GOALS,
  MARKETING_TONES,
  type MarketingChannel,
  type MarketingDraft,
  type MarketingGoal,
  type MarketingTone,
  OFFER_MAX,
  TONE_LABEL,
  TOPIC_MAX,
} from "@/lib/marketing/core";

import { draftCopy, draftImage } from "./actions";

const eyebrow = "font-mono text-2xs font-bold uppercase tracking-wider text-label";
const field =
  "w-full rounded-[12px] border border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-muted focus:border-ink focus:outline-none disabled:opacity-60 sm:text-sm";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard blocked: the text is still selectable on screen.
        }
      }}
      className="rounded-pill border border-line px-3 py-1 text-xs font-semibold text-ink hover:border-ink"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function DraftCard({ draft }: { draft: MarketingDraft }) {
  const full =
    draft.channel === "instagram" && draft.hashtags.length > 0
      ? `${draft.body}\n\n${draft.hashtags.join(" ")}`
      : draft.headline && draft.channel === "email"
        ? `Subject: ${draft.headline}\n\n${draft.body}`
        : draft.body;
  return (
    <article className={cardStyles({ className: "flex flex-col gap-3" })}>
      <div className="flex items-center justify-between gap-3">
        <p className={eyebrow}>{CHANNEL_LABEL[draft.channel]}</p>
        <CopyButton text={full} />
      </div>
      {draft.headline ? (
        <p className="font-display text-base font-semibold text-ink">{draft.headline}</p>
      ) : null}
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{draft.body}</p>
      {draft.hashtags.length > 0 ? (
        <p className="text-xs text-muted">{draft.hashtags.join(" ")}</p>
      ) : null}
      <p className="text-micro text-muted">{draft.body.length} characters</p>
    </article>
  );
}

export function MarketingClient({
  copyEnabled,
  imageEnabled,
}: {
  copyEnabled: boolean;
  imageEnabled: boolean;
}) {
  const [goal, setGoal] = useState<MarketingGoal>("special");
  const [tone, setTone] = useState<MarketingTone>("warm");
  const [channels, setChannels] = useState<MarketingChannel[]>(["instagram", "facebook"]);
  const [topic, setTopic] = useState("");
  const [offer, setOffer] = useState("");
  const [withImage, setWithImage] = useState(false);
  const [drafts, setDrafts] = useState<MarketingDraft[] | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [imagePending, startImage] = useTransition();

  const disabled = !copyEnabled;
  const request = { goal, tone, channels, topic, offer };

  function toggleChannel(channel: MarketingChannel) {
    setChannels((current) =>
      current.includes(channel) ? current.filter((c) => c !== channel) : [...current, channel],
    );
  }

  function submit() {
    setError(null);
    setImageError(null);
    setImageUrl(null);
    startTransition(async () => {
      const result = await draftCopy(request);
      if (result.ok) {
        setDrafts(result.drafts);
      } else {
        setDrafts(null);
        setError(result.error);
      }
    });
    if (withImage && imageEnabled) {
      startImage(async () => {
        const result = await draftImage(request);
        if (result.ok) setImageUrl(result.url);
        else setImageError(result.error);
      });
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <form
        className={cardStyles({ className: "space-y-4 self-start" })}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {disabled ? (
          <p className="rounded-[12px] bg-surface p-3 text-sm text-muted">
            AI drafting isn&apos;t switched on for this deployment yet.
          </p>
        ) : null}

        <div>
          <label htmlFor="mk-goal" className={eyebrow}>
            What for
          </label>
          <select
            id="mk-goal"
            value={goal}
            onChange={(event) => setGoal(event.target.value as MarketingGoal)}
            disabled={disabled}
            className={cx(field, "mt-1.5")}
          >
            {MARKETING_GOALS.map((value) => (
              <option key={value} value={value}>
                {GOAL_LABEL[value]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="mk-topic" className={eyebrow}>
            Topic
          </label>
          <textarea
            id="mk-topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            maxLength={TOPIC_MAX}
            rows={3}
            disabled={disabled}
            placeholder="e.g. Our new mango tart is on the counter from Friday"
            className={cx(field, "mt-1.5 resize-none")}
          />
        </div>

        <div>
          <label htmlFor="mk-offer" className={eyebrow}>
            Offer (optional, stated exactly)
          </label>
          <input
            id="mk-offer"
            value={offer}
            onChange={(event) => setOffer(event.target.value)}
            maxLength={OFFER_MAX}
            disabled={disabled}
            placeholder="e.g. 2 for $12 this weekend"
            className={cx(field, "mt-1.5")}
          />
        </div>

        <div>
          <label htmlFor="mk-tone" className={eyebrow}>
            Tone
          </label>
          <select
            id="mk-tone"
            value={tone}
            onChange={(event) => setTone(event.target.value as MarketingTone)}
            disabled={disabled}
            className={cx(field, "mt-1.5")}
          >
            {MARKETING_TONES.map((value) => (
              <option key={value} value={value}>
                {TONE_LABEL[value]}
              </option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className={eyebrow}>Channels</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {MARKETING_CHANNELS.map((channel) => {
              const on = channels.includes(channel);
              return (
                <label
                  key={channel}
                  className={cx(
                    "cursor-pointer rounded-pill border px-3 py-1 text-xs font-semibold transition-colors",
                    on ? "border-ink bg-ink text-surface-elevated" : "border-line text-ink",
                    disabled && "opacity-60",
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    disabled={disabled}
                    onChange={() => toggleChannel(channel)}
                  />
                  {CHANNEL_LABEL[channel]}
                </label>
              );
            })}
          </div>
        </fieldset>

        {imageEnabled ? (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={withImage}
              disabled={disabled}
              onChange={(event) => setWithImage(event.target.checked)}
            />
            Draft an image too (square, no text)
          </label>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={disabled || channels.length === 0 || topic.trim().length < 3}
          loading={pending}
          loadingLabel="Drafting"
        >
          Draft copy
        </Button>
        {error ? (
          <p role="alert" className="text-sm text-muted">
            {error}
          </p>
        ) : null}
        <p className="text-micro text-muted">
          Drafts only use facts from your storefront and the brief above. Read
          them before you post; nothing is published from here.
        </p>
      </form>

      <div className="space-y-4">
        {imagePending || imageUrl || imageError ? (
          <section className={cardStyles({ className: "space-y-2" })}>
            <p className={eyebrow}>Image draft</p>
            {imagePending ? (
              <p className="text-sm text-muted">Drawing something up…</p>
            ) : imageUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- generated R2 asset, plain <img> like the rest of the media surfaces */}
                <img
                  src={imageUrl}
                  alt="Generated marketing image draft"
                  className="max-h-96 w-full max-w-md rounded-[12px] object-cover"
                />
                <a
                  href={imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-accent-deep underline-offset-2 hover:underline"
                >
                  Open full size
                </a>
              </>
            ) : (
              <p className="text-sm text-muted">{imageError}</p>
            )}
          </section>
        ) : null}

        {drafts ? (
          <div className="grid gap-4 md:grid-cols-2">
            {drafts.map((draft) => (
              <DraftCard key={draft.channel} draft={draft} />
            ))}
          </div>
        ) : (
          <div className="rounded-card border border-dashed border-line p-8 text-center text-sm text-muted">
            Your drafts appear here, one per channel, with a copy button each.
          </div>
        )}
      </div>
    </div>
  );
}
