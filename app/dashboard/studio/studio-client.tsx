"use client";

import { useRef, useState, useTransition } from "react";

import { Button } from "@/app/_components/button";
import { cx } from "@/app/_components/cx";

import { generateBannerCopy } from "./actions";
import {
  BannerArtwork,
  type BannerArtworkData,
  MenuArtwork,
  type MenuArtworkData,
} from "./artwork";
import { presetsFor, type SizePreset, type StudioMode } from "./presets";

/** Serialize the rendered <svg> node to a standalone SVG document string. */
function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** iOS-style switch for the studio content toggles (design: Show prices…). */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 text-sm font-medium text-ink"
    >
      <span>{label}</span>
      <span
        className={cx(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-forest" : "bg-line-strong",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all",
            checked ? "left-[18px]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

/** A little aspect-ratio glyph for a size tile (portrait/landscape rectangle). */
function AspectGlyph({ width, height }: { width: number; height: number }) {
  const ar = width / height;
  const w = ar >= 1 ? 22 : Math.round(22 * ar);
  const h = ar >= 1 ? Math.round(22 / ar) : 22;
  return (
    <span
      className="block rounded-[2px] border-[1.5px] border-ink/55"
      style={{ width: w, height: h }}
    />
  );
}

export function StudioClient({
  slug,
  menuData,
}: {
  slug: string;
  menuData: MenuArtworkData;
}) {
  const [mode, setMode] = useState<StudioMode>("menu");
  const presets = presetsFor(mode);
  const [presetId, setPresetId] = useState(presets[0].id);
  const preset: SizePreset =
    presets.find((p) => p.id === presetId) ?? presets[0];

  // Banner copy (client-only; the studio generates artwork, it stores nothing).
  const [headline, setHeadline] = useState("Today at " + menuData.venueName);
  const [subtext, setSubtext] = useState("Order ahead — skip the queue.");
  const [offerText, setOfferText] = useState("");

  // AI banner copy (option A): Haiku drafts headline/subtext/offer from the
  // venue + an optional occasion, into the editable fields. Owner-initiated,
  // metered, and never auto-saved (there is nothing to save — it's artwork).
  const [occasion, setOccasion] = useState("");
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPending, startAi] = useTransition();

  function generateWithAi() {
    setAiError(null);
    startAi(async () => {
      const result = await generateBannerCopy({ occasion });
      if (!result.ok) {
        setAiError(result.error);
        return;
      }
      if (result.headline) setHeadline(result.headline);
      setSubtext(result.subtext);
      setOfferText(result.offer);
    });
  }

  // Caption shared alongside the image. Blank = use the suggested caption
  // derived from the current content, so it always reflects what's on screen
  // until the owner overrides it.
  const [caption, setCaption] = useState("");
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  const holderRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  // Content flexibility (client-only). The owner chooses which categories show
  // and whether prices / descriptions / the logo are drawn — the artwork is
  // regenerated from these without touching the live menu.
  const [includedCats, setIncludedCats] = useState<Set<string>>(
    () => new Set(menuData.categories.map((c) => c.name)),
  );
  const [showPrices, setShowPrices] = useState(true);
  const [showDescriptions, setShowDescriptions] = useState(true);
  const [showLogo, setShowLogo] = useState(true);

  const hasLogo = Boolean(menuData.logoDataUri);
  const logoOn = hasLogo && showLogo;

  function toggleCategory(name: string) {
    setIncludedCats((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function switchMode(next: StudioMode) {
    setMode(next);
    setPresetId(presetsFor(next)[0].id);
    setShareMsg(null);
  }

  // Menu artwork honours the owner's category picks + logo toggle.
  const filteredMenuData: MenuArtworkData = {
    ...menuData,
    logoDataUri: logoOn ? menuData.logoDataUri : null,
    categories: menuData.categories.filter((c) => includedCats.has(c.name)),
  };

  const bannerData: BannerArtworkData = {
    venueName: menuData.venueName,
    brandColor: menuData.brandColor,
    headline,
    subtext,
    offerText,
    logoDataUri: logoOn ? menuData.logoDataUri : null,
  };

  const suggestedCaption =
    mode === "banner"
      ? [offerText, headline, subtext, `— ${menuData.venueName}`]
          .filter(Boolean)
          .join("\n")
      : `Our menu at ${menuData.venueName} — order ahead and skip the queue.`;
  const effectiveCaption = caption.trim() || suggestedCaption;

  const baseName = `${slug}-${mode}-${preset.id}`;

  function currentSvg(): SVGSVGElement | null {
    return holderRef.current?.querySelector("svg") ?? null;
  }

  function downloadSvg() {
    const svg = currentSvg();
    if (!svg) return;
    triggerDownload(
      new Blob([serializeSvg(svg)], { type: "image/svg+xml" }),
      `${baseName}.svg`,
    );
  }

  // Rasterize the current SVG to a PNG Blob at the preset's exact pixel size.
  // Resolves null on any failure. The only image in the artwork is the logo,
  // inlined server-side as a same-origin data: URI ⇒ the canvas never taints,
  // so toBlob always succeeds.
  function renderPng(): Promise<Blob | null> {
    const svg = currentSvg();
    if (!svg) return Promise.resolve(null);
    const url = URL.createObjectURL(
      new Blob([serializeSvg(svg)], { type: "image/svg+xml" }),
    );
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = preset.width;
        canvas.height = preset.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, preset.width, preset.height);
        canvas.toBlob((out) => {
          URL.revokeObjectURL(url);
          resolve(out);
        }, "image/png");
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }

  async function downloadPng() {
    setBusy(true);
    const blob = await renderPng();
    if (blob) triggerDownload(blob, `${baseName}.png`);
    setBusy(false);
  }

  // Share the banner/menu PNG straight to any installed app (Instagram,
  // Facebook, Messages, Gmail…) via the Web Share API — the no-account path that
  // works today on phones. Desktop browsers without file-share fall back to a
  // PNG download + the caption to paste.
  async function shareImage() {
    setShareMsg(null);
    setBusy(true);
    const blob = await renderPng();
    setBusy(false);
    if (!blob) {
      setShareMsg("Couldn't render the image — try Download instead.");
      return;
    }
    const file = new File([blob], `${baseName}.png`, { type: "image/png" });
    const nav = navigator as Navigator & {
      canShare?: (data?: ShareData) => boolean;
    };
    if (nav.canShare?.({ files: [file] }) && nav.share) {
      try {
        await nav.share({ files: [file], text: effectiveCaption });
        setShareMsg("Shared.");
      } catch {
        // User cancelled the share sheet — say nothing.
      }
      return;
    }
    // No file-share support (most desktops): download + copy the caption.
    triggerDownload(blob, `${baseName}.png`);
    await copyCaption();
    setShareMsg(
      "Your browser can't share files — the image downloaded and the caption is copied. Upload it in your app.",
    );
  }

  // Google Business Profile has no share-target, so hand off: save the PNG and
  // open the GBP composer for the owner to attach it with the caption.
  async function postToGoogle() {
    setShareMsg(null);
    setBusy(true);
    const blob = await renderPng();
    setBusy(false);
    if (blob) triggerDownload(blob, `${baseName}.png`);
    await copyCaption();
    window.open("https://business.google.com/posts", "_blank", "noopener");
    setShareMsg(
      "Image saved and caption copied — attach it in the Google Business Profile post.",
    );
  }

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(effectiveCaption);
      return true;
    } catch {
      return false;
    }
  }

  // Print via a hidden iframe (no popup blocker), sized to the preset so
  // browser "Save as PDF" lands on the right page dimensions.
  function printArtwork() {
    const svg = currentSvg();
    if (!svg) return;
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) {
      iframe.remove();
      return;
    }
    const mmW = (preset.width / 96) * 25.4;
    const mmH = (preset.height / 96) * 25.4;
    doc.open();
    doc.write(
      `<!doctype html><html><head><style>@page{size:${mmW.toFixed(0)}mm ${mmH.toFixed(0)}mm;margin:0}html,body{margin:0;padding:0}svg{width:100%;height:auto;display:block}</style></head><body>${serializeSvg(svg)}</body></html>`,
    );
    doc.close();
    const win = iframe.contentWindow;
    if (win) {
      win.focus();
      win.print();
    }
    setTimeout(() => iframe.remove(), 1000);
  }

  const controlClass =
    "w-full rounded-input border border-line bg-surface-elevated px-2.5 py-2 text-sm text-ink shadow-sm focus-visible:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring-input)] focus-visible:outline-none";
  const microLabel =
    "mb-2 block font-mono text-[9px] font-bold uppercase tracking-wider text-label";
  const popBtn =
    "w-full justify-start rounded-control px-3 py-2 text-left text-sm font-semibold transition disabled:opacity-50";

  return (
    <section className="px-5 py-6 pb-24 lg:pb-6">
      {/* Toolbar — mode tabs (left), Download + Publish actions (right). */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="inline-flex gap-1 rounded-[10px] bg-sand p-1">
          {(["menu", "banner"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={cx(
                "rounded-[7px] px-4 py-1.5 text-xs font-bold capitalize transition",
                mode === m
                  ? "bg-surface-elevated text-ink shadow-sm"
                  : "text-label hover:text-ink",
              )}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="ml-auto hidden items-center gap-2 lg:flex">
          {/* Download disclosure (PNG / SVG / Print). */}
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-control border border-line-strong bg-surface-elevated px-3.5 py-2 text-sm font-semibold text-ink transition hover:bg-hover-secondary [&::-webkit-details-marker]:hidden">
              <span aria-hidden="true">↓</span> Download
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-56 space-y-1 rounded-card border border-line bg-surface-elevated p-2 shadow-card">
              <button type="button" onClick={downloadPng} disabled={busy} className={cx(popBtn, "text-ink hover:bg-hover-secondary")}>
                PNG image
              </button>
              <button type="button" onClick={downloadSvg} className={cx(popBtn, "text-ink hover:bg-hover-secondary")}>
                SVG (vector)
              </button>
              <button type="button" onClick={printArtwork} className={cx(popBtn, "text-ink hover:bg-hover-secondary")}>
                Print / PDF
              </button>
              <p className="px-3 pb-1 pt-1.5 text-[11px] text-muted">
                Exports at the exact pixel size. Print → choose &ldquo;Save as
                PDF&rdquo;.
              </p>
            </div>
          </details>

          {/* Publish disclosure (caption + share). */}
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-control bg-forest px-3.5 py-2 text-sm font-semibold text-white transition hover:opacity-90 [&::-webkit-details-marker]:hidden">
              Publish <span aria-hidden="true" className="text-[var(--color-accent)]">→</span>
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-72 space-y-2 rounded-card border border-line bg-surface-elevated p-3 shadow-card">
              <label className="block">
                <span className="mb-1 block text-[11px] text-muted">
                  Caption (shared with the image)
                </span>
                <textarea
                  rows={3}
                  value={caption}
                  placeholder={suggestedCaption}
                  onChange={(event) => setCaption(event.target.value)}
                  className={cx(controlClass, "resize-none")}
                />
              </label>
              <div className="grid grid-cols-1 gap-1.5">
                <Button type="button" variant="primary" size="sm" onClick={shareImage} loading={busy}>
                  Share to apps
                </Button>
                <div className="flex gap-1.5">
                  <Button type="button" variant="secondary" size="sm" onClick={postToGoogle}>
                    Post to Google
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={copyCaption}>
                    Copy caption
                  </Button>
                </div>
              </div>
              {shareMsg ? (
                <p className="text-[11px] font-medium text-success-deep" role="status">
                  {shareMsg}
                </p>
              ) : (
                <p className="text-[11px] text-muted">
                  On a phone this posts straight to Instagram, Facebook and more.
                </p>
              )}
            </div>
          </details>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Controls (below the preview on mobile, per the mobile design). */}
        <div className="order-2 space-y-6 lg:order-1">
          {mode === "banner" ? (
            <>
              {/* AI copy (option A) — amber is the sanctioned AI signature. */}
              <div className="space-y-2 rounded-card border border-accent/40 bg-accent/10 p-3">
                <div className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="text-accent-deep">✦</span>
                  <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-accent-deep">
                    Generate with AI
                  </span>
                </div>
                <textarea
                  value={occasion}
                  rows={2}
                  maxLength={160}
                  onChange={(event) => setOccasion(event.target.value)}
                  placeholder="Occasion or theme — e.g. weekend brunch, 20% off pastries"
                  className={cx(controlClass, "resize-none")}
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-muted">
                    Writes headline · subtext · offer
                  </span>
                  <button
                    type="button"
                    onClick={generateWithAi}
                    disabled={aiPending}
                    className="inline-flex items-center gap-1.5 rounded-control bg-[var(--color-accent)] px-3 py-1.5 text-xs font-bold text-forest transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span aria-hidden="true">✦</span>
                    {aiPending ? "Writing…" : "Generate"}
                  </button>
                </div>
                {aiError ? (
                  <p className="text-xs text-[var(--color-warm)]" role="alert">
                    {aiError}
                  </p>
                ) : null}
              </div>

              <label className="block">
                <span className={microLabel}>Headline</span>
                <input
                  value={headline}
                  maxLength={80}
                  onChange={(event) => setHeadline(event.target.value)}
                  className={controlClass}
                />
              </label>
              <label className="block">
                <span className={microLabel}>Subtext</span>
                <input
                  value={subtext}
                  maxLength={120}
                  onChange={(event) => setSubtext(event.target.value)}
                  className={controlClass}
                />
              </label>
              <label className="block">
                <span className={microLabel}>Offer badge (optional)</span>
                <input
                  value={offerText}
                  maxLength={24}
                  onChange={(event) => setOfferText(event.target.value)}
                  placeholder="e.g. 2 FOR 1"
                  className={controlClass}
                />
              </label>
              {hasLogo ? (
                <Toggle checked={showLogo} onChange={setShowLogo} label="Show logo" />
              ) : null}
            </>
          ) : (
            <>
              <div>
                <p className={microLabel}>Format &amp; size</p>
                <div className="grid grid-cols-3 gap-2">
                  {presets.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPresetId(p.id)}
                      aria-pressed={p.id === presetId}
                      className={cx(
                        "flex flex-col items-center justify-center gap-2 rounded-[11px] border p-3 transition",
                        p.id === presetId
                          ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                          : "border-line hover:border-line-strong",
                      )}
                    >
                      <span className="flex h-6 items-center justify-center">
                        <AspectGlyph width={p.width} height={p.height} />
                      </span>
                      <span className="text-center text-[10px] font-semibold leading-tight text-ink">
                        {p.short}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 border-t border-line pt-4">
                <p className={microLabel}>Content</p>
                <Toggle checked={showPrices} onChange={setShowPrices} label="Show prices" />
                <Toggle checked={showDescriptions} onChange={setShowDescriptions} label="Show descriptions" />
                {hasLogo ? (
                  <Toggle checked={showLogo} onChange={setShowLogo} label="Show logo" />
                ) : null}
              </div>

              <div className="border-t border-line pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className={cx(microLabel, "mb-0")}>Categories</span>
                  <span className="font-mono text-[9px] font-bold text-label">
                    {includedCats.size}/{menuData.categories.length}
                  </span>
                </div>
                <div className="space-y-0.5 rounded-input border border-line bg-surface-elevated p-1.5">
                  {menuData.categories.map((category) => {
                    const on = includedCats.has(category.name);
                    return (
                      <button
                        key={category.name}
                        type="button"
                        onClick={() => toggleCategory(category.name)}
                        aria-pressed={on}
                        className="flex w-full items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left transition hover:bg-hover-secondary"
                      >
                        <span
                          className={cx(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border",
                            on ? "border-forest bg-forest text-white" : "border-line-strong",
                          )}
                        >
                          {on ? (
                            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                              <path d="M2.5 6.5 5 9l4.5-5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : null}
                        </span>
                        <span className="flex-1 truncate text-sm text-ink">{category.name}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  Built from your live menu. Long menus auto-fit across columns;
                  only if they still won&apos;t fit does a small &ldquo;+ N
                  more&rdquo; appear.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Live preview (above the controls on mobile). */}
        <div className="order-1 min-w-0 lg:order-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
              {preset.short} · {preset.width} × {preset.height} px
            </span>
          </div>
          <div className="rounded-card border border-line bg-[repeating-conic-gradient(#f0ece1_0%_25%,transparent_0%_50%)] bg-[length:24px_24px] p-4">
            <div
              ref={holderRef}
              className="mx-auto flex max-h-[70vh] items-center justify-center overflow-hidden [&>svg]:h-auto [&>svg]:max-h-[70vh] [&>svg]:w-auto [&>svg]:max-w-full [&>svg]:shadow-card"
            >
              {mode === "menu" ? (
                <MenuArtwork
                  data={filteredMenuData}
                  preset={preset}
                  showPrices={showPrices}
                  showDescriptions={showDescriptions}
                />
              ) : (
                <BannerArtwork data={bannerData} preset={preset} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile action bar (design: Studio bottom bar). Desktop keeps the header
          Download/Publish disclosures above. */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-line bg-surface px-5 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 lg:hidden">
        <button
          type="button"
          onClick={downloadPng}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-control border border-line-strong bg-surface-elevated px-4 py-2.5 text-sm font-semibold text-ink transition disabled:opacity-50"
        >
          <span aria-hidden="true">↓</span> Download
        </button>
        <button
          type="button"
          onClick={shareImage}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-control bg-forest px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          Publish <span aria-hidden="true" className="text-[var(--color-accent)]">→</span>
        </button>
      </div>
    </section>
  );
}
