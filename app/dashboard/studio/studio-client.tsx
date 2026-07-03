"use client";

import { useRef, useState } from "react";

import { Button } from "@/app/_components/button";
import { cx } from "@/app/_components/cx";

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

  // Caption shared alongside the image. Blank = use the suggested caption
  // derived from the current content, so it always reflects what's on screen
  // until the owner overrides it.
  const [caption, setCaption] = useState("");
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  const holderRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  function switchMode(next: StudioMode) {
    setMode(next);
    setPresetId(presetsFor(next)[0].id);
    setShareMsg(null);
  }

  const bannerData: BannerArtworkData = {
    venueName: menuData.venueName,
    brandColor: menuData.brandColor,
    headline,
    subtext,
    offerText,
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
  // Resolves null on any failure. No remote images in the artwork ⇒ the canvas
  // never taints, so toBlob always succeeds.
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
    "mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label";

  return (
    <section className="grid gap-6 px-5 py-8 lg:grid-cols-[300px_1fr]">
      {/* Controls */}
      <div className="space-y-4">
        <div className="inline-flex w-full gap-1 rounded-[10px] bg-sand p-1">
          {(["menu", "banner"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={cx(
                "flex-1 rounded-[7px] px-3 py-1.5 text-xs font-bold capitalize transition",
                mode === m
                  ? "bg-surface-elevated text-ink shadow-sm"
                  : "text-label hover:text-ink",
              )}
            >
              {m}
            </button>
          ))}
        </div>

        <label className="block">
          <span className={microLabel}>Size</span>
          <select
            value={presetId}
            onChange={(event) => setPresetId(event.target.value)}
            className={controlClass}
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} · {p.width}×{p.height}
              </option>
            ))}
          </select>
        </label>

        {mode === "banner" ? (
          <>
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
                placeholder="e.g. 20% OFF"
                className={controlClass}
              />
            </label>
          </>
        ) : (
          <p className="rounded-card border border-dashed border-line p-3 text-xs text-muted">
            The menu is built from your live categories, items and prices — edit
            them in the Menu editor and regenerate. Longer menus overflow into
            &ldquo;+ N more&rdquo;; pick a larger size to fit more.
          </p>
        )}

        <div className="space-y-2 border-t border-line pt-4">
          <p className={microLabel}>Download</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" size="sm" onClick={downloadPng} loading={busy}>
              PNG
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={downloadSvg}>
              SVG
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={printArtwork}>
              Print / PDF
            </Button>
          </div>
          <p className="text-[11px] text-muted">
            PNG &amp; SVG export at the exact pixel size. Print opens your
            browser&apos;s dialog — choose &ldquo;Save as PDF&rdquo; for print
            formats.
          </p>
        </div>

        {/* Publish — push the image straight to social apps + Google. */}
        <div className="space-y-2 border-t border-line pt-4">
          <p className={microLabel}>Publish</p>
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
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" size="sm" onClick={shareImage} loading={busy}>
              Share to apps
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={postToGoogle}>
              Post to Google
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={copyCaption}>
              Copy caption
            </Button>
          </div>
          {shareMsg ? (
            <p className="text-[11px] font-medium text-success-deep" role="status">
              {shareMsg}
            </p>
          ) : null}
          <p className="text-[11px] text-muted">
            On a phone, &ldquo;Share to apps&rdquo; posts straight to Instagram,
            Facebook, and more. &ldquo;Post to Google&rdquo; saves the image and
            opens your Business Profile to attach it.
          </p>
        </div>
      </div>

      {/* Live preview */}
      <div className="min-w-0">
        <div className="rounded-card border border-line bg-[repeating-conic-gradient(#f0ece1_0%_25%,transparent_0%_50%)] bg-[length:24px_24px] p-4">
          <div
            ref={holderRef}
            className="mx-auto flex max-h-[70vh] items-center justify-center overflow-hidden [&>svg]:h-auto [&>svg]:max-h-[70vh] [&>svg]:w-auto [&>svg]:max-w-full [&>svg]:shadow-card"
          >
            {mode === "menu" ? (
              <MenuArtwork data={menuData} preset={preset} />
            ) : (
              <BannerArtwork data={bannerData} preset={preset} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
